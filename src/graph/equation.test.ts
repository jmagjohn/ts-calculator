import { describe, expect, it } from "vitest";
import { parse2D, parse3D } from "./equation";

function ok<T>(result: { ok: true; value: T } | { ok: false; error: string } | { ok: "empty" }): T {
  if (result.ok !== true) {
    throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  }
  return result.value;
}

describe("parse2D", () => {
  it("graphs y = f(x) and bare f(x)", () => {
    const eq = ok(parse2D("y=x^2+1"));
    expect(eq.kind).toBe("y");
    expect(eq.kind === "y" && eq.fn(3)).toBe(10);
    const bare = ok(parse2D("\\sin(x)"));
    expect(bare.kind === "y" && bare.fn(Math.PI / 2)).toBeCloseTo(1);
  });

  it("uses radians", () => {
    const eq = ok(parse2D("y=\\cos(x)"));
    expect(eq.kind === "y" && eq.fn(Math.PI)).toBeCloseTo(-1);
  });

  it("graphs x = g(y)", () => {
    const eq = ok(parse2D("x=y^2"));
    expect(eq.kind).toBe("x");
    expect(eq.kind === "x" && eq.fn(3)).toBe(9);
  });

  it("graphs implicit equations as F(x,y) = 0", () => {
    const eq = ok(parse2D("x^2+y^2=25"));
    expect(eq.kind).toBe("implicit");
    expect(eq.kind === "implicit" && eq.fn(3, 4)).toBe(0);
    expect(eq.kind === "implicit" && eq.fn(0, 0)).toBe(-25);
  });

  it("turns complex values into gaps", () => {
    const eq = ok(parse2D("y=\\sqrt{x}"));
    expect(eq.kind === "y" && Number.isNaN(eq.fn(-4))).toBe(true);
  });

  it("explains problems", () => {
    expect(parse2D("y=ax")).toEqual({ ok: false, error: "Unknown letter “a”. Use x." });
    expect(parse2D("x^2+y^2")).toEqual({ ok: false, error: "Add an = sign, like x²+y²=9" });
    expect(parse2D("y=")).toEqual({ ok: "empty" });
    expect(parse2D("")).toEqual({ ok: "empty" });
  });
});

describe("parse3D", () => {
  it("graphs z = f(x, y) with or without z =", () => {
    expect(ok(parse3D("x^2+y^2"))(1, 2)).toBe(5);
    expect(ok(parse3D("z=xy"))(2, 3)).toBe(6);
  });

  it("rejects other letters", () => {
    expect(parse3D("x+t")).toEqual({ ok: false, error: "Unknown letter “t”. Use x and y." });
  });
});
