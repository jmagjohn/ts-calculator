/**
 * Declarative keypad. The editor is a MathLive math-field, so a key does one
 * of three things: insert LaTeX (including structural templates like
 * \frac{}{} that create slots you can type into), run a MathLive navigation
 * command (move/delete through the structure), or run an app action.
 */

import type { Selector } from "mathlive";

export type KeyVariant = "sci" | "op" | "digit" | "equals" | "warn" | "nav";

export type AppAction = "clear" | "equals" | "ans";

export type Key =
  | { kind: "insert"; label: string; latex: string; variant?: KeyVariant; hint?: string }
  | { kind: "command"; label: string; command: Selector; variant?: KeyVariant; hint?: string }
  | { kind: "action"; label: string; action: AppAction; variant?: KeyVariant; hint?: string };

const insert = (label: string, latex: string, variant?: KeyVariant, hint?: string): Key => ({
  kind: "insert",
  label,
  latex,
  variant,
  hint,
});

const command = (label: string, name: Selector, hint: string): Key => ({
  kind: "command",
  label,
  command: name,
  variant: "nav",
  hint,
});

const action = (label: string, name: AppAction, variant?: KeyVariant, hint?: string): Key => ({
  kind: "action",
  label,
  action: name,
  variant,
  hint,
});

/** Five columns wide; seven rows fill the screen. */
export const KEYPAD_ROWS: Key[][] = [
  [
    command("←", "moveToPreviousChar", "move left"),
    command("→", "moveToNextChar", "move right"),
    insert("(", "("),
    insert(")", ")"),
    command("⌫", "deleteBackward", "delete"),
  ],
  [
    // \placeholder{} (not an empty group) is what makes MathLive focus the slot,
    // so typing lands inside the numerator/exponent instead of after it.
    insert("a/b", "\\frac{\\placeholder{}}{\\placeholder{}}", "sci", "fraction"),
    insert("x^n", "^{\\placeholder{}}", "sci", "exponent"),
    insert("√", "\\sqrt{\\placeholder{}}", "sci", "square root"),
    insert("π", "\\pi", "sci", "pi"),
    insert("e", "e", "sci", "euler's number"),
  ],
  [
    insert("sin", "\\sin(", "sci", "sine"),
    insert("cos", "\\cos(", "sci", "cosine"),
    insert("tan", "\\tan(", "sci", "tangent"),
    insert("ln", "\\ln(", "sci", "natural log"),
    insert("log", "\\log(", "sci", "log base 10"),
  ],
  [
    insert("7", "7"),
    insert("8", "8"),
    insert("9", "9"),
    insert("÷", "/", "op", "divide"),
    action("AC", "clear", "warn", "all clear"),
  ],
  [
    insert("4", "4"),
    insert("5", "5"),
    insert("6", "6"),
    insert("×", "\\times", "op", "multiply"),
    insert("!", "!", "sci", "factorial"),
  ],
  [
    insert("1", "1"),
    insert("2", "2"),
    insert("3", "3"),
    insert("−", "-", "op", "minus"),
    insert("x²", "^{2}", "sci", "square"),
  ],
  [
    insert("0", "0"),
    insert(".", "."),
    action("ANS", "ans", "sci", "last answer"),
    insert("+", "+", "op", "plus"),
    action("=", "equals", "equals", "evaluate"),
  ],
];
