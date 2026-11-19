/** Settings and history survive reloads via localStorage (best effort). */

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

const KEY = "calc95:v1";
export const MAX_HISTORY = 50;

interface Saved {
  settings: Settings;
  history: HistoryEntry[];
  ans: string | null;
}

const DEFAULTS: Saved = {
  settings: { angle: "deg", format: "auto", animations: true },
  history: [],
  ans: null,
};

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return structuredClone(DEFAULTS);
    }
    const saved = JSON.parse(raw) as Partial<Saved>;
    return {
      settings: { ...DEFAULTS.settings, ...saved.settings },
      history: Array.isArray(saved.history) ? saved.history.slice(0, MAX_HISTORY) : [],
      ans: typeof saved.ans === "string" ? saved.ans : null,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save(state: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage full: the calculator still works, it just forgets.
  }
}
