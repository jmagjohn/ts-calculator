import { describe, expect, it } from "vitest";
import {
  evaluateExpression,
  evaluateNumber,
  toDisplay,
  toFraction,
} from "./engine";

describe("evaluateNumber", () => {
  it("honors operator precedence", () => {
    expect(evaluateNumber("2 + 3 * 4")).toBe(14);
    expect(evaluateNumber("(2 + 3) * 4")).toBe(20);
  });

  it("supports powers, roots and factorial", () => {
    expect(evaluateNumber("2 ^ 10")).toBe(1024);
    expect(evaluateNumber("sqrt(144)")).toBe(12);
    expect(evaluateNumber("5!")).toBe(120);
  });

  it("supports constants and scientific functions", () => {
    expect(evaluateNumber("pi", "rad")).toBeCloseTo(Math.PI, 10);
    expect(evaluateNumber("e", "rad")).toBeCloseTo(Math.E, 10);
    expect(evaluateNumber("ln(e)", "rad")).toBeCloseTo(1, 10);
    expect(evaluateNumber("log10(1000)", "rad")).toBe(3);
    expect(evaluateNumber("log2(8)", "rad")).toBe(3);
  });

  it("respects degree vs radian mode for trig", () => {
    expect(evaluateNumber("sin(30)", "deg")).toBeCloseTo(0.5, 10);
    expect(evaluateNumber("sin(0)", "rad")).toBe(0);
    expect(evaluateNumber("asin(1)", "deg")).toBeCloseTo(90, 10);
  });

  it("handles trailing percent and modulo", () => {
    expect(evaluateNumber("50%")).toBe(0.5);
    expect(evaluateNumber("10 % 3")).toBe(1);
  });

  it("reads values from an extra scope (e.g. ANS)", () => {
    expect(evaluateNumber("ans + 1", "rad", { ans: 41 })).toBe(42);
  });

  it("rejects malformed input and non-finite results", () => {
    expect(() => evaluateNumber("")).toThrow(/empty/i);
    expect(() => evaluateNumber("1 +")).toThrow();
    expect(() => evaluateNumber("1 / 0")).toThrow(/real number/i);
  });
});

describe("toDisplay", () => {
  it("trims floating-point noise", () => {
    expect(toDisplay(evaluateExpression("0.1 + 0.2"))).toBe("0.3");
  });

  it("renders integers without a decimal point", () => {
    expect(toDisplay(evaluateExpression("6 / 3"))).toBe("2");
  });

  it("keeps ordinary magnitudes out of exponential notation", () => {
    expect(toDisplay(100000)).toBe("100000");
    expect(toDisplay(123459)).toBe("123459");
    expect(toDisplay(0.0001)).toBe("0.0001");
  });

  it("still uses exponential for extreme magnitudes", () => {
    expect(toDisplay(1e21)).toBe("1e+21");
  });

  it("throws on non-finite numbers", () => {
    expect(() => toDisplay(Infinity)).toThrow(/finite/i);
  });
});

describe("toFraction", () => {
  it("renders simple fractions exactly", () => {
    expect(toFraction(1 / 3)).toBe("1/3");
    expect(toFraction(0.5)).toBe("1/2");
    expect(toFraction(1.25)).toBe("5/4");
    expect(toFraction(-0.75)).toBe("-3/4");
    expect(toFraction(0.1)).toBe("1/10");
  });

  it("refuses integers and irrationals", () => {
    expect(toFraction(2)).toBeNull();
    expect(toFraction(Math.PI)).toBeNull();
    expect(toFraction(Number.NaN)).toBeNull();
  });

  it("refuses non-number results", () => {
    expect(toFraction({ type: "Complex" })).toBeNull();
  });
});
