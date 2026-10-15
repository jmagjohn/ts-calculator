/**
 * Math engine: a thin, typed facade over mathjs.
 *
 * Why mathjs and not a hand-rolled parser? A scientific calculator needs
 * hundreds of functions, constants, precedence rules, and symbolic support
 * eventually. Reimplementing that is a not-invented-here trap. We lean on
 * mathjs for the math and keep only the calculator-specific concerns here:
 * angle-mode handling, the missing `ln` alias, and display formatting.
 */

import { all, create } from "mathjs";

export type AngleMode = "deg" | "rad";

/** A single shared instance; angle mode is applied per-evaluation via scope. */
const math = create(all, { number: "number" });

const DEG_PER_RAD = 180 / Math.PI;
const toRadians = (degrees: number): number => degrees / DEG_PER_RAD;
const toDegrees = (radians: number): number => radians * DEG_PER_RAD;

/** Evaluator scope: extra names mathjs doesn't ship but a calculator expects. */
export type EvalScope = Record<string, unknown>;

/** mathjs has no `ln` (its `log` is already natural log); aliasing keeps both. */
const BASE_SCOPE: EvalScope = {
  ln: (x: number): number => Math.log(x),
};

/** In degree mode, wrap trig so bare `sin(30)` means 30 degrees, not 30 rad. */
function scopeFor(angleMode: AngleMode): EvalScope {
  if (angleMode === "rad") {
    return { ...BASE_SCOPE };
  }
  return {
    ...BASE_SCOPE,
    sin: (x: number) => Math.sin(toRadians(x)),
    cos: (x: number) => Math.cos(toRadians(x)),
    tan: (x: number) => Math.tan(toRadians(x)),
    asin: (x: number) => toDegrees(Math.asin(x)),
    acos: (x: number) => toDegrees(Math.acos(x)),
    atan: (x: number) => toDegrees(Math.atan(x)),
    atan2: (y: number, x: number) => toDegrees(Math.atan2(y, x)),
  };
}

/**
 * Evaluate an expression, returning mathjs's raw result (number, Complex,
 * Unit, ...). Throws on malformed input or empty expressions.
 */
export function evaluateExpression(
  expression: string,
  angleMode: AngleMode = "rad",
  extraScope: EvalScope = {},
): unknown {
  const trimmed = expression.trim();
  if (trimmed === "") {
    throw new Error("Empty expression");
  }
  return math.evaluate(trimmed, { ...scopeFor(angleMode), ...extraScope });
}

/**
 * Render any mathjs result as a display string, trimmed of float noise.
 *
 * mathjs's default `auto` notation flips to exponential at 1e5 (so 100000
 * shows as "1e+5") which is awful for a calculator. We raise the exponent
 * thresholds so only genuinely huge/tiny values go scientific.
 */
export function toDisplay(result: unknown): string {
  if (typeof result === "number" && !Number.isFinite(result)) {
    throw new Error("Result is not a finite number");
  }
  return math.format(result, { precision: 12, upperExp: 21, lowerExp: -9 });
}

/** Beyond this denominator a "fraction" is noise (pi -> 11985110/3814979). */
const MAX_DENOMINATOR = 10000;
/** Relative tolerance when checking a fraction actually matches the value. */
const FRACTION_TOLERANCE = 1e-12;

/**
 * Render a result as an exact-looking fraction ("1/3", "-3/4") when it is
 * one, or null when a decimal is the honest answer. Rationale: mathjs will
 * happily turn pi into a giant fraction; a calculator should not.
 */
export function toFraction(result: unknown): string | null {
  if (typeof result !== "number" || !Number.isFinite(result)) {
    return null;
  }
  if (Number.isInteger(result)) {
    return null; // 2 is 2, not 2/1
  }

  const fraction = math.fraction(result);
  const denominator = Number(fraction.d);
  if (!Number.isFinite(denominator) || denominator <= 1 || denominator > MAX_DENOMINATOR) {
    return null;
  }

  const approx = Number(fraction.valueOf());
  if (Math.abs(approx - result) > FRACTION_TOLERANCE * Math.max(1, Math.abs(result))) {
    return null;
  }
  return math.format(fraction);
}

/** Evaluate and require a real, finite number. Convenient for tests and ANS. */
export function evaluateNumber(
  expression: string,
  angleMode: AngleMode = "rad",
  extraScope: EvalScope = {},
): number {
  const result = evaluateExpression(expression, angleMode, extraScope);
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Result is not a real number");
  }
  return result;
}
