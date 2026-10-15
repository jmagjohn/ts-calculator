/**
 * Math engine: a thin, typed facade over the CortexJS compute-engine.
 *
 * The editor (MathLive) speaks LaTeX, and compute-engine parses and evaluates
 * LaTeX symbolically. That is why exact forms survive -- `1/3` stays `\frac{1}{3}`
 * instead of collapsing to 0.333... -- and it gives us a CAS (simplify, and
 * later calculus) without a second library. Only calculator-specific concerns
 * live here: angle units, friendly errors, number formatting, and ANS chaining.
 */

import { ComputeEngine } from "@cortex-js/compute-engine";

export type AngleMode = "deg" | "rad";
export type ResultFormat = "exact" | "decimal";

export interface Evaluation {
  /** Exact form as LaTeX, e.g. "\\frac{1}{3}", "\\sqrt{2}", "\\pi". */
  exact: string;
  /** Finite decimal string, or null when there is no finite real value. */
  decimal: string | null;
  /** Numeric value for chaining (ANS), or null when non-numeric. */
  value: number | null;
}

const engine = new ComputeEngine();

/** Evaluate LaTeX straight from the editor. Throws when unusable. */
export function evaluate(latex: string, angleMode: AngleMode = "rad"): Evaluation {
  const source = latex.trim();
  if (source === "") {
    throw new Error("Empty expression");
  }

  engine.angularUnit = angleMode === "deg" ? "deg" : "rad";

  const parsed = engine.parse(source);
  if (!parsed.isValid) {
    throw new Error(describeError(parsed.errors?.[0]));
  }

  const evaluated = parsed.evaluate();
  if (!evaluated.isValid) {
    throw new Error(describeError(evaluated.errors?.[0]));
  }

  // `numericValue` only exists on number literals, so guard with `isNumber()`.
  // Symbolic results (e.g. q+1), complex results and infinities yield null.
  const numeric = evaluated.N();
  // `isNumber` is a flag, not a declared narrowing guard, so read the value
  // through the documented shape (numericValue is number | NumericValue).
  const raw = numeric.isNumber
    ? Number((numeric as unknown as { numericValue: unknown }).numericValue)
    : Number.NaN;
  const value = Number.isFinite(raw) ? raw : null;
  return {
    exact: cleanLatex(evaluated.latex),
    decimal: value === null ? null : formatNumber(value),
    value,
  };
}

/** Choose the LaTeX to show for the selected result format. */
export function toLatex(result: Evaluation, format: ResultFormat): string {
  return format === "decimal" ? result.decimal ?? result.exact : result.exact;
}

/** compute-engine error nodes look like ["Error", "'unexpected-operator'", ...]. */
function describeError(error: unknown): string {
  if (Array.isArray(error) && typeof error[1] === "string") {
    const code = error[1].replace(/'/g, "").replace(/-/g, " ");
    return `Invalid expression: ${code}`;
  }
  return "Invalid expression";
}

/** Drop LaTeX thin-space thousands separators: 100\,000 -> 100000. */
function cleanLatex(latex: string): string {
  return latex.replace(/\\,/g, "");
}

function formatNumber(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return value.toString();
  }
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e21 || magnitude < 1e-9)) {
    return value.toExponential(6).replace(/\.?0+e/, "e");
  }
  return Number.parseFloat(value.toPrecision(12)).toString();
}
