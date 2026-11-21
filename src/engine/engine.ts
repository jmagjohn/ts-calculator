/**
 * Math engine: a thin, typed facade over the CortexJS compute-engine.
 *
 * The editor (MathLive) speaks LaTeX, and compute-engine parses and evaluates
 * LaTeX symbolically. That is why exact forms survive -- `1/3` stays `\frac{1}{3}`
 * instead of collapsing to 0.333... Only calculator concerns live here: angle
 * units, the `Ans` token, friendly errors, and number formatting.
 */

import { ComputeEngine, compile } from "@cortex-js/compute-engine";

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

type Boxed = NonNullable<ReturnType<typeof engine.parse>>;

/** Check the editor's LaTeX and substitute Ans. Throws CalcError. */
function prepare(latex: string, ans?: string | null): string {
  let source = latex.trim();
  if (source === "") {
    throw new CalcError("Nothing to calculate");
  }
  if (/\\placeholder/.test(source)) {
    throw new CalcError("Fill in the empty box");
  }
  ANS_PATTERN.lastIndex = 0;
  if (ANS_PATTERN.test(source)) {
    if (!ans) {
      throw new CalcError("No answer yet");
    }
    source = source.replace(ANS_PATTERN, `\\left(${ans}\\right)`);
  }
  ANS_PATTERN.lastIndex = 0;
  return multiplyBeforeFractions(source);
}

/**
 * A number written right before a fraction means multiply, not a mixed
 * number: 2½ is 2 × ½ = 1, not 2.5. compute-engine reads some of these as
 * mixed numbers, so make the multiplication explicit.
 */
export function multiplyBeforeFractions(latex: string): string {
  return latex.replace(/(\d)\s*(?=\\frac)/g, "$1\\cdot ");
}

function parse(source: string): Boxed {
  const parsed = engine.parse(source);
  if (!parsed || !parsed.isValid) {
    throw new CalcError("Syntax error");
  }
  return parsed;
}

/** An already-evaluated expression -> exact LaTeX, decimal and value. */
function describe(evaluated: Boxed): Evaluation {
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
  const exact = cleanLatex(isComplex(numeric) ? numeric.latex : evaluated.latex);

  return {
    exact,
    decimal: value === null ? null : formatNumber(value),
    value,
  };
}

function isComplex(expr: Boxed): boolean {
  return JSON.stringify(expr.json).includes("Complex");
}

/**
 * Evaluate LaTeX straight from the editor. `ans` is the exact LaTeX of the
 * previous answer and is substituted for the Ans token. Throws CalcError.
 */
export function evaluate(latex: string, angleMode: AngleMode = "rad", ans?: string | null): Evaluation {
  engine.angularUnit = angleMode;
  return describe(parse(prepare(latex, ans)).evaluate());
}

// -- equations ---------------------------------------------------------------

export type Outcome =
  | { kind: "value"; result: Evaluation }
  | {
      kind: "solutions";
      variable: string;
      solutions: Evaluation[];
      /** Found by numeric search rather than algebra. */
      approximate: boolean;
    }
  | { kind: "truth"; value: boolean };

function unknownsOf(expr: Boxed): string[] {
  const holder = expr as unknown as { unknowns?: readonly string[]; freeVariables?: readonly string[] };
  return [...(holder.unknowns ?? holder.freeVariables ?? [])];
}

/**
 * What the ENTER key does: evaluate an expression, or, when there is an `=`,
 * solve for the unknown (x if present) or check the equation is true.
 */
export function calculate(latex: string, angleMode: AngleMode = "rad", ans?: string | null): Outcome {
  engine.angularUnit = angleMode;
  const source = prepare(latex, ans);
  const equalSigns = (source.match(/=/g) ?? []).length;
  if (equalSigns === 0) {
    return { kind: "value", result: describe(parse(source).evaluate()) };
  }
  if (equalSigns > 1) {
    throw new CalcError("Use only one = sign");
  }
  const [left, right] = source.split("=");
  if (left.trim() === "" || right.trim() === "") {
    throw new CalcError("Put something on both sides of =");
  }

  const equation = parse(source);
  const unknowns = unknownsOf(equation);
  if (unknowns.length === 0) {
    const verdict = equation.evaluate().json;
    return { kind: "truth", value: verdict === "True" };
  }
  const variable = unknowns.includes("x") ? "x" : unknowns[0];

  // Algebra first.
  let roots: Boxed[] | null = null;
  try {
    const solved = (equation as unknown as { solve(v: string): Boxed[] | null | undefined }).solve(variable);
    roots = Array.isArray(solved) ? solved : null;
  } catch {
    roots = null;
  }

  if (roots && roots.length > 0) {
    const real = roots.filter((root) => !isComplex(root.N()));
    if (real.length === 0) {
      throw new CalcError("No real solution");
    }
    const solutions = dedupe(real.map((root) => describe(root.evaluate())));
    solutions.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
    return { kind: "solutions", variable, solutions, approximate: false };
  }

  // Then a numeric search (one unknown only).
  if (unknowns.length === 1) {
    const difference = engine.box(["Subtract", parse(left), parse(right)]);
    const found = findRoots(compileOne(difference, variable));
    if (found.length > 0) {
      const solutions = found.map((value) => ({
        exact: decimalToLatex(formatNumber(value)),
        decimal: formatNumber(value),
        value,
      }));
      return { kind: "solutions", variable, solutions, approximate: true };
    }
  }
  throw new CalcError(roots ? "No solution" : "Can't solve this one");
}

