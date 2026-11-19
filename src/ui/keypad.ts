/**
 * Keypad as data.
 *
 * Layout (4 columns), modelled on a classic phone scientific calculator:
 *
 *   top row     2nd  ( )   %   cursor         <- 2nd mode: 2nd  (  )  E
 *   body        a/b   ÷    ×   ⌫              <- 2nd mode: paged scientific panel
 *               7     8    9   −
 *               4     5    6   +
 *               1     2    3   =  (tall)
 *               0 (wide)   .                  <- cursor mode: ◀ 0 . ▶, short =
 */

import type { Selector } from "mathlive";

export type KeyVariant = "num" | "op" | "fn" | "equals" | "danger" | "toggle";

/**
 * How an insert behaves right after `=`:
 *  - "fresh": start a new expression (digits, functions, constants)
 *  - "chain": continue from Ans (operators, postfix functions)
 */
export type AfterResult = "fresh" | "chain";

export type AppAction =
  | "second"
  | "cursor"
  | "equals"
  | "paren"
  | "ans"
  | "angle"
  | "backspace";

export type KeyAction =
  | { type: "insert"; latex: string; after: AfterResult }
  | { type: "command"; command: Selector }
  | { type: "app"; action: AppAction };

export interface Key {
  /** HTML label (may contain <sup>, <sub> or an inline SVG). */
  label: string;
  /** Accessible name. */
  aria: string;
  action: KeyAction;
  variant?: KeyVariant;
  /** Grid spans for the wide 0 and the tall =. */
  colSpan?: number;
  rowSpan?: number;
  /** Repeat while held (backspace, cursor arrows). */
  repeat?: boolean;
}

// -- icons (inline SVG, inherit currentColor) ------------------------------

