/**
 * Calculator tab controller.
 *
 * The expression is a MathLive math-field: a structural editor where
 * fractions, powers and roots create slots you can move the cursor into.
 * Nothing is evaluated until `=`. After `=`, the next key decides what happens:
 * a digit or function starts a new expression, an operator continues from Ans.
 */

import { MathfieldElement, type Selector } from "mathlive";
import {
  ANS_LATEX,
  CalcError,
  calculate,
  expandAns,
    prefersExact,
  solutionsLatex,
  toLatex,
  type Outcome,
} from "../engine/engine";
import { SCIENCE_PAGES, mainBody, topRow, type AfterResult, type Key } from "./keypad";
import { bindKeypad, createKeyButton } from "./keys";
import {
  circleWipe,
  fadeThrough,
  flashConfirm,
  riseIn,
  shake,
  staggerIn,
  zoomClose,
  zoomOpen,
} from "./motion";
import { MAX_HISTORY, load, save } from "./storage";

type Phase = "edit" | "result" | "error";

export interface CalculatorTab {
  focus(): void;
  renderHistory(): void;
  /** False while the settings window is open. */
  acceptsKeys(): boolean;
  equals(): void;
  clearAll(): void;
}

function must<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element as unknown as T;
}

/** Read-only math-field for history rows. */
function renderMath(latex: string, className: string): MathfieldElement {
  const field = document.createElement("math-field") as MathfieldElement;
  field.setAttribute("read-only", "");
  field.setAttribute("tabindex", "-1");
  field.className = className;
  field.value = latex;
  return field;
}

/** Hide MathLive's own chrome; our keypad is the only keyboard. */
function quietField(field: MathfieldElement): void {
  field.mathVirtualKeyboardPolicy = "manual";
  field.menuItems = [];
  field.popoverPolicy = "off";
}