function dedupe(solutions: Evaluation[]): Evaluation[] {
  const seen = new Set<string>();
  return solutions.filter((solution) => {
    const key = solution.decimal ?? solution.exact;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function compileOne(expr: Boxed, variable: string): (t: number) => number {
  const result = compile(expr) as unknown as { run?: (vars: Record<string, number>) => unknown };
  const run = result.run;
  if (typeof run !== "function") {
    throw new CalcError("Can't solve this one");
  }
  const vars: Record<string, number> = { [variable]: 0 };
  return (t) => {
    vars[variable] = t;
    const value = run(vars);
    return typeof value === "number" ? value : Number.NaN;
  };
}

/** Real roots of f by sign changes on a grid, refined by bisection. */
export function findRoots(f: (t: number) => number, limit = 1000): number[] {
  // Dense near zero, sparser further out.
  const grid: number[] = [];
  for (let t = -limit; t <= limit; t += limit < 200 ? 0.01 : 0.05) {
    grid.push(Math.abs(t) < 1e-12 ? 0 : t);
  }
  const roots: number[] = [];
  let previousT = grid[0];
  let previous = f(previousT);
  for (let index = 1; index < grid.length && roots.length < 12; index += 1) {
    const t = grid[index];
    const value = f(t);
    if (value === 0) {
      roots.push(t);
    } else if (Number.isFinite(value) && Number.isFinite(previous) && previous !== 0 && value > 0 !== previous > 0) {
      let lo = previousT;
      let hi = t;
      let fLo = previous;
      for (let step = 0; step < 80; step += 1) {
        const mid = (lo + hi) / 2;
        const fMid = f(mid);
        if (!Number.isFinite(fMid)) {
          break;
        }
        if (fMid > 0 === fLo > 0) {
          lo = mid;
          fLo = fMid;
        } else {
          hi = mid;
        }
      }
      const root = (lo + hi) / 2;
      // A sign change across a pole (like tan at 90°) is not a root.
      const residual = Math.abs(f(root));
      if (residual < 1e-6 * (1 + Math.abs(previous) + Math.abs(value))) {
        roots.push(root);
      }
    }
    previousT = t;
    previous = value;
  }
  return roots
    .map((root) => (Math.abs(root) < 1e-12 ? 0 : Number.parseFloat(root.toPrecision(12))))
    .filter((root, index, all) => index === 0 || Math.abs(root - all[index - 1]) > 1e-9);
}

/** LaTeX for a set of solutions, e.g. "x=-3,\\;2" or "x\\approx0.739". */
export function solutionsLatex(variable: string, solutions: Evaluation[], exact: boolean, approximate: boolean): string {
  const values = solutions.map((solution) => toLatex(solution, exact)).join(",\\;");
  // A decimal that filled all 12 significant digits was rounded.
  const rounded = (solution: Evaluation): boolean =>
    !exact && solution.decimal !== null && solution.decimal.replace(/[^\d]/g, "").replace(/^0+/, "").length >= 12;
  const relation = approximate || solutions.some(rounded) ? "\\approx" : "=";
  return `${variable}${relation}${values}`;
}

/** Is the exact form something a person would rather read than a decimal? */
export function isTidyExact(result: Evaluation): boolean {
  if (result.decimal === null) {
    return true;
  }
  const { exact } = result;
  // Long forms, decimals and big numbers (like 69208015/99) read better as decimals.
  if (exact.length > 24 || /\d\.\d/.test(exact) || /\d{5,}/.test(exact)) {
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
