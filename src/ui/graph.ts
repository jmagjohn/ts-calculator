/**
 * A graph tab: the plot, a list of equations (each a MathLive field with a
 * colour swatch that hides/shows it), and a keypad for typing equations.
 * The same controller drives the 2D and 3D tabs.
 */

import { MathfieldElement, type Selector } from "mathlive";
import { parse2D, parse3D, type ParseResult } from "../graph/equation";
import { Plot2D, type Curve } from "../graph/plot2d";
import { Plot3D, type Surface } from "../graph/plot3d";
import { graphKeys, type Key } from "./keypad";
import { bindKeypad, createKeyButton } from "./keys";
import { motionOn } from "./motion";
import type { SavedEquation } from "./storage";

const COLORS = ["#d00000", "#0000c0", "#008000", "#a000a0", "#c06000", "#008080"];
const MAX_EQUATIONS = 6;

export interface GraphTab {
  show(): void;
  hide(): void;
}

interface Row {
  element: HTMLElement;
  field: MathfieldElement;
  swatch: HTMLButtonElement;
  error: HTMLElement;
}

const svgButton = (path: string, label: string): string =>
  `<button class="btn plot__tool" type="button" aria-label="${label}">` +
  `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="2" fill="none"/></svg></button>`;

export function mountGraph(
  page: HTMLElement,
  mode: "2d" | "3d",
  equations: SavedEquation[],
  persist: () => void,
): GraphTab {
  page.innerHTML = `
    <div class="plot">
      <canvas class="plot__canvas" aria-label="${mode === "2d" ? "Graph" : "3D surface"}"></canvas>
      <div class="plot__tools">
        ${svgButton("M8 3v10M3 8h10", "Zoom in")}
        ${svgButton("M3 8h10", "Zoom out")}
        ${svgButton("M2.5 8L8 3l5.5 5M4.5 7v6h7V7", "Reset view")}
      </div>
      <p class="plot__hint">${
        mode === "2d"
          ? "Drag to move · pinch to zoom · tap a curve"
          : "Drag to spin · pinch to zoom · +/− change the range"
      }</p>
    </div>
    <div class="equations" role="list"></div>
    <div class="eq-actions">
      <button class="btn" type="button" data-add>+ Add ${mode === "2d" ? "equation" : "surface"}</button>
      <button class="btn" type="button" data-keys aria-pressed="false">Keypad</button>
    </div>
    <div class="keygrid graph-keys" hidden></div>
  `;

  const canvas = page.querySelector<HTMLCanvasElement>(".plot__canvas") as HTMLCanvasElement;
  const list = page.querySelector<HTMLElement>(".equations") as HTMLElement;
  const addButton = page.querySelector<HTMLButtonElement>("[data-add]") as HTMLButtonElement;
  const keysButton = page.querySelector<HTMLButtonElement>("[data-keys]") as HTMLButtonElement;
  const keypad = page.querySelector<HTMLElement>(".graph-keys") as HTMLElement;
  const [zoomIn, zoomOut, home] = page.querySelectorAll<HTMLButtonElement>(".plot__tool");

  const plot2d = mode === "2d" ? new Plot2D(canvas, motionOn) : null;
  const plot3d = mode === "3d" ? new Plot3D(canvas, motionOn) : null;

  const rows: Row[] = [];
  let active: MathfieldElement | null = null;
  let updateTimer = 0;

  // -- plotting -------------------------------------------------------------

  function update(animate: boolean): void {
    const curves: Curve[] = [];
    const surfaces: Surface[] = [];
    rows.forEach((row, index) => {
      const latex = row.field.value;
      equations[index].latex = latex;
      const color = COLORS[index % COLORS.length];
      const result: ParseResult<unknown> = mode === "2d" ? parse2D(latex) : parse3D(latex);
      row.error.textContent = result.ok === false ? result.error : "";
      row.element.classList.toggle("has-error", result.ok === false);
      if (result.ok !== true || !equations[index].visible) {
        return;
      }
      if (mode === "2d") {
        curves.push({ eq: (result as { value: Curve["eq"] }).value, color });
      } else {
        surfaces.push({ fn: (result as { value: Surface["fn"] }).value, color });
      }
    });
    plot2d?.setCurves(curves, animate);
    plot3d?.setSurfaces(surfaces, animate);
    persist();
  }

  function scheduleUpdate(): void {
    window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(() => update(false), 120);
  }

  // -- equation rows ----------------------------------------------------------

  function renderRows(): void {
    rows.length = 0;
    list.replaceChildren(
      ...equations.map((equation, index) => {
        const element = document.createElement("div");
        element.className = "eq";
        element.setAttribute("role", "listitem");
        const color = COLORS[index % COLORS.length];

        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "eq__swatch";
        swatch.style.setProperty("--c", color);
        swatch.setAttribute("aria-label", `Show or hide equation ${index + 1}`);
        swatch.setAttribute("aria-pressed", String(equation.visible));
        swatch.addEventListener("click", () => {
          equation.visible = !equation.visible;
          swatch.setAttribute("aria-pressed", String(equation.visible));
          update(true);
        });

        const field = document.createElement("math-field") as MathfieldElement;
        field.className = "eq__field";
        field.setAttribute("inputmode", "none");
        field.setAttribute("math-virtual-keyboard-policy", "manual");
        field.setAttribute("aria-label", `Equation ${index + 1}`);
        field.setAttribute("placeholder", mode === "2d" ? "y=" : "f(x,y)");
        field.setAttribute("popover-policy", "off");
        field.setAttribute("smart-fence", "false");
        field.addEventListener("input", scheduleUpdate);
        const activate = (): void => {
          active = field;
          list.querySelectorAll(".eq").forEach((row) => row.classList.remove("is-active"));
          element.classList.add("is-active");
          setKeypad(true);
        };
        // Open the keypad on the tap itself, in the capture phase, so the
        // layout has already moved the field up before MathLive focuses it.
        // Otherwise iOS Safari scrolls the page to reveal a field near the
        // bottom, and taps then land about a centimetre off.
        field.addEventListener("pointerdown", activate, { capture: true });
        field.addEventListener("focus", activate);
        field.addEventListener("focusin", activate);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "eq__remove";
        remove.setAttribute("aria-label", `Delete equation ${index + 1}`);
        remove.innerHTML =
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2"/></svg>';
        remove.addEventListener("click", () => {
          equations.splice(index, 1);
          if (active === field) {
            active = null;
          }
          renderRows();
          update(false);
        });

        const error = document.createElement("p");
        error.className = "eq__error";
        error.setAttribute("role", "status");

        const prefix = document.createElement("span");
        prefix.className = "eq__prefix";
        prefix.textContent = "z =";

        element.append(swatch, ...(mode === "3d" ? [prefix] : []), field, remove, error);
        rows.push({ element, field, swatch, error });
        return element;
      }),
    );
    // Some MathLive settings can only be applied once the field is in the page.
    rows.forEach((row, index) => {
      row.field.value = equations[index].latex;
      row.field.mathVirtualKeyboardPolicy = "manual";
      row.field.menuItems = [];
      row.field.popoverPolicy = "off";
      row.field.smartFence = false;
    });
    addButton.disabled = equations.length >= MAX_EQUATIONS;
  }

  addButton.addEventListener("click", () => {
    if (equations.length >= MAX_EQUATIONS) {
      return;
    }
    equations.push({ latex: mode === "2d" ? "y=" : "", visible: true });
    renderRows();
    const row = rows[rows.length - 1];
    if (motionOn()) {
      row.element.animate(
        [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    row.field.dispatchEvent(new Event("pointerdown"));
    row.field.focus();
    row.field.position = row.field.lastOffset;
    persist();
  });

  // -- keypad ---------------------------------------------------------------

  keypad.append(...graphKeys().map(createKeyButton));

  function setKeypad(open: boolean): void {
    const wasOpen = !keypad.hidden;
    if (open === wasOpen) {
      return;
    }
    keypad.hidden = !open;
    page.classList.toggle("is-editing", open);
    keysButton.setAttribute("aria-pressed", String(open));
    keysButton.classList.toggle("is-on", open);
    if (open && motionOn()) {
      keypad.animate(
        [
          { opacity: 0, transform: "translateY(24px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    if (!open) {
      active?.blur();
      list.querySelectorAll(".eq").forEach((row) => row.classList.remove("is-active"));
      update(true);
    }
  }

  keysButton.addEventListener("click", () => {
    if (keypad.hidden) {
      const target = active ?? rows[rows.length - 1]?.field;
      if (target) {
        target.dispatchEvent(new Event("pointerdown"));
        target.focus();
      } else {
        setKeypad(true);
      }
    } else {
      setKeypad(false);
    }
  });

  bindKeypad(keypad, (key: Key) => {
    const field = active ?? rows[0]?.field;
    if (!field) {
      return;
    }
    const { action } = key;
    if (action.type === "insert") {
      field.focus();
      field.insert(action.latex, { selectionMode: "placeholder", focus: true, scrollIntoView: true });
    } else if (action.type === "command") {
      field.focus();
      field.executeCommand(action.command as Selector);
    } else if (action.action === "backspace") {
      field.focus();
      field.executeCommand("deleteBackward");
    } else if (action.action === "done") {
      setKeypad(false);
      return;
    }
    scheduleUpdate();
  });

  // Our buttons must not steal focus from the field being edited.
  page.addEventListener("mousedown", (event) => {
    if ((event.target as HTMLElement).closest(".eq-actions, .plot__tools")) {
      event.preventDefault();
    }
  });

  // Tapping the plot while typing puts the keypad away so you can see it.
  canvas.addEventListener("pointerdown", () => {
    if (!keypad.hidden) {
      setKeypad(false);
    }
  });

  // -- tools ----------------------------------------------------------------

  zoomIn.addEventListener("click", () => (plot2d ? plot2d.zoomBy(1.6) : plot3d?.zoomRange(1 / 2)));
  zoomOut.addEventListener("click", () => (plot2d ? plot2d.zoomBy(1 / 1.6) : plot3d?.zoomRange(2)));
  home.addEventListener("click", () => (plot2d ? plot2d.reset() : plot3d?.reset()));

  renderRows();
  let shownOnce = false;

  return {
    show(): void {
      plot3d?.setActive(true);
      if (!shownOnce) {
        shownOnce = true;
        requestAnimationFrame(() => update(true));
      }
    },
    hide(): void {
      plot3d?.setActive(false);
      setKeypad(false);
    },
  };
}
