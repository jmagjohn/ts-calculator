/**
 * Calculator controller.
 *
 * The expression is a MathLive math-field (a Word-style structural editor:
 * fractions, exponents and roots create slots you can cursor into). We mirror
 * committed results into a read-only math-field, keep a history tape, and wire
 * the keypad, the drawer, and the options.
 *
 * Nothing is evaluated until `=` is pressed.
 */

import { MathfieldElement, type Selector } from "mathlive";
import { evaluate, toLatex, type AngleMode, type ResultFormat } from "../engine/engine";
import { KEYPAD_ROWS, type Key } from "./keypad";

interface HistoryEntry {
  latex: string;
  result: string;
}

const MAX_HISTORY = 12;

function must<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element as unknown as T;
}

/** Reusable segmented toggle: a group of buttons sharing one data-* attribute. */
function segmentedGroup(attribute: string) {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`),
  );

  return {
    onSelect(handler: (value: string) => void): void {
      for (const button of buttons) {
        button.addEventListener("click", () => handler(button.dataset[attribute] as string));
      }
    },
    render(active: string): void {
      for (const button of buttons) {
        const isActive = button.dataset[attribute] === active;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      }
    },
  };
}

/** A read-only math-field that renders LaTeX, for results and history rows. */
function renderMath(latex: string, className: string): MathfieldElement {
  const field = document.createElement("math-field") as MathfieldElement;
  field.setAttribute("read-only", "");
  field.className = className;
  field.value = latex;
  return field;
}

export function mountCalculator(): void {
  const input = must<MathfieldElement>("calc-input");
  const resultField = must<MathfieldElement>("calc-result");
  const keypadEl = must<HTMLDivElement>("keypad");
  const historyEl = must<HTMLUListElement>("history");
  const clearHistoryButton = must<HTMLButtonElement>("clear-history");
  const announcerEl = must<HTMLElement>("calc-announcer");
  const drawer = must<HTMLDialogElement>("drawer");
  const menuToggle = must<HTMLButtonElement>("menu-toggle");
  const drawerClose = must<HTMLButtonElement>("drawer-close");

  const angleGroup = segmentedGroup("angle");
  const formatGroup = segmentedGroup("format");

  let angleMode: AngleMode = "rad";
  let resultFormat: ResultFormat = "exact";
  let lastAnswer: number | null = null;
  const history: HistoryEntry[] = [];

  const focusInput = (): void => input.focus();

  function announce(message: string): void {
    announcerEl.textContent = message;
  }

  // -- rendering -----------------------------------------------------------

  function renderHistory(): void {
    historyEl.replaceChildren(
      ...history.map((entry) => {
        const item = document.createElement("li");
        item.className = "history__item";
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.title = "Load this expression";
        item.append(renderMath(`${entry.latex}=${entry.result}`, "history__math"));

        const load = (): void => {
          input.value = entry.latex;
          focusInput();
          drawer.close();
        };
        item.addEventListener("click", load);
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            load();
          }
        });
        return item;
      }),
    );
    clearHistoryButton.disabled = history.length === 0;
  }

  // -- behaviour -----------------------------------------------------------

  function equation(): void {
    const latex = input.value;
    if (latex.trim() === "") {
      return;
    }

    try {
      const evaluation = evaluate(latex, angleMode);
      const shown = toLatex(evaluation, resultFormat);
      resultField.value = shown;
      if (evaluation.value !== null) {
        lastAnswer = evaluation.value;
      }
      history.unshift({ latex, result: shown });
      history.splice(MAX_HISTORY);
      announce(`Result ${evaluation.decimal ?? "shown"}`);
    } catch {
      resultField.value = "\\text{Error}";
      announce("Error");
    }
    renderHistory();
    focusInput();
  }

  function runAction(name: string): void {
    if (name === "clear") {
      input.value = "";
      resultField.value = "";
      focusInput();
    } else if (name === "equals") {
      equation();
    } else if (name === "ans") {
      if (lastAnswer !== null) {
        input.insert(String(lastAnswer));
      }
    }
  }

  function createKeyButton(key: Key): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key";
    if (key.variant) {
      button.classList.add(`key--${key.variant}`);
    }
    button.textContent = key.label;
    button.setAttribute("aria-label", key.hint ?? key.label);
    if (key.kind === "insert") {
      button.dataset.insert = key.latex;
    } else if (key.kind === "command") {
      button.dataset.command = key.command;
    } else {
      button.dataset.action = key.action;
    }
    return button;
  }

  function buildKeypad(): void {
    keypadEl.replaceChildren(...KEYPAD_ROWS.flat().map((key) => createKeyButton(key)));
  }

  // -- events --------------------------------------------------------------

  keypadEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.key");
    if (!button) {
      return;
    }
    const { insert: latex, command: name, action: actionName } = button.dataset;
    if (latex !== undefined) {
      focusInput();
      input.insert(latex);
    } else if (name !== undefined) {
      focusInput();
      input.executeCommand(name as Selector);
    } else if (actionName !== undefined) {
      runAction(actionName);
    }
  });

  angleGroup.onSelect((value) => {
    angleMode = value as AngleMode;
    angleGroup.render(angleMode);
    focusInput();
  });

  formatGroup.onSelect((value) => {
    resultFormat = value as ResultFormat;
    formatGroup.render(resultFormat);
    focusInput();
  });

  clearHistoryButton.addEventListener("click", () => {
    history.length = 0;
    renderHistory();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      equation();
    }
  });

  menuToggle.addEventListener("click", () => {
    menuToggle.setAttribute("aria-expanded", "true");
    drawer.showModal();
  });

  drawerClose.addEventListener("click", () => drawer.close());

  drawer.addEventListener("close", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    focusInput();
  });

  // Clicking our own buttons must not blur the math-field, or the caret is lost.
  document.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".keypad, .seg, .history__item, #clear-history")) {
      event.preventDefault();
    }
  });

  // Clicking dead space reclaims focus so typing keeps working.
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("math-field, select, textarea, button, label, dialog")) {
      return;
    }
    focusInput();
  });

  buildKeypad();
  angleGroup.render(angleMode);
  formatGroup.render(resultFormat);
  renderHistory();

  // Desktop convenience; on touch devices we keep the OS keyboard away.
  if (!window.matchMedia("(pointer: coarse)").matches) {
    focusInput();
  }
}
