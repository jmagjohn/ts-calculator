/**
 * App shell: the tab strip (Calc · Graph · 3D · History) and its pages.
 * Graph tabs are built the first time they are opened.
 */

import { mountCalculator, type CalculatorTab } from "./calculator";
import { mountGraph, type GraphTab } from "./graph";
import { fadeThrough, zoomOpen } from "./motion";
import { load, save, type TabName } from "./storage";

const TITLES: Record<TabName, string> = {
  calc: "Calculator",
  graph: "Graph",
  "3d": "3D Graph",
  history: "History",
};

export function mountApp(): void {
  const state = load();
  const title = document.getElementById("window-title");
  const content = document.getElementById("window-content") as HTMLElement;
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
  const pages: Record<TabName, HTMLElement> = {
    calc: document.getElementById("page-calc") as HTMLElement,
    graph: document.getElementById("page-graph") as HTMLElement,
    "3d": document.getElementById("page-3d") as HTMLElement,
    history: document.getElementById("page-history") as HTMLElement,
  };

  let current: TabName | null = null;
  const graphs: Partial<Record<TabName, GraphTab>> = {};

  const calculator: CalculatorTab = mountCalculator(() => show("calc"));

  function graphFor(tab: TabName): GraphTab | undefined {
    if (tab !== "graph" && tab !== "3d") {
      return undefined;
    }
    if (!graphs[tab]) {
      graphs[tab] = mountGraph(
        pages[tab],
        tab === "graph" ? "2d" : "3d",
        tab === "graph" ? state.graph2d : state.graph3d,
        save,
      );
    }
    return graphs[tab];
  }

  function swap(tab: TabName): void {
    for (const [name, page] of Object.entries(pages) as [TabName, HTMLElement][]) {
      page.hidden = name !== tab;
    }
    if (current) {
      graphFor(current)?.hide();
    }
    current = tab;
    graphFor(tab)?.show();
    if (tab === "calc") {
      calculator.focus();
    } else if (tab === "history") {
      calculator.renderHistory();
    }
  }

  function show(tab: TabName, animate = true): void {
    if (tab === current) {
      return;
    }
    for (const button of tabButtons) {
      const selected = button.dataset.tab === tab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    }
    if (title) {
      title.textContent = TITLES[tab];
    }
    state.tab = tab;
    save();
    if (animate) {
      void fadeThrough(content, () => swap(tab));
    } else {
      swap(tab);
    }
  }

  for (const button of tabButtons) {
    button.addEventListener("click", () => show(button.dataset.tab as TabName));
  }

  // Enter evaluates and Escape clears, but only on the calculator tab.
  document.addEventListener("keydown", (event) => {
    if (current !== "calc" || !calculator.acceptsKeys()) {
      return;
    }
    const target = event.target as HTMLElement;
    if (event.key === "Enter") {
      if (target.closest("button") && target.id !== "calc-input") {
        return;
      }
      event.preventDefault();
      calculator.equals();
    } else if (event.key === "Escape") {
      calculator.clearAll();
    }
  });

  show(state.tab, false);

  // The window "opens" on launch.
  const win = document.querySelector<HTMLElement>(".calc");
  if (win) {
    zoomOpen(win);
  }
}
