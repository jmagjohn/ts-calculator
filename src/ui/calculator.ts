/**
 * Calculator controller.
 *
 * The expression is a MathLive math-field: a structural editor where
 * fractions, powers and roots create slots you can move the cursor into.
 * Nothing is evaluated until `=`. After `=`, the next key decides what happens:
 * a digit or function starts a new expression, an operator continues from Ans.
 */

import { MathfieldElement, type Selector } from "mathlive";
import {
  ANS_LATEX,
  expandAns,
  CalcError,
  evaluate,
  prefersExact,
  toLatex,
  type Evaluation,
} from "../engine/engine";
import { SCIENCE_PAGES, mainBody, topRow, type AfterResult, type Key } from "./keypad";
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
import { MAX_HISTORY, load, save, type HistoryEntry } from "./storage";

type Phase = "edit" | "result" | "error";

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

export function mountCalculator(): void {
  const input = must<MathfieldElement>("calc-input");
  const resultField = must<MathfieldElement>("calc-result");
  const display = must<HTMLElement>("display");
  const errorEl = must<HTMLElement>("calc-error");
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
  const historyButton = must<HTMLButtonElement>("btn-history");
  const settingsWindow = must<HTMLDialogElement>("settings-window");
  const historyWindow = must<HTMLDialogElement>("history-window");
  const historyList = must<HTMLUListElement>("history-list");
  const historyEmpty = must<HTMLElement>("history-empty");
  const clearHistoryButton = must<HTMLButtonElement>("clear-history");
  const startButton = must<HTMLButtonElement>("start-button");
  const startMenu = must<HTMLElement>("start-menu");
  const trayAngle = must<HTMLButtonElement>("tray-angle");
  const clock = must<HTMLElement>("clock");
  const shutdown = must<HTMLElement>("shutdown");

  const saved = load();
  const settings = saved.settings;
  const history: HistoryEntry[] = saved.history;
  let ans: string | null = saved.ans;

  let phase: Phase = "edit";
  let secondMode = false;
  let cursorMode = false;
  let sciPage = 0;
  let evaluation: Evaluation | null = null;
  let showingExact = true;

  quietField(input);
  quietField(resultField);
  input.smartFence = false;

  const persist = (): void => save({ settings, history, ans });
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
    if (next === "edit") {
      resultField.value = "";
      evaluation = null;
    }
    fitAll();
  }

  /** Shrink long expressions so they fit, down to a floor, then scroll. */
  function fit(field: MathfieldElement): void {
    const content = field.shadowRoot?.querySelector<HTMLElement>("[part=content]");
    if (!content) {
      return;
    }
    const steps = [1, 0.86, 0.74, 0.64, 0.55];
    for (const step of steps) {
      field.style.setProperty("--fit", String(step));
      if (content.scrollWidth <= content.clientWidth + 1) {
        break;
      }
    }
  }

  function fitAll(): void {
    requestAnimationFrame(() => {
      fit(input);
      fit(resultField);
    });
  }

  function showResult(animate: boolean): void {
    if (!evaluation) {
      return;
    }
    resultField.value = toLatex(evaluation, showingExact);
    resultField.title =
      evaluation.decimal !== null && evaluation.exact !== evaluation.decimal
        ? "Tap to switch fraction / decimal"
        : "";
    display.classList.toggle("can-toggle", resultField.title !== "");
    fitAll();
    if (animate) {
      riseIn(resultField);
    }
  }

  function renderAngle(): void {
    const label = settings.angle.toUpperCase();
    angleChip.textContent = label;
    trayAngle.textContent = label;
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
    persist();
    announce(settings.angle === "deg" ? "Degrees" : "Radians");
  }

  // -- keypad --------------------------------------------------------------

  function createKey(key: Key): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `key key--${key.variant ?? "num"}`;
    button.innerHTML = `<span class="key__label">${key.label}</span>`;
    button.setAttribute("aria-label", key.aria);
    if (key.colSpan) {
      button.style.gridColumn = `span ${key.colSpan}`;
    }
    if (key.rowSpan) {
      button.style.gridRow = `span ${key.rowSpan}`;
    }
    if (key.action.type === "app") {
      button.dataset.action = key.action.action;
    }
    if (key.repeat) {
      button.dataset.repeat = "";
    }
    keyMap.set(button, key);
    return button;
  }

  const keyMap = new WeakMap<HTMLElement, Key>();

  function renderTop(): void {
    keypadTop.replaceChildren(...topRow(secondMode).map(createKey));
    const second = keypadTop.querySelector<HTMLElement>('[data-action="second"]');
    second?.classList.toggle("is-on", secondMode);
    second?.setAttribute("aria-pressed", String(secondMode));
    const cursor = keypadTop.querySelector<HTMLElement>('[data-action="cursor"]');
    cursor?.classList.toggle("is-on", cursorMode);
    cursor?.setAttribute("aria-pressed", String(cursorMode));
  }

  function renderBody(): void {
    keypadBody.classList.toggle("is-science", secondMode);
    if (!secondMode) {
      const grid = document.createElement("div");
      grid.className = "keygrid";
      grid.append(...mainBody(cursorMode).map(createKey));
      keypadBody.replaceChildren(grid);
      return;
    }

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    tabs.setAttribute("role", "tablist");
    const pages = document.createElement("div");
    pages.className = "pages";

    SCIENCE_PAGES.forEach((page, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
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
      grid.append(...page.keys.map(createKey));
      pages.append(grid);
    });

    const markTab = (): void => {
      sciPage = Math.round(pages.scrollLeft / Math.max(pages.clientWidth, 1));
      tabs.querySelectorAll(".tab").forEach((tab, index) => {
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

  function renderKeypad(): void {
    renderTop();
    renderBody();
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
    const valueBefore = /([\d.)}!%]|\\pi|e|Ans\}|\\degree)$/.test(before);
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
      evaluation = evaluate(latex, settings.angle, ans);
      showingExact = prefersExact(evaluation, settings.format);
      history.unshift({
        latex: expandAns(latex, ans),
        exact: evaluation.exact,
        decimal: evaluation.decimal,
      });
      ans = evaluation.exact;
      history.splice(MAX_HISTORY);
      persist();
      phase = "result";
      display.dataset.phase = "result";
      errorEl.textContent = "";
      showResult(true);
      announce(`Equals ${evaluation.decimal ?? resultField.getValue("spoken-text")}`);
    } catch (error) {
      const message = error instanceof CalcError ? error.message : "Error";
      phase = "error";
      display.dataset.phase = "error";
      resultField.value = "";
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
    if (navigator.vibrate) {
      navigator.vibrate(6);
    }

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
      case "cursor":
        cursorMode = !cursorMode;
        renderTop();
        if (secondMode) {
          setSecond(false);
        } else {
          void fadeThrough(keypadBody, renderBody);
        }
        break;
      case "equals":
        equals();
        break;
      case "paren":
        smartParen();
        break;
      case "ans":
        if (!ans) {
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
    }
  }

  // Press feedback (AN-06) and hold-to-repeat, via pointer events.
  let repeatTimer = 0;
  let suppressClick: HTMLElement | null = null;

  const stopRepeat = (): void => {
    window.clearTimeout(repeatTimer);
    window.clearInterval(repeatTimer);
  };

  keypad.addEventListener("pointerdown", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(".key");
    if (!button) {
      return;
    }
    event.preventDefault(); // keep focus (and the caret) in the math-field
    button.classList.add("is-down");
    const key = keyMap.get(button);
    if (key?.repeat) {
      runKey(key);
      suppressClick = button;
      stopRepeat();
      repeatTimer = window.setTimeout(() => {
        repeatTimer = window.setInterval(() => runKey(key), 70);
      }, 420);
    }
  });

  const release = (event: PointerEvent): void => {
    stopRepeat();
    for (const button of keypad.querySelectorAll(".is-down")) {
      if (event.type !== "pointerleave" || button === event.target) {
        button.classList.remove("is-down");
      }
    }
  };
  for (const type of ["pointerup", "pointercancel"] as const) {
    window.addEventListener(type, release);
  }
  keypad.addEventListener("pointerleave", release);

  keypad.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(".key");
    if (!button) {
      return;
    }
    if (suppressClick === button) {
      suppressClick = null;
      return;
    }
    const key = keyMap.get(button);
    if (key) {
      runKey(key);
    }
  });

  // -- toolbar -------------------------------------------------------------

  async function copy(): Promise<void> {
    let text = "";
    if (phase === "result" && evaluation) {
      text = showingExact || evaluation.decimal === null
        ? resultField.getValue("ascii-math")
        : evaluation.decimal;
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
  trayAngle.addEventListener("click", toggleAngle);

  // Tap the result to flip between fraction and decimal.
  display.addEventListener("click", (event) => {
    if (phase !== "result" || !evaluation || !display.classList.contains("can-toggle")) {
      return;
    }
    if (!(event.target as HTMLElement).closest("#calc-result")) {
      return;
    }
    showingExact = !showingExact;
    void fadeThrough(resultField, () => showResult(false));
  });

  // -- windows -------------------------------------------------------------

  function openWindow(win: HTMLDialogElement, origin?: HTMLElement): void {
    closeStartMenu();
    if (win.open) {
      return;
    }
    win.showModal();
    zoomOpen(win, origin?.getBoundingClientRect());
  }

  async function closeWindow(win: HTMLDialogElement): Promise<void> {
    await zoomClose(win);
    win.close();
  }

  for (const win of [settingsWindow, historyWindow]) {
    win.querySelectorAll<HTMLElement>("[data-close]").forEach((button) =>
      button.addEventListener("click", () => void closeWindow(win)),
    );
    // Click on the backdrop closes.
    win.addEventListener("click", (event) => {
      if (event.target === win) {
        void closeWindow(win);
      }
    });
    win.addEventListener("cancel", (event) => {
      event.preventDefault();
      void closeWindow(win);
    });
    win.addEventListener("close", () => {
      win.getAnimations().forEach((animation) => animation.cancel());
      focusInput();
    });
  }

  function renderHistory(): void {
    historyList.replaceChildren(
      ...history.map((entry) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history__row";
        const shownResult =
          entry.decimal !== null && !prefersExact({ ...entry, value: 0 }, settings.format)
            ? toLatex({ ...entry, value: 0 }, false)
            : entry.exact;
        button.append(
          renderMath(entry.latex, "history__expr"),
          renderMath(`=${shownResult}`, "history__result"),
        );
        button.addEventListener("click", () => {
          input.value = entry.latex;
          setPhase("edit");
          void closeWindow(historyWindow);
        });
        item.append(button);
        return item;
      }),
    );
    historyEmpty.hidden = history.length > 0;
    clearHistoryButton.disabled = history.length === 0;
  }

  function openHistory(origin: HTMLElement): void {
    renderHistory();
    openWindow(historyWindow, origin);
    staggerIn(historyList.children);
  }

  historyButton.addEventListener("click", () => openHistory(historyButton));
  settingsButton.addEventListener("click", () => openWindow(settingsWindow, settingsButton));

  clearHistoryButton.addEventListener("click", () => {
    history.length = 0;
    persist();
    renderHistory();
  });

  // Settings form.
  settingsWindow.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === "angle") {
      settings.angle = target.value as typeof settings.angle;
      renderAngle();
    } else if (target.name === "format") {
      settings.format = target.value as typeof settings.format;
      if (evaluation) {
        showingExact = prefersExact(evaluation, settings.format);
        showResult(false);
      }
    } else if (target.name === "animations") {
      settings.animations = target.checked;
      applyMotion();
    }
    persist();
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

  // -- taskbar -------------------------------------------------------------

  function closeStartMenu(): void {
    startMenu.hidden = true;
    startButton.classList.remove("is-on");
    startButton.setAttribute("aria-expanded", "false");
  }

  startButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = startMenu.hidden !== false;
    startMenu.hidden = !opening;
    startButton.classList.toggle("is-on", opening);
    startButton.setAttribute("aria-expanded", String(opening));
    if (opening) {
      staggerIn(startMenu.querySelectorAll(".start-menu__item"));
    }
  });

  startMenu.addEventListener("click", (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-menu]");
    if (!item) {
      return;
    }
    const choice = item.dataset.menu;
    closeStartMenu();
    if (choice === "history") {
      openHistory(startButton);
    } else if (choice === "settings") {
      openWindow(settingsWindow, startButton);
    } else if (choice === "shutdown") {
      shutdown.hidden = false;
      shutdown.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!startMenu.hidden && !(event.target as HTMLElement).closest("#start-menu")) {
      closeStartMenu();
    }
  });

  shutdown.addEventListener("click", () => {
    shutdown.hidden = true;
    const win = document.querySelector<HTMLElement>(".calc");
    if (win) {
      zoomOpen(win);
    }
    focusInput();
  });

  function tick(): void {
    clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  tick();
  window.setInterval(tick, 15_000);

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

  document.addEventListener("keydown", (event) => {
    const anyWindowOpen = settingsWindow.open || historyWindow.open;
    if (event.key === "Enter" && !anyWindowOpen) {
      const target = event.target as HTMLElement;
      if (target.closest("button") && target !== input) {
        return;
      }
      event.preventDefault();
      equals();
    } else if (event.key === "Escape" && !anyWindowOpen) {
      clearAll();
    }
  });

  // Our own buttons must not steal focus from the math-field.
  document.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".toolbar, .display button, .taskbar")) {
      event.preventDefault();
    }
  });

  // -- boot ----------------------------------------------------------------

  applyMotion();
  syncSettingsForm();
  renderKeypad();
  renderAngle();
  setPhase("edit");

  // The window "opens" on launch.
  const calcWindow = document.querySelector<HTMLElement>(".calc");
  if (calcWindow) {
    zoomOpen(calcWindow);
  }

  // Desktop convenience; on touch devices we keep the OS keyboard away.
  if (!window.matchMedia("(pointer: coarse)").matches) {
    focusInput();
  }
}