export function mountCalculator(showCalcTab: () => void): CalculatorTab {
  const input = must<MathfieldElement>("calc-input");
  const resultField = must<MathfieldElement>("calc-result");
  const display = must<HTMLElement>("display");
  const errorEl = must<HTMLElement>("calc-error");
  const approxEl = must<HTMLElement>("calc-approx");
  const screen = must<HTMLElement>("display-screen");
  const announcer = must<HTMLElement>("calc-announcer");
  const angleChip = must<HTMLButtonElement>("angle-chip");
  const clearEntry = must<HTMLButtonElement>("clear-entry");
  const keypad = must<HTMLElement>("keypad");
  const keypadTop = must<HTMLElement>("keypad-top");
  const keypadBody = must<HTMLElement>("keypad-body");
  const settingsButton = must<HTMLButtonElement>("btn-settings");
  const copyButton = must<HTMLButtonElement>("btn-copy");
  const pasteButton = must<HTMLButtonElement>("btn-paste");
  const clearButton = must<HTMLButtonElement>("btn-clear");
  const settingsWindow = must<HTMLDialogElement>("settings-window");
  const historyList = must<HTMLUListElement>("history-list");
  const historyEmpty = must<HTMLElement>("history-empty");
  const clearHistoryButton = must<HTMLButtonElement>("clear-history");

  const saved = load();
  const settings = saved.settings;
  const history = saved.history;

  let phase: Phase = "edit";
  let secondMode = false;
  let sciPage = 0;
  let outcome: Outcome | null = null;
  let showingExact = true;

  quietField(input);
  quietField(resultField);
  input.smartFence = false;

  const announce = (message: string): void => {
    announcer.textContent = message;
  };
  const focusInput = (): void => input.focus();

  // -- display -------------------------------------------------------------

  function setPhase(next: Phase): void {
    phase = next;
    display.dataset.phase = next;
    if (next !== "error") {
      errorEl.textContent = "";
    }
    if (next !== "result") {
      resultField.value = "";
      approxEl.textContent = "";
      outcome = null;
      display.classList.remove("can-toggle");
    }
    fitAll();
  }

  /**
   * Scale a field's math to fit both its width and `maxHeight`, down to a
   * floor. The rendered math is measured directly: MathLive right-aligns it,
   * so overflow spills to the left where scrollWidth never sees it. If it
   * still does not fit, it is left-aligned so MathLive can scroll to the caret.
   */
  function fit(field: MathfieldElement, maxHeight: number): void {
    const root = field.shadowRoot;
    const latex = root?.querySelector<HTMLElement>(".ML__latex");
    const content = root?.querySelector<HTMLElement>("[part=content]");
    if (!latex || !content) {
      return;
    }
    field.style.setProperty("--fit", "1");
    const natural = latex.getBoundingClientRect();
    const width = content.clientWidth - 6;
    if (natural.width === 0 || width <= 0) {
      field.classList.remove("is-overflowing");
      return;
    }
    const factor = Math.max(0.42, Math.min(1, width / natural.width, maxHeight / natural.height));
    field.style.setProperty("--fit", factor.toFixed(3));
    field.classList.toggle("is-overflowing", natural.width * factor > width + 1);
  }

  function fitAll(): void {
    requestAnimationFrame(() => {
      const height = screen.clientHeight;
      if (phase === "result") {
        fit(input, height * 0.32);
        const used = input.offsetHeight + (approxEl.textContent ? approxEl.offsetHeight : 0);
        fit(resultField, Math.max(height - used - 6, 24));
      } else {
        fit(input, height - (phase === "error" ? errorEl.offsetHeight + 4 : 0));
      }
    });
  }

  function canToggle(): boolean {
    if (outcome?.kind === "value") {
      const { result } = outcome;
      return result.decimal !== null && result.exact !== result.decimal;
    }
    if (outcome?.kind === "solutions" && !outcome.approximate) {
      return outcome.solutions.some((s) => s.decimal !== null && s.exact !== s.decimal);
    }
    return false;
  }

  function resultLatex(exact: boolean): string {
    if (!outcome) {
      return "";
    }
    if (outcome.kind === "value") {
      return toLatex(outcome.result, exact);
    }
    if (outcome.kind === "solutions") {
      return solutionsLatex(outcome.variable, outcome.solutions, exact, outcome.approximate);
    }
    return outcome.value ? "\\text{True}" : "\\text{False}";
  }

  function preferExact(): boolean {
    if (outcome?.kind === "value") {
      return prefersExact(outcome.result, settings.format);
    }
    if (outcome?.kind === "solutions") {
      return outcome.solutions.every((s) => prefersExact(s, settings.format));
    }
    return true;
  }

  /** Small "≈ 0.3333" line under an exact answer. */
  function approxText(): string {
    if (!showingExact || !canToggle() || !outcome) {
      return "";
    }
    const show = (decimal: string | null): string =>
      decimal === null ? "?" : formatGrouped(decimal);
    if (outcome.kind === "value") {
      return `≈ ${show(outcome.result.decimal)}`;
    }
    if (outcome.kind === "solutions") {
      return `${outcome.variable} ≈ ${outcome.solutions.map((s) => show(s.decimal)).join(",  ")}`;
    }
    return "";
  }

  function showResult(animate: boolean): void {
    if (!outcome) {
      return;
    }
    resultField.value = resultLatex(showingExact);
    approxEl.textContent = approxText();
    const toggles = canToggle();
    resultField.title = toggles ? "Tap to switch fraction / decimal" : "";
    display.classList.toggle("can-toggle", toggles);
    fitAll();
    if (animate) {
      riseIn(resultField);
    }
  }

  function renderAngle(): void {
    const label = settings.angle.toUpperCase();
    angleChip.textContent = label;
    angleChip.setAttribute("aria-label", `Angle unit: ${label}. Tap to switch.`);
    keypad.querySelectorAll<HTMLElement>('[data-action="angle"]').forEach((key) => {
      key.innerHTML = `<span class="key__label">${label}</span>`;
    });
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="angle"]')) {
      radio.checked = radio.value === settings.angle;
    }
  }

  function toggleAngle(): void {
    settings.angle = settings.angle === "deg" ? "rad" : "deg";
    renderAngle();
    save();
    announce(settings.angle === "deg" ? "Degrees" : "Radians");
  }

  // -- keypad --------------------------------------------------------------

  function renderTop(): void {
    keypadTop.replaceChildren(...topRow(secondMode).map(createKeyButton));
    const second = keypadTop.querySelector<HTMLElement>('[data-action="second"]');
    second?.classList.toggle("is-on", secondMode);
    second?.setAttribute("aria-pressed", String(secondMode));
  }

  function renderBody(): void {
    keypadBody.classList.toggle("is-science", secondMode);
    if (!secondMode) {
      const grid = document.createElement("div");
      grid.className = "keygrid";
      grid.append(...mainBody().map(createKeyButton));
      keypadBody.replaceChildren(grid);
      return;
    }

    const tabs = document.createElement("div");
    tabs.className = "subtabs";
    tabs.setAttribute("role", "tablist");
    const pages = document.createElement("div");
    pages.className = "pages";

    SCIENCE_PAGES.forEach((page, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "subtab";
      tab.textContent = page.title;
      tab.setAttribute("role", "tab");
      tab.addEventListener("click", () => {
        pages.scrollTo({ left: index * pages.clientWidth, behavior: "smooth" });
      });
      tabs.append(tab);

      const grid = document.createElement("div");
      grid.className = "keygrid page";
      grid.setAttribute("role", "tabpanel");
      grid.setAttribute("aria-label", page.title);
      grid.append(...page.keys.map(createKeyButton));
      pages.append(grid);
    });

    const markTab = (): void => {
      sciPage = Math.round(pages.scrollLeft / Math.max(pages.clientWidth, 1));
      tabs.querySelectorAll(".subtab").forEach((tab, index) => {
        tab.classList.toggle("is-active", index === sciPage);
        tab.setAttribute("aria-selected", String(index === sciPage));
      });
    };
    pages.addEventListener("scroll", markTab, { passive: true });

    keypadBody.replaceChildren(tabs, pages);
    requestAnimationFrame(() => {
      pages.scrollLeft = sciPage * pages.clientWidth;
      markTab();
    });
    renderAngle();
  }

  function setSecond(on: boolean): void {
    if (secondMode === on) {
      return;
    }
    secondMode = on;
    void fadeThrough(keypadBody, renderBody);
    renderTop();
  }

  // -- editing -------------------------------------------------------------

  /** Called before any edit: decides how to leave the result screen. */
  function beginInput(after: AfterResult): void {
    if (phase === "result") {
      input.value = after === "chain" ? ANS_LATEX : "";
      input.position = input.lastOffset;
      setPhase("edit");
    } else if (phase === "error") {
      setPhase("edit");
    }
  }

  function insert(latex: string, after: AfterResult): void {
    beginInput(after);
    focusInput();
    input.insert(latex, { selectionMode: "placeholder", focus: true, scrollIntoView: true });
    fitAll();
  }

  /** One ( ) key: closes a group when one is open and a value precedes the caret. */
  function smartParen(): void {
    if (phase === "result") {
      insert("(", "fresh");
      return;
    }
    const before = input
      .getValue(0, input.position, "latex")
      .replace(/\\left\(/g, "(")
      .replace(/\\right\)/g, ")")
      .trim();
    const opens = (before.match(/\(/g) ?? []).length;
    const closes = (before.match(/\)/g) ?? []).length;
    // A value (digit, variable, constant, closing bracket) before the caret
    // means "close"; a function name like \\sin or an operator means "open".
    const valueBefore =
      !/\\(?!pi$|degree$)[a-zA-Z]+$/.test(before) && /([\w.)}!%]|\\pi|\\degree)$/.test(before);
    insert(opens > closes && valueBefore ? ")" : "(", "fresh");
  }

  function backspace(): void {
    if (phase !== "edit") {
      setPhase("edit");
    }
    focusInput();
    input.executeCommand("deleteBackward");
    fitAll();
  }

  function equals(): void {
    const latex = input.value;
    if (latex.trim() === "") {
      return;
    }
    try {
      outcome = calculate(latex, settings.angle, saved.ans);
      showingExact = preferExact();
      const shown = resultLatex(showingExact);
      if (outcome.kind === "value") {
        history.unshift({
          latex: expandAns(latex, saved.ans),
          exact: outcome.result.exact,
          decimal: outcome.result.decimal,
        });
        saved.ans = outcome.result.exact;
      } else {
        history.unshift({ latex: expandAns(latex, saved.ans), exact: shown, decimal: null, shown });
        if (outcome.kind === "solutions" && outcome.solutions[0]) {
          saved.ans = outcome.solutions[0].exact;
        }
      }
      history.splice(MAX_HISTORY);
      save();
      phase = "result";
      display.dataset.phase = "result";
      errorEl.textContent = "";
      showResult(true);
      announce(resultField.getValue("spoken-text"));
    } catch (error) {
      const message = error instanceof CalcError ? error.message : "Error";
      phase = "error";
      display.dataset.phase = "error";
      outcome = null;
      resultField.value = "";
      approxEl.textContent = "";
      errorEl.textContent = message;
      shake(display);
      announce(message);
    }
    fitAll();
    focusInput();
  }

  function clearAll(): void {
    input.value = "";
    setPhase("edit");
    focusInput();
  }

  function runKey(key: Key): void {
    const { action } = key;

    if (action.type === "insert") {
      insert(action.latex, action.after);
      if (secondMode) {
        setSecond(false);
      }
      return;
    }

    if (action.type === "command") {
      if (phase !== "edit") {
        setPhase("edit");
      }
      focusInput();
      input.executeCommand(action.command as Selector);
      return;
    }

    switch (action.action) {
      case "second":
        setSecond(!secondMode);
        break;
      case "equals":
        equals();
        break;
      case "paren":
        smartParen();
        break;
      case "ans":
        if (!saved.ans) {
          shake(display);
          return;
        }
        insert(ANS_LATEX, "fresh");
        if (secondMode) {
          setSecond(false);
        }
        break;
      case "angle":
        toggleAngle();
        break;
      case "backspace":
        backspace();
        break;
      case "done":
        break;
    }
  }

  bindKeypad(keypad, runKey);

  // -- toolbar -------------------------------------------------------------

  async function copy(): Promise<void> {
    let text = "";
    if (phase === "result" && outcome) {
      text =
        outcome.kind === "value" && !showingExact && outcome.result.decimal !== null
          ? outcome.result.decimal
          : resultField.getValue("ascii-math");
    } else {
      text = input.getValue("ascii-math");
    }
    if (text.trim() === "") {
      shake(copyButton);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flashConfirm(copyButton, "Copied");
    } catch {
      shake(copyButton);
    }
  }

  async function paste(): Promise<void> {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        shake(pasteButton);
        return;
      }
      const plainNumber = /^-?[\d,]*\.?\d+(e[-+]?\d+)?$/i.test(text);
      beginInput(plainNumber ? "fresh" : "chain");
      focusInput();
      if (plainNumber) {
        input.insert(text.replace(/,/g, ""), { focus: true });
      } else {
        input.insert(text.replace(/\*/g, "×"), { format: "ascii-math", focus: true });
      }
      fitAll();
      flashConfirm(pasteButton, "Pasted");
    } catch {
      shake(pasteButton);
    }
  }

  copyButton.addEventListener("click", () => void copy());
  pasteButton.addEventListener("click", () => void paste());
  clearButton.addEventListener("click", () => {
    const rect = clearButton.getBoundingClientRect();
    void circleWipe(display, { x: rect.left + rect.width / 2, y: rect.top }, clearAll);
  });
  clearEntry.addEventListener("click", clearAll);
  angleChip.addEventListener("click", toggleAngle);

  // Tap the result to flip between fraction and decimal.
  display.addEventListener("click", (event) => {
    if (phase !== "result" || !outcome || !canToggle()) {
      return;
    }
    if (!(event.target as HTMLElement).closest("#calc-result")) {
      return;
    }
    showingExact = !showingExact;
    void fadeThrough(resultField, () => showResult(false));
  });

  // -- settings window ---------------------------------------------------------

  async function closeSettings(): Promise<void> {
    await zoomClose(settingsWindow);
    settingsWindow.close();
  }

  settingsButton.addEventListener("click", () => {
    if (settingsWindow.open) {
      return;
    }
    syncSettingsForm();
    settingsWindow.showModal();
    zoomOpen(settingsWindow, settingsButton.getBoundingClientRect());
  });
  settingsWindow.querySelectorAll<HTMLElement>("[data-close]").forEach((button) =>
    button.addEventListener("click", () => void closeSettings()),
  );
  settingsWindow.addEventListener("click", (event) => {
    if (event.target === settingsWindow) {
      void closeSettings();
    }
  });
  settingsWindow.addEventListener("cancel", (event) => {
    event.preventDefault();
    void closeSettings();
  });
  settingsWindow.addEventListener("close", () => {
    settingsWindow.getAnimations().forEach((animation) => animation.cancel());
    focusInput();
  });

  settingsWindow.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === "angle") {
      settings.angle = target.value as typeof settings.angle;
      renderAngle();
    } else if (target.name === "format") {
      settings.format = target.value as typeof settings.format;
      if (outcome) {
        showingExact = preferExact();
        showResult(false);
      }
    } else if (target.name === "animations") {
      settings.animations = target.checked;
      applyMotion();
    }
    save();
  });

  function syncSettingsForm(): void {
    for (const radio of settingsWindow.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      const value = radio.name === "angle" ? settings.angle : settings.format;
      radio.checked = radio.value === value;
    }
    const animations = settingsWindow.querySelector<HTMLInputElement>('input[name="animations"]');
    if (animations) {
      animations.checked = settings.animations;
    }
  }

  function applyMotion(): void {
    document.documentElement.dataset.motion = settings.animations ? "on" : "off";
  }

  // -- history page ------------------------------------------------------------

  function renderHistory(): void {
    historyList.replaceChildren(
      ...history.map((entry) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history__row";
        const asEvaluation = { ...entry, value: 0 };
        const shownResult = toLatex(asEvaluation, prefersExact(asEvaluation, settings.format));
        button.append(
          renderMath(entry.latex, "history__expr"),
          renderMath(entry.shown ?? `=${shownResult}`, "history__result"),
        );
        button.setAttribute("aria-label", "Use this calculation again");
        button.addEventListener("click", () => {
          input.value = entry.latex;
          setPhase("edit");
          showCalcTab();
          focusInput();
        });
        item.append(button);
        return item;
      }),
    );
    historyEmpty.hidden = history.length > 0;
    clearHistoryButton.disabled = history.length === 0;
    staggerIn(historyList.children);
  }

  clearHistoryButton.addEventListener("click", () => {
    history.length = 0;
    save();
    renderHistory();
  });

  // -- keyboard ------------------------------------------------------------

  // After a result, a typed digit starts fresh and an operator chains from Ans.
  input.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (phase === "result") {
        if (/^[-+*/^!%]$/.test(event.key)) {
          beginInput("chain");
        } else if (/^[\w.(]$/.test(event.key)) {
          beginInput("fresh");
        } else if (event.key === "Backspace") {
          setPhase("edit");
        }
      } else if (phase === "error" && event.key.length === 1) {
        setPhase("edit");
      }
    },
    { capture: true },
  );

  input.addEventListener("input", fitAll);

  // Our own buttons must not steal focus from the math-field.
  document.getElementById("page-calc")?.addEventListener("mousedown", (event) => {
    if ((event.target as HTMLElement).closest(".toolbar, .display button")) {
      event.preventDefault();
    }
  });

  // -- boot ----------------------------------------------------------------

  applyMotion();
  syncSettingsForm();
  renderTop();
  renderBody();
  renderAngle();
  setPhase("edit");

  return {
    focus(): void {
      // On touch devices focusing would do nothing useful; on desktop it lets you type.
      if (!window.matchMedia("(pointer: coarse)").matches) {
        focusInput();
      }
      fitAll();
    },
    renderHistory,
    acceptsKeys(): boolean {
      return !settingsWindow.open;
    },
    equals,
    clearAll,
  };
}

/** "1234567.5" -> "1,234,567.5"; "1.5e-7" -> "1.5 × 10^-7"; minus as U+2212. */
function formatGrouped(decimal: string): string {
  const [mantissa, exponent] = decimal.split("e");
  const negative = mantissa.startsWith("-");
  const [whole, fraction] = mantissa.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `${negative ? "−" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
  return exponent === undefined ? text : `${text} × 10^${Number(exponent)}`;
}
