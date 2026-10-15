/**
 * Calculator controller.
 *
 * The expression lives in a real <input>, so editing (caret placement, click
 * to cursor, arrows, Home/End, drag-select, Ctrl+A, native backspace/delete)
 * is the platform's job — not ours. We only: mirror the input into a live
 * result preview, insert text at the caret from the keypad, and run the engine.
 */

import {
  evaluateExpression,
  toDisplay,
  toFraction,
  type AngleMode,
} from "../engine/engine";
import { KEYPAD_ROWS, type Key, type KeyAction } from "./keypad";

type ResultFormat = "decimal" | "fraction";

interface HistoryEntry {
  expression: string;
  result: string;
}

const MAX_EXPRESSION = 240;
const MAX_HISTORY = 24;

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

export function mountCalculator(): void {
  const expressionInput = must<HTMLInputElement>("calc-expression");
  const resultEl = must<HTMLElement>("calc-result");
  const keypadEl = must<HTMLDivElement>("keypad");
  const historyEl = must<HTMLUListElement>("history");
  const clearHistoryButton = must<HTMLButtonElement>("clear-history");
  const statusAngleEl = must<HTMLElement>("status-angle");
  const statusFormatEl = must<HTMLElement>("status-format");
  const announcerEl = must<HTMLElement>("calc-announcer");

  const angleGroup = segmentedGroup("angle");
  const formatGroup = segmentedGroup("format");

  let angleMode: AngleMode = "rad";
  let resultFormat: ResultFormat = "decimal";
  let lastAnswer: number | null = null;
  let errorMessage: string | null = null;
  const history: HistoryEntry[] = [];

  const expression = (): string => expressionInput.value;
  const extraScope = (): Record<string, unknown> =>
    lastAnswer === null ? {} : { ans: lastAnswer };

  function focusExpression(): void {
    expressionInput.focus();
  }

  function setCaret(index: number): void {
    const clamped = Math.max(0, Math.min(index, expressionInput.value.length));
    expressionInput.setSelectionRange(clamped, clamped);
  }

  /** Announce committed results/errors to assistive tech (not the live preview). */
  function announce(message: string): void {
    announcerEl.textContent = message;
  }

  function formatResult(value: unknown): string {
    if (resultFormat === "fraction") {
      const fraction = toFraction(value);
      if (fraction !== null) {
        return fraction;
      }
    }
    return toDisplay(value);
  }

  // -- rendering -----------------------------------------------------------

  function renderDisplay(): void {
    resultEl.classList.remove("display__result--error");

    if (errorMessage) {
      resultEl.textContent = "ERROR";
      resultEl.title = errorMessage;
      resultEl.classList.add("display__result--error");
      return;
    }

    resultEl.title = "";
    if (expression().trim() === "") {
      resultEl.textContent = "0";
      return;
    }

    try {
      resultEl.textContent = formatResult(
        evaluateExpression(expression(), angleMode, extraScope()),
      );
    } catch {
      resultEl.textContent = ""; // mid-typing; not worth shouting about
    }
  }

  function renderControls(): void {
    angleGroup.render(angleMode);
    formatGroup.render(resultFormat);
    statusAngleEl.textContent = angleMode.toUpperCase();
    statusFormatEl.textContent = resultFormat === "fraction" ? "FRAC" : "DEC";
  }

  function renderHistory(): void {
    historyEl.replaceChildren(
      ...history.map((entry) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history__item";
        button.title = "Load this expression";
        button.innerHTML =
          `<span class="history__expr">${escapeHtml(entry.expression)}</span>` +
          `<span class="history__result">${escapeHtml(entry.result)}</span>`;
        button.addEventListener("click", () => {
          replaceExpression(entry.expression, entry.expression.length);
        });
        item.append(button);
        return item;
      }),
    );
    clearHistoryButton.disabled = history.length === 0;
  }

  // -- state mutations -----------------------------------------------------

  /** Replace the whole expression (clamped) and park the caret, then repaint. */
  function replaceExpression(next: string, caret: number): void {
    expressionInput.value = next.slice(0, MAX_EXPRESSION);
    errorMessage = null;
    focusExpression();
    setCaret(caret);
    renderDisplay();
  }

  /** Insert text at the caret (keypad path), replacing any selection. */
  function insert(text: string): void {
    const start = expressionInput.selectionStart ?? expressionInput.value.length;
    const end = expressionInput.selectionEnd ?? start;
    const value = expressionInput.value;
    const merged = (value.slice(0, start) + text + value.slice(end)).slice(0, MAX_EXPRESSION);
    replaceExpression(merged, Math.min(start + text.length, merged.length));
  }

  function clear(): void {
    replaceExpression("", 0);
  }

  function backspace(): void {
    const value = expressionInput.value;
    const start = expressionInput.selectionStart ?? value.length;
    const end = expressionInput.selectionEnd ?? start;
    if (start === end) {
      if (start === 0) {
        return;
      }
      replaceExpression(value.slice(0, start - 1) + value.slice(start), start - 1);
    } else {
      replaceExpression(value.slice(0, start) + value.slice(end), start);
    }
  }

  function negate(): void {
    const value = expression();
    const caret = expressionInput.selectionStart ?? value.length;
    if (value.startsWith("-")) {
      replaceExpression(value.slice(1), Math.max(0, caret - 1));
    } else {
      replaceExpression(`-${value}`, caret + 1);
    }
  }

  function equation(): void {
    const current = expression();
    if (current.trim() === "") {
      return;
    }
    try {
      const value = evaluateExpression(current, angleMode, extraScope());
      const display = formatResult(value);
      if (typeof value === "number" && Number.isFinite(value)) {
        lastAnswer = value;
      }
      history.unshift({ expression: current, result: display });
      history.splice(MAX_HISTORY);
      replaceExpression(display, display.length);
      announce(`Result ${display}`);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      announce(`Error: ${errorMessage}`);
      renderDisplay();
    }
    renderHistory();
  }

  function runAction(name: KeyAction): void {
    switch (name) {
      case "clear":
        return clear();
      case "backspace":
        return backspace();
      case "equals":
        return equation();
      case "negate":
        return negate();
      case "ans":
        return insert(lastAnswer === null ? "0" : String(lastAnswer));
      case "square": {
        const value = expression();
        const next = value.trim() ? `(${value})^2` : "^2";
        return replaceExpression(next, next.length);
      }
      case "inverse": {
        const value = expression();
        const next = value.trim() ? `1/(${value})` : "1/";
        return replaceExpression(next, next.length);
      }
    }
  }

  // -- keypad + events -----------------------------------------------------

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
      button.dataset.insert = key.text;
    } else {
      button.dataset.action = key.action;
    }
    return button;
  }

  function buildKeypad(): void {
    keypadEl.replaceChildren(...KEYPAD_ROWS.flat().map((key) => createKeyButton(key)));
  }

  keypadEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.key");
    if (!button) {
      return;
    }
    const { insert: text, action } = button.dataset;
    if (text !== undefined) {
      insert(text);
    } else if (action) {
      runAction(action as KeyAction);
    }
  });

  angleGroup.onSelect((value) => {
    angleMode = value as AngleMode;
    renderControls();
    renderDisplay();
  });

  formatGroup.onSelect((value) => {
    resultFormat = value as ResultFormat;
    renderControls();
    renderDisplay();
  });

  clearHistoryButton.addEventListener("click", () => {
    history.length = 0;
    renderHistory();
  });

  // Typing and cursor movement are native; we only intercept the two commit keys.
  expressionInput.addEventListener("input", () => {
    errorMessage = null;
    renderDisplay();
  });

  expressionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "=") {
      equation();
      event.preventDefault();
    } else if (event.key === "Escape") {
      clear();
      event.preventDefault();
    }
  });

  // Clicking our own buttons must not steal focus from the input, or the caret dies.
  document.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".keypad, .seg, #clear-history")) {
      event.preventDefault();
    }
  });

  // Clicking dead space reclaims focus so typing keeps working.
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, select, textarea, button, label")) {
      return;
    }
    focusExpression();
  });

  buildKeypad();
  renderControls();
  renderHistory();
  renderDisplay();
  focusExpression();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
