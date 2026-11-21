import { describe, expect, it } from "vitest";
import { calculate, decimalToLatex, evaluate, expandAns, findRoots, solutionsLatex, formatNumber, isTidyExact, prefersExact, toLatex } from "./engine";

describe("evaluate", () => {
  it("parses LaTeX and evaluates arithmetic", () => {
    expect(evaluate("2+3\\times4").decimal).toBe("14");
    expect(evaluate("2^{10}").decimal).toBe("1024");
    expect(evaluate("8\\div2").decimal).toBe("4");
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
    expect(evaluate("\\arcsin(1)", "deg").decimal).toBe("90");
    expect(evaluate("\\sin(\\frac{\\pi}{6})", "rad").decimal).toBe("0.5");
  });

  it("handles the scientific panel's functions", () => {
    expect(evaluate("50\\%").decimal).toBe("0.5");
    expect(evaluate("5!").decimal).toBe("120");
    expect(evaluate("\\operatorname{nCr}\\left(5,2\\right)").decimal).toBe("10");
    expect(evaluate("\\operatorname{nPr}\\left(5,2\\right)").decimal).toBe("20");
    expect(evaluate("\\sqrt[3]{27}").decimal).toBe("3");
    expect(evaluate("\\log_{2}\\left(8\\right)").decimal).toBe("3");
    expect(evaluate("\\log(1000)").decimal).toBe("3");
    expect(evaluate("\\left|-3\\right|").decimal).toBe("3");
    expect(evaluate("2\\times10^{3}").decimal).toBe("2000");
  });

  it("substitutes Ans with the previous answer", () => {
    expect(evaluate("\\mathrm{Ans}+1", "rad", "\\frac{1}{3}").exact).toBe("\\frac{4}{3}");
    expect(evaluate("2\\mathrm{Ans}", "rad", "-3").decimal).toBe("-6");
    expect(() => evaluate("\\mathrm{Ans}+1", "rad", null)).toThrow(/no answer/i);
  });

  it("explains errors in words", () => {
    expect(() => evaluate("")).toThrow(/nothing/i);
    expect(() => evaluate("1+")).toThrow(/syntax/i);
    expect(() => evaluate("\\frac{1}{0}")).toThrow(/undefined/i);
    expect(() => evaluate("\\frac{\\placeholder{}}{2}")).toThrow(/empty box/i);
  });

  it("reports symbolic results with no numeric value", () => {
    const result = evaluate("q+1");
    expect(result.exact).toBe("q+1");
    expect(result.value).toBeNull();
  });
});

describe("result formatting", () => {
  it("auto shows tidy fractions and radicals exactly, the rest as decimals", () => {
    expect(isTidyExact(evaluate("\\frac{1}{3}"))).toBe(true);
    expect(isTidyExact(evaluate("\\sqrt{8}"))).toBe(true);
    expect(isTidyExact(evaluate("e^{2}"))).toBe(false);
    expect(isTidyExact(evaluate("\\sin(30)", "rad"))).toBe(false);
    expect(isTidyExact(evaluate("12"))).toBe(false);
  });

  it("honours an explicit preference", () => {
    const third = evaluate("\\frac{1}{3}");
    expect(prefersExact(third, "decimal")).toBe(false);
    expect(prefersExact(third, "exact")).toBe(true);
    expect(toLatex(third, false)).toBe("0.333333333333");
  });

  it("groups thousands and writes exponents as powers of ten", () => {
    expect(decimalToLatex("1234567.25")).toBe("1{,}234{,}567.25");
    expect(decimalToLatex("-1000")).toBe("-1{,}000");
    expect(decimalToLatex("1.5e-10")).toBe("1.5\\times10^{-10}");
  });

  it("switches to scientific notation for huge and tiny numbers", () => {
    expect(formatNumber(2 ** 60)).toBe("1.152921505e18");
    expect(formatNumber(1.5e-10)).toBe("1.5e-10");
    expect(formatNumber(123.456)).toBe("123.456");
  });
});

describe("expandAns", () => {
  it("writes Ans out as its value, with parentheses when needed", () => {
    expect(expandAns("\\mathrm{Ans}\\times2", "14")).toBe("14\\times2");
    expect(expandAns("\\mathrm{Ans}\\times2", "1+\\sqrt{2}")).toBe("\\left(1+\\sqrt{2}\\right)\\times2");
    expect(expandAns("3+4", "14")).toBe("3+4");
  });
});

describe("calculate", () => {
  const solve = (latex: string, angle: "deg" | "rad" = "rad") => {
    const outcome = calculate(latex, angle);
    if (outcome.kind !== "solutions") {
      throw new Error(`expected solutions, got ${outcome.kind}`);
    }
    return outcome;
  };

  it("evaluates plain expressions", () => {
    const outcome = calculate("2+3");
    expect(outcome.kind === "value" && outcome.result.decimal).toBe("5");
  });

  it("solves linear and quadratic equations exactly", () => {
    expect(solve("2x+3=11").solutions.map((s) => s.exact)).toEqual(["4"]);
    expect(solve("x^2-5x+6=0").solutions.map((s) => s.exact)).toEqual(["2", "3"]);
    expect(solve("x^2=2").solutions.map((s) => s.exact)).toEqual(["-\\sqrt{2}", "\\sqrt{2}"]);
  });

  it("solves for whatever letter is used", () => {
    const outcome = solve("a+3=7");
    expect(outcome.variable).toBe("a");
    expect(outcome.solutions[0].exact).toBe("4");
  });

  it("drops complex roots", () => {
    expect(solve("x^3=8").solutions.map((s) => s.exact)).toEqual(["2"]);
    expect(() => calculate("x^2+1=0")).toThrow(/no real solution/i);
  });

  it("solves trig equations in degrees", () => {
    expect(solve("\\sin(x)=0.5", "deg").solutions.map((s) => s.decimal)).toEqual(["30", "150"]);
  });

  it("falls back to a numeric search", () => {
    const outcome = solve("\\cos(x)=x");
    expect(outcome.approximate).toBe(true);
    expect(outcome.solutions[0].value).toBeCloseTo(0.739085, 5);
  });

  it("checks equations with no unknowns", () => {
    expect(calculate("2+2=4")).toEqual({ kind: "truth", value: true });
    expect(calculate("2+2=5")).toEqual({ kind: "truth", value: false });
  });

  it("explains malformed equations", () => {
    expect(() => calculate("x=1=2")).toThrow(/only one/i);
    expect(() => calculate("2x=")).toThrow(/both sides/i);
  });

  it("writes solution sets", () => {
    const outcome = solve("x^2-5x+6=0");
    expect(solutionsLatex("x", outcome.solutions, true, false)).toBe("x=2,\\;3");
    const third = solve("3x=1");
    expect(solutionsLatex("x", third.solutions, false, false)).toBe("x\\approx0.333333333333");
    expect(solutionsLatex("x", solve("2x=1").solutions, false, false)).toBe("x=0.5");
  });
});

describe("findRoots", () => {
  it("finds sign changes and ignores poles", () => {
    expect(findRoots((t) => t * t - 4)).toEqual([-2, 2]);
    expect(findRoots((t) => Math.tan(t), 4)).toEqual([-3.14159265359, 0, 3.14159265359]);
  });
});

describe("tidy exact forms", () => {
  it("prefers decimals for fractions with big numbers", () => {
    expect(isTidyExact(evaluate("\\frac{69208015}{99}"))).toBe(false);
  });
});
