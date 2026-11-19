/** Settings, history and graph equations survive reloads via localStorage (best effort). */

import type { AngleMode, ResultFormat } from "../engine/engine";

export interface Settings {
  angle: AngleMode;
  format: ResultFormat;
  animations: boolean;
}

export interface HistoryEntry {
  /** The expression as typed. */
  latex: string;
  /** Exact result LaTeX (also what Ans refers to). */
  exact: string;
  /** Plain decimal, when there is one. */
  decimal: string | null;
}

export interface SavedEquation {
  latex: string;
  visible: boolean;
}

export type TabName = "calc" | "graph" | "3d" | "history";

export interface Saved {
  settings: Settings;
  history: HistoryEntry[];
  ans: string | null;
  graph2d: SavedEquation[];
  graph3d: SavedEquation[];
  tab: TabName;
}

const KEY = "calc95:v1";
export const MAX_HISTORY = 50;

const DEFAULTS: Saved = {
  settings: { angle: "deg", format: "auto", animations: true },
  history: [],
  ans: null,
  graph2d: [
    { latex: "y=\\sin(x)", visible: true },
    { latex: "x^2+y^2=9", visible: true },
  ],
  graph3d: [{ latex: "\\sin(x)\\cos(y)", visible: true }],
  tab: "calc",
};

function equations(value: unknown, fallback: SavedEquation[]): SavedEquation[] {
  if (!Array.isArray(value)) {
    return structuredClone(fallback);
  }
  return value
    .filter((item): item is SavedEquation => typeof item?.latex === "string")
    .map((item) => ({ latex: item.latex, visible: item.visible !== false }));
}

let state: Saved | null = null;

/** The shared, mutable saved state. Call save() after changing it. */
export function load(): Saved {
  if (state) {
    return state;
  }
  let saved: Partial<Saved> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Saved>;
  } catch {
    saved = {};
  }
  const tabs: TabName[] = ["calc", "graph", "3d", "history"];
  state = {
    settings: { ...DEFAULTS.settings, ...saved.settings },
    history: Array.isArray(saved.history) ? saved.history.slice(0, MAX_HISTORY) : [],
    ans: typeof saved.ans === "string" ? saved.ans : null,
    graph2d: equations(saved.graph2d, DEFAULTS.graph2d),
    graph3d: equations(saved.graph3d, DEFAULTS.graph3d),
    tab: tabs.includes(saved.tab as TabName) ? (saved.tab as TabName) : "calc",
  };
  return state;
}

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    // Private mode or storage full: the calculator still works, it just forgets.
  }
}
