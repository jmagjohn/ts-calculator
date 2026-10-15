import { describe, expect, it } from "vitest";
import { evaluate, toLatex } from "./engine";

describe("evaluate", () => {
  it("parses LaTeX and evaluates arithmetic", () => {
    expect(evaluate("2+3\\times4").decimal).toBe("14");
    expect(evaluate("2^{10}").decimal).toBe("1024");
  });

  it("keeps exact forms instead of collapsing to decimals", () => {
    expect(evaluate("\\frac{1}{3}").exact).toBe("\\frac{1}{3}");
    expect(evaluate("\\frac{6}{4}").exact).toBe("\\frac{3}{2}");
    expect(evaluate("\\sqrt{2}").exact).toBe("\\sqrt{2}");
  });

  it("still offers a decimal approximation", () => {
    expect(evaluate("\\frac{1}{3}").decimal).toBe("0.333333333333");
  });

  it("trims floating-point noise", () => {
    expect(evaluate("0.1+0.2").decimal).toBe("0.3");
  });

  it("respects degree vs radian mode", () => {
    expect(evaluate("\\sin(30)", "deg").decimal).toBe("0.5");
    expect(evaluate("\\sin(30)", "rad").exact).toBe("\\sin(30)");
  });

  it("strips LaTeX thousands separators", () => {
    expect(evaluate("100000").exact).toBe("100000");
  });

  it("reports symbolic results with no numeric value", () => {
    const result = evaluate("q+1");
    expect(result.exact).toBe("q+1");
    expect(result.value).toBeNull();
    expect(result.decimal).toBeNull();
  });

  it("rejects empty and malformed input", () => {
    expect(() => evaluate("")).toThrow(/empty/i);
    expect(() => evaluate("1+")).toThrow(/invalid/i);
  });
});

describe("toLatex", () => {
  it("picks exact or decimal by preference", () => {
    const result = evaluate("\\frac{1}{3}");
    expect(toLatex(result, "exact")).toBe("\\frac{1}{3}");
    expect(toLatex(result, "decimal")).toBe("0.333333333333");
  });

  it("falls back to the exact form when no finite value exists", () => {
    expect(toLatex(evaluate("q+1"), "decimal")).toBe("q+1");
  });
});
