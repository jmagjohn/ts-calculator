/**
 * Declarative keypad definition. The layout is data, not markup, so the DOM
 * builder and the styling stay dumb. `insert` keys append literal text;
 * `action` keys run a named command wired up in the controller.
 */

export type KeyVariant = "sci" | "op" | "digit" | "equals" | "warn";

export type KeyAction =
  | "clear"
  | "backspace"
  | "equals"
  | "negate"
  | "ans"
  | "square"
  | "inverse";

export type Key =
  | { kind: "insert"; label: string; text: string; variant?: KeyVariant; hint?: string }
  | { kind: "action"; label: string; action: KeyAction; variant?: KeyVariant; hint?: string };

const sci = (label: string, text: string, hint?: string): Key => ({
  kind: "insert",
  label,
  text,
  variant: "sci",
  hint,
});

const insert = (label: string, text = label, variant?: KeyVariant): Key => ({
  kind: "insert",
  label,
  text,
  variant,
});

const action = (label: string, name: KeyAction, variant?: KeyVariant, hint?: string): Key => ({
  kind: "action",
  label,
  action: name,
  variant,
  hint,
});

/** Five columns wide; rows wrap naturally in the CSS grid. */
export const KEYPAD_ROWS: Key[][] = [
  [
    sci("sin", "sin(", "sine"),
    sci("cos", "cos(", "cosine"),
    sci("tan", "tan(", "tangent"),
    sci("ln", "ln(", "natural log"),
    sci("log", "log10(", "log base 10"),
  ],
  [
    sci("√", "sqrt(", "square root"),
    action("x²", "square", "sci", "square"),
    sci("xʸ", "^", "power"),
    action("1/x", "inverse", "sci", "reciprocal"),
    sci("n!", "!", "factorial"),
  ],
  [
    insert("("),
    insert(")"),
    insert("π", "pi", "sci"),
    insert("e", "e", "sci"),
    insert("%", "%", "sci"),
  ],
  [
    insert("7"),
    insert("8"),
    insert("9"),
    insert("÷", "/", "op"),
    action("⌫", "backspace", "warn", "delete"),
  ],
  [
    insert("4"),
    insert("5"),
    insert("6"),
    insert("×", "*", "op"),
    action("AC", "clear", "warn", "all clear"),
  ],
  [
    insert("1"),
    insert("2"),
    insert("3"),
    insert("−", "-", "op"),
    action("ANS", "ans", "sci", "last answer"),
  ],
  [
    action("±", "negate", "sci", "toggle sign"),
    insert("0"),
    insert("."),
    insert("+", "+", "op"),
    action("=", "equals", "equals", "evaluate"),
  ],
];
