/**
 * Key buttons shared by every keypad: rendering, the press squish (AN-06),
 * hold-to-repeat, and keeping focus in the math-field while keys are tapped.
 */

import type { Key } from "./keypad";

const keyOf = new WeakMap<HTMLElement, Key>();

export function createKeyButton(key: Key): HTMLButtonElement {
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
  keyOf.set(button, key);
  return button;
}

/** Wire a container of key buttons: `run` is called once per press (or repeat). */
export function bindKeypad(container: HTMLElement, run: (key: Key) => void): void {
  let repeatTimer = 0;
  let suppressClick: HTMLElement | null = null;
  /** The key the current touch started on. A tap only counts on that key, so
   *  a finger that lands elsewhere (e.g. while the layout shifts as a keypad
   *  opens) and lifts over a key does not press it. */
  let downOn: HTMLElement | null = null;

  const stopRepeat = (): void => {
    window.clearTimeout(repeatTimer);
    window.clearInterval(repeatTimer);
  };

  const press = (key: Key): void => {
    if (navigator.vibrate) {
      navigator.vibrate(6);
    }
    run(key);
  };

  container.addEventListener("pointerdown", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(".key");
    const key = button ? keyOf.get(button) : undefined;
    if (!button || !key) {
      return;
    }
    event.preventDefault(); // keep focus (and the caret) in the math-field
    downOn = button;
    button.classList.add("is-down");
    if (key.repeat) {
      press(key);
      suppressClick = button;
      stopRepeat();
      repeatTimer = window.setTimeout(() => {
        repeatTimer = window.setInterval(() => run(key), 70);
      }, 420);
    }
  });

  const release = (): void => {
    stopRepeat();
    for (const button of container.querySelectorAll(".is-down")) {
      button.classList.remove("is-down");
    }
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  container.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(".key");
    const key = button ? keyOf.get(button) : undefined;
    if (!button || !key) {
      return;
    }
    if (suppressClick === button) {
      suppressClick = null;
      return;
    }
    // detail === 0 is a keyboard activation (Enter/Space), which has no touch.
    const startedHere = event.detail === 0 || downOn === button;
    downOn = null;
    if (!startedHere) {
      return;
    }
    press(key);
  });
}