const svg = (body: string, viewBox = "0 0 24 24"): string =>
  `<svg class="key__icon" viewBox="${viewBox}" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  fraction: svg(
    '<rect x="7" y="2.5" width="10" height="7" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
      '<rect x="3" y="11" width="18" height="2" fill="currentColor"/>' +
      '<rect x="7" y="14.5" width="10" height="7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  ),
  backspace: svg(
    '<path d="M8 5h13v14H8l-6-7z" fill="currentColor"/>' +
      '<path d="M11.5 9l5 6M16.5 9l-5 6" stroke="var(--key-face, #c0c0c0)" stroke-width="2.2"/>',
  ),
  cursor: svg(
    '<path d="M2 8h11M2 12h11M2 16h11" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M16 5h6M16 19h6M19 5v14" stroke="currentColor" stroke-width="2"/>',
  ),
  left: svg('<path d="M17 4v16L5 12z" fill="currentColor"/>'),
  right: svg('<path d="M7 4v16l12-8z" fill="currentColor"/>'),
};

// -- builders --------------------------------------------------------------

const num = (digit: string): Key => ({
  label: digit,
  aria: digit,
  action: { type: "insert", latex: digit, after: "fresh" },
  variant: "num",
});

const op = (label: string, latex: string, aria: string): Key => ({
  label,
  aria,
  action: { type: "insert", latex, after: "chain" },
  variant: "op",
});

/** A scientific key. \placeholder{} makes MathLive put the caret in that slot. */
const fn = (label: string, latex: string, aria: string, after: AfterResult = "fresh"): Key => ({
  label,
  aria,
  action: { type: "insert", latex, after },
  variant: "fn",
});

const app = (label: string, action: AppAction, aria: string, variant?: KeyVariant): Key => ({
  label,
  aria,
  action: { type: "app", action },
  variant,
});

const SLOT = "\\placeholder{}";

const backspace: Key = {
  ...app(ICONS.backspace, "backspace", "Backspace", "danger"),
  repeat: true,
};

const moveLeft: Key = {
  label: ICONS.left,
  aria: "Move cursor left",
  action: { type: "command", command: "moveToPreviousChar" },
  variant: "op",
  repeat: true,
};

const moveRight: Key = {
  label: ICONS.right,
  aria: "Move cursor right",
  action: { type: "command", command: "moveToNextChar" },
  variant: "op",
  repeat: true,
};

// -- layouts ---------------------------------------------------------------

export function topRow(second: boolean): Key[] {
  const secondKey = app("2<sup>nd</sup>", "second", "Second functions", "toggle");
  if (second) {
    return [
      secondKey,
      { ...fn("(", "(", "Open parenthesis"), variant: "op" },
      { ...fn(")", ")", "Close parenthesis", "chain"), variant: "op" },
      fn("E", `\\times10^{${SLOT}}`, "Times ten to the power", "chain"),
    ];
  }
  return [
    secondKey,
    { ...app("( )", "paren", "Parenthesis"), variant: "op" },
    op("%", "\\%", "Percent"),
    app(ICONS.cursor, "cursor", "Cursor keys", "toggle"),
  ];
}

export function mainBody(cursorMode: boolean): Key[] {
  const keys: Key[] = [
    fn(ICONS.fraction, `\\frac{${SLOT}}{${SLOT}}`, "Fraction"),
    op("÷", "\\div", "Divide"),
    op("×", "\\times", "Multiply"),
    backspace,
    num("7"),
    num("8"),
    num("9"),
    op("−", "-", "Minus"),
    num("4"),
    num("5"),
    num("6"),
    op("+", "+", "Plus"),
    num("1"),
    num("2"),
    num("3"),
    { ...app("=", "equals", "Equals", "equals"), rowSpan: cursorMode ? 1 : 2 },
  ];
  if (cursorMode) {
    keys.push(moveLeft, num("0"), num("."), moveRight);
  } else {
    keys.push({ ...num("0"), colSpan: 2 }, num("."));
  }
  return keys;
}

/** The 2nd panel: pages of 4 x 5 keys, scrolled vertically. */
export const SCIENCE_PAGES: { title: string; keys: Key[] }[] = [
  {
    title: "Powers & logs",
    keys: [
      fn("√", `\\sqrt{${SLOT}}`, "Square root"),
      fn("x<sup>2</sup>", "^{2}", "Square", "chain"),
      fn("<sup>n</sup>√", `\\sqrt[${SLOT}]{${SLOT}}`, "Nth root"),
      fn("x<sup>n</sup>", `^{${SLOT}}`, "Power", "chain"),

      fn("x<sup>−1</sup>", "^{-1}", "Reciprocal", "chain"),
      fn("x!", "!", "Factorial", "chain"),
      fn("<sup>n</sup>C<sub>r</sub>", `\\operatorname{nCr}\\left(${SLOT},${SLOT}\\right)`, "Combinations"),
      fn("<sup>n</sup>P<sub>r</sub>", `\\operatorname{nPr}\\left(${SLOT},${SLOT}\\right)`, "Permutations"),

      fn("ln", "\\ln(", "Natural log"),
      fn("e", "e", "Euler's number"),
      fn("e<sup>x</sup>", `e^{${SLOT}}`, "e to the power"),
      fn("π", "\\pi", "Pi"),

      fn("log", "\\log(", "Log base 10"),
      fn("log<sub>2</sub>", "\\log_{2}(", "Log base 2"),
      fn("log<sub>x</sub>", `\\log_{${SLOT}}\\left(${SLOT}\\right)`, "Log base x"),
      fn("10<sup>x</sup>", `10^{${SLOT}}`, "Ten to the power"),

      fn("1/x", `\\frac{1}{${SLOT}}`, "One over"),
      fn("2<sup>x</sup>", `2^{${SLOT}}`, "Two to the power"),
      fn("|x|", `\\left|${SLOT}\\right|`, "Absolute value"),
      { ...app("Ans", "ans", "Last answer"), variant: "fn" },
    ],
  },
  {
    title: "Trigonometry",
    keys: [
      fn("sin", "\\sin(", "Sine"),
      fn("cos", "\\cos(", "Cosine"),
      fn("tan", "\\tan(", "Tangent"),
      { ...app("DEG", "angle", "Switch degrees or radians"), variant: "toggle" },

      fn("sin<sup>−1</sup>", "\\arcsin(", "Inverse sine"),
      fn("cos<sup>−1</sup>", "\\arccos(", "Inverse cosine"),
      fn("tan<sup>−1</sup>", "\\arctan(", "Inverse tangent"),
      fn("°", "\\degree", "Degrees", "chain"),

      fn("sinh", "\\sinh(", "Hyperbolic sine"),
      fn("cosh", "\\cosh(", "Hyperbolic cosine"),
      fn("tanh", "\\tanh(", "Hyperbolic tangent"),
      fn("π", "\\pi", "Pi"),

      fn("sinh<sup>−1</sup>", "\\operatorname{arsinh}(", "Inverse hyperbolic sine"),
      fn("cosh<sup>−1</sup>", "\\operatorname{arcosh}(", "Inverse hyperbolic cosine"),
      fn("tanh<sup>−1</sup>", "\\operatorname{artanh}(", "Inverse hyperbolic tangent"),
      fn("x<sup>3</sup>", "^{3}", "Cube", "chain"),

      fn("sec", "\\sec(", "Secant"),
      fn("csc", "\\csc(", "Cosecant"),
      fn("cot", "\\cot(", "Cotangent"),
      fn("∛", `\\sqrt[3]{${SLOT}}`, "Cube root"),
    ],
  },
];
