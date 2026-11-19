/**
 * Turn the LaTeX of a typed equation into a fast numeric function to plot.
 *
 * 2D accepts:
 *   y = f(x)          (or just f(x))
 *   x = g(y)
 *   F(x, y) = G(x, y) (implicit, e.g. x^2 + y^2 = 25)
 * 3D accepts:
 *   z = f(x, y)       (or just f(x, y))
 *
 * Graphs always use radians. compute-engine compiles the expression to
 * JavaScript, so a single evaluation costs well under a microsecond.
 */

import { ComputeEngine, compile } from "@cortex-js/compute-engine";

export type Fn1 = (t: number) => number;
export type Fn2 = (x: number, y: number) => number;

export type Plot2DEquation =
  | { kind: "y"; fn: Fn1 }
  | { kind: "x"; fn: Fn1 }
  | { kind: "implicit"; fn: Fn2 };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string } | { ok: "empty" };

const engine = new ComputeEngine();
engine.angularUnit = "rad";

type Boxed = NonNullable<ReturnType<typeof engine.parse>>;

/** Compile to (x, y) => number; complex or non-numeric results become NaN. */
function compileFn(expr: Boxed): Fn2 {
  const result = compile(expr) as unknown as {
    run?: (vars: Record<string, number>) => unknown;
  };
  const run = result.run;
  if (typeof run !== "function") {
    throw new Error("Can't graph this");
  }
  const vars = { x: 0, y: 0 };
  return (x, y) => {
    vars.x = x;
    vars.y = y;
    const value = run(vars);
    return typeof value === "number" ? value : Number.NaN;
  };
}

function freeVars(expr: Boxed): string[] {
  const holder = expr as unknown as { freeVariables?: readonly string[]; unknowns?: readonly string[] };
  return [...(holder.freeVariables ?? holder.unknowns ?? [])];
}

function checkVars(expr: Boxed, allowed: string[]): string | null {
  const extra = freeVars(expr).filter((name) => !allowed.includes(name));
  if (extra.length === 0) {
    return null;
  }
  const list = allowed.join(" and ");
  return `Unknown letter “${extra[0]}”. Use ${list}.`;
}

function prepare(latex: string): ParseResult<Boxed> {
  const source = latex.trim();
  if (source === "" || /^[xyz]=?$/.test(source)) {
    return { ok: "empty" };
  }
  if (/\\placeholder/.test(source)) {
    return { ok: false, error: "Fill in the empty box" };
  }
  const expr = engine.parse(source);
  if (!expr || !expr.isValid) {
    return { ok: false, error: "Can't read this yet" };
  }
  return { ok: true, value: expr };
}

const isSymbol = (expr: Boxed, name: string): boolean =>
  (expr as unknown as { symbol?: string }).symbol === name;

export function parse2D(latex: string): ParseResult<Plot2DEquation> {
  const prepared = prepare(latex);
  if (prepared.ok !== true) {
    return prepared;
  }
  const expr = prepared.value;

  try {
    if (expr.operator !== "Equal") {
      const problem = checkVars(expr, ["x"]);
      if (problem) {
        return {
          ok: false,
          error: freeVars(expr).includes("y") ? "Add an = sign, like x²+y²=9" : problem,
        };
      }
      const fn = compileFn(expr);
      return { ok: true, value: { kind: "y", fn: (x) => fn(x, 0) } };
    }

    const [lhs, rhs] = (expr as unknown as { ops?: Boxed[] }).ops ?? [];
    if (!lhs || !rhs) {
      return { ok: false, error: "Can't read this yet" };
    }

    // y = f(x)  or  f(x) = y
    for (const [side, other] of [
      [lhs, rhs],
      [rhs, lhs],
    ] as const) {
      if (isSymbol(side, "y") && !freeVars(other).includes("y")) {
        const problem = checkVars(other, ["x"]);
        if (problem) {
          return { ok: false, error: problem };
        }
        const fn = compileFn(other);
        return { ok: true, value: { kind: "y", fn: (x) => fn(x, 0) } };
      }
      if (isSymbol(side, "x") && !freeVars(other).includes("x")) {
        const problem = checkVars(other, ["y"]);
        if (problem) {
          return { ok: false, error: problem };
        }
        const fn = compileFn(other);
        return { ok: true, value: { kind: "x", fn: (y) => fn(0, y) } };
      }
    }

    const difference = engine.box(["Subtract", lhs, rhs]);
    const problem = checkVars(difference, ["x", "y"]);
    if (problem) {
      return { ok: false, error: problem };
    }
    return { ok: true, value: { kind: "implicit", fn: compileFn(difference) } };
  } catch {
    return { ok: false, error: "Can't graph this" };
  }
}

export function parse3D(latex: string): ParseResult<Fn2> {
  let source = latex.trim();
  // Accept an optional leading "z=".
  source = source.replace(/^z\s*=/, "");
  const prepared = prepare(source);
  if (prepared.ok !== true) {
    return prepared;
  }
  const expr = prepared.value;
  try {
    if (expr.operator === "Equal") {
      return { ok: false, error: "Type just the right side of z = …" };
    }
    const problem = checkVars(expr, ["x", "y"]);
    if (problem) {
      return { ok: false, error: problem };
    }
    return { ok: true, value: compileFn(expr) };
  } catch {
    return { ok: false, error: "Can't graph this" };
  }
}
