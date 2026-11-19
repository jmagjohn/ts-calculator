/**
 * Math engine: a thin, typed facade over the CortexJS compute-engine.
 *
 * The editor (MathLive) speaks LaTeX, and compute-engine parses and evaluates
 * LaTeX symbolically. That is why exact forms survive -- `1/3` stays `\frac{1}{3}`
 * instead of collapsing to 0.333... Only calculator concerns live here: angle
 * units, the `Ans` token, friendly errors, and number formatting.
 */

import { ComputeEngine } from "@cortex-js/compute-engine";

export type AngleMode = "deg" | "rad";
/** auto: fractions/radicals when they are tidy, decimals otherwise. */
export type ResultFormat = "auto" | "exact" | "decimal";

export interface Evaluation {
  /** Exact form as LaTeX, e.g. "\\frac{1}{3}", "\\sqrt{2}", "\\pi". */
  exact: string;
  /** Plain decimal string (for copying), or null when there is no finite real value. */
  decimal: string | null;
  /** Numeric value, or null when non-numeric. */
  value: number | null;
}

/** Write Ans out as its value, e.g. for history: "\\mathrm{Ans}+1" -> "3+1". */
export function expandAns(latex: string, ans: string | null): string {
  if (!ans) {
    return latex;
  }
  const simple = /^\d+(\.\d+)?$|^\\frac\{\d+\}\{\d+\}$|^\\pi$/.test(ans);
  return latex.replace(ANS_PATTERN, simple ? ans : `\\left(${ans}\\right)`);
}

/** Error with a short message that is fit to show on the calculator screen. */
export class CalcError extends Error {}

/** The LaTeX the editor produces for the Ans key, in any of its spellings. */
export const ANS_LATEX = "\\mathrm{Ans}";
const ANS_PATTERN = /\\(?:mathrm|operatorname|text)\{Ans\}/g;

const engine = new ComputeEngine();

/**
 * Evaluate LaTeX straight from the editor. `ans` is the exact LaTeX of the
 * previous answer and is substituted for the Ans token. Throws CalcError.
 */
export function evaluate(latex: string, angleMode: AngleMode = "rad", ans?: string | null): Evaluation {
  let source = latex.trim();
  if (source === "") {
    throw new CalcError("Nothing to calculate");
  }
  if (/\\placeholder/.test(source)) {
    throw new CalcError("Fill in the empty box");
  }
  if (ANS_PATTERN.test(source)) {
    if (!ans) {
      throw new CalcError("No answer yet");
    }
    source = source.replace(ANS_PATTERN, `\\left(${ans}\\right)`);
  }
  ANS_PATTERN.lastIndex = 0;

  engine.angularUnit = angleMode;

  const parsed = engine.parse(source);
  if (!parsed.isValid) {
    throw new CalcError("Syntax error");
  }

  const evaluated = parsed.evaluate();
  if (!evaluated.isValid) {
    throw new CalcError("Math error");
  }

  const symbol = typeof evaluated.json === "string" ? evaluated.json : null;
  if (symbol === "ComplexInfinity" || symbol === "Indeterminate" || symbol === "NaN") {
    throw new CalcError("Undefined");
  }

  const numeric = evaluated.N();
  // `isNumber` is a flag, not a declared narrowing guard, so read the value
  // through the documented shape (numericValue is number | NumericValue).
  const raw = numeric.isNumber
    ? Number((numeric as unknown as { numericValue: unknown }).numericValue)
    : Number.NaN;
  const value = Number.isFinite(raw) ? raw : null;

  // Complex results: show the numeric approximation, there is no tidy exact form.
  const isComplex = JSON.stringify(numeric.json).includes("Complex");
  const exact = cleanLatex(isComplex ? numeric.latex : evaluated.latex);

  return {
    exact,
    decimal: value === null ? null : formatNumber(value),
    value,
  };
}

/** Is the exact form something a person would rather read than a decimal? */
export function isTidyExact(result: Evaluation): boolean {
  if (result.decimal === null) {
    return true;
  }
  const { exact } = result;
  if (exact.length > 24 || /\d\.\d/.test(exact)) {
    return false;
  }
  // Only fractions, roots and pi. Anything else (unevaluated functions, e^x)
  // reads better as a number.
  const leftover = exact.replace(/\\(frac|sqrt|pi)/g, "").replace(/[\d{}[\]+\-^()]/g, "");
  return leftover === "" && !/^-?\d+$/.test(exact);
}

/** Choose which form to show: true for exact, false for decimal. */
export function prefersExact(result: Evaluation, format: ResultFormat): boolean {
  if (result.decimal === null) {
    return true;
  }
  if (format === "exact") {
    return true;
  }
  if (format === "decimal") {
    return false;
  }
  return isTidyExact(result);
}

/** LaTeX for the chosen form. Decimals get thousands separators. */
export function toLatex(result: Evaluation, exact: boolean): string {
  if (exact || result.decimal === null) {
    return result.exact;
  }
  return decimalToLatex(result.decimal);
}

/** "1234567.5" -> "1{,}234{,}567.5"; "1.5e-7" -> "1.5\times10^{-7}". */
export function decimalToLatex(decimal: string): string {
  const [mantissa, exponent] = decimal.split("e");
  const negative = mantissa.startsWith("-");
  const [whole, fraction] = mantissa.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "{,}");
  let latex = `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
  if (exponent !== undefined) {
    latex += `\\times10^{${Number(exponent)}}`;
  }
  return latex;
}

/** Clean up compute-engine LaTeX for display. */
function cleanLatex(latex: string): string {
  return latex
    .replace(/\\,/g, "")
    .replace(/\\exponentialE/g, "e")
    .replace(/\\imaginaryI/g, "i")
    .replace(/\\cdot10\^/g, "\\times10^");
}

export function formatNumber(value: number): string {
  if (Object.is(value, -0)) {
    return "0";
  }
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e15 || magnitude < 1e-9)) {
    const [m, e] = value.toExponential(9).split("e");
    return `${Number.parseFloat(m)}e${Number(e)}`;
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Number.parseFloat(value.toPrecision(12)).toString();
}
