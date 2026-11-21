# Calculator

A full-screen scientific calculator in pure TypeScript with a **Word-style
structural equation editor**: type a fraction and it becomes a stacked fraction
you can cursor *into*; build `2^` and the exponent becomes a slot you type into.

- **Live:** https://ts-calculator-sigma.vercel.app
- **Source:** https://github.com/jmagjohn/ts-calculator

## Install on your phone (PWA)

Installable and offline-capable after the first visit.

- **Android / Chrome:** open the live URL, menu, **"Install app"**
- **iOS / Safari:** open the live URL, **Share**, **"Add to Home Screen"**

The service worker (`public/sw.js`) caches the app shell; navigations are
network-first so a new deploy is picked up on the next online load.

## Look

Styled after the **Retro desktop** theme (lookbook LB-30): a teal desktop,
a silver window with 4-layer bevels, a navy-gradient title bar, a sunken white
display, square corners and Tahoma. Property-sheet tabs switch between
**Calc · Graph · 3D · History**.

## Buttons

Five columns, modelled on a phone scientific calculator:

| Row | Keys |
| --- | --- |
| Toolbar | `Settings` `Copy` `Paste` `Clear` |
| Top | `2nd` · smart `( )` · `%` · `◀` `▶` |
| Body | fraction `xⁿ` `√` `x` `=` / `7 8 9 ÷ ⌫` / `4 5 6 × −` / `1 2 3 +` **ENTER** / `0 .` `Ans` |

- **`=` is a symbol you type**, so you can write equations. **ENTER** does the
  work:
  - no `=`: evaluates (or simplifies: `x + x` → `2x`)
  - an `=` and a letter: solves for it (x if present): `2x+3=11` → `x = 4`,
    `x²−5x+6=0` → `x = 2, 3`, `x² = 2` → `x = −√2, √2`. Complex roots are
    dropped. Equations algebra can't crack (`cos x = x`) are solved by a
    numeric search and shown with ≈.
  - an `=` and no letters: says True or False.
- **`◀ ▶`** move through fractions, powers and roots (hold to repeat).
- **`2nd`** swaps the body for a tabbed scientific panel (swipe or tap the
  tabs): x², ⁿ√, x⁻¹, x!, E, nCr, nPr, ln, e, eˣ, log, log₂, logₓ, 10ˣ, π, 1/x,
  2ˣ, |x|, ∛, y, and sin/cos/tan, their inverses, hyperbolic functions,
  sec/csc/cot, °, x³ and a DEG/RAD switch.
- **`( )`** opens a bracket, or closes one when a bracket is open and a value
  comes before the cursor.
- **After ENTER**: a digit or function starts a new calculation; an operator
  continues from `Ans`.
- **Exact answers** show a small `≈ decimal` line underneath; tap the answer to
  flip between fraction and decimal. Fractions with big numbers show as
  decimals.
- Long expressions shrink to fit the display (width and height) and, past a
  minimum size, scroll with the cursor instead of being cut off.
- **Settings**: degrees/radians, answer format (auto / exact / decimal),
  animations on or off. Settings and the last 50 calculations are saved on
  the device.
- On a physical keyboard Enter is ENTER and Escape clears.

## Graphing

**Graph** plots up to six equations at once, each in its own colour. Tap the
colour square to hide or show one.

| You type | It draws |
| --- | --- |
| `y = sin(x)` or just `sin(x)` | a function of x |
| `x = y²` | a function of y |
| `x² + y² = 9` | any equation in x and y (implicit, by marching squares) |

Drag to move, pinch or scroll to zoom, double-tap or ⌂ to reset. Tap a curve to
read off a point; drag that point to slide it along the curve.

**3D** plots surfaces `z = f(x, y)` (type just the right-hand side). Drag to
spin (it coasts when you let go and slowly turns by itself when idle), pinch to
zoom, `+`/`−` to change the x/y range. One surface is coloured by height;
several are drawn in solid colours.

Both tabs share a keypad with x, y, =, powers, roots, trig and logs. It opens
when you tap an equation; **Done** or tapping the graph puts it away. Graphs
always use radians. Equations compile to JavaScript via compute-engine, so a
point costs well under a microsecond.

## Animations

Taken from the motion lookbook and turned off by the Animations setting or the
system's reduced-motion preference:

| Where | Animation |
| --- | --- |
| Every key | press squish + spring back (AN-06), with a Win95 bevel flip |
| `2nd` / cursor toggle | fade-through swap (AN-01) |
| `Clear` | circle wipe from the button (AN-04) |
| Errors | shake (AN-11) |
| `Copy` / `Paste` | label morphs into a check (AN-10) |
| Tabs | fade-through (AN-01) |
| History | staggered reveal (AN-03) |
| Graphs | curves draw on left to right; 3D surfaces rise up with a spring |
| Settings window | zooms open from the button |
| Answer | rises in with a spring |

## Stack

| Concern | Choice |
| --- | --- |
| Math input | [`mathlive`](https://mathlive.io/) — the structural editor |
| Evaluation | [`@cortex-js/compute-engine`](https://cortexjs.io/compute-engine/) — parses the editor's LaTeX and evaluates it (a CAS) |
| Build | Vite + TypeScript (strict) |
| Tests | Vitest |

Why compute-engine? Because it parses **LaTeX directly** (the editor's native
format) and keeps *exact* forms: `1/3` evaluates to `\frac{1}{3}`, not
`0.333...`. That powers the Exact/Decimal toggle and gives us a symbolic engine
for the calculus roadmap. Hand-building a structural editor or a LaTeX parser
would be a bug farm.

Maths fonts are vendored into `public/mathlive/fonts` at dev/build time
(`scripts/copy-mathlive-assets.mjs`) so math renders offline with no CDN.

## Commands

```bash
pnpm install     # deps (vite, typescript, vitest, mathlive, compute-engine)
pnpm dev         # local dev server
pnpm test        # unit tests
pnpm build       # typecheck + production build into dist/
pnpm preview     # serve the built output locally
```

## Deploy

Vercel auto-detects Vite; `vercel.json` pins the build command and output
directory. The project is connected to the GitHub repo, so pushing to `main`
triggers a production deploy.

## Layout

```
index.html                     window, tabs, calculator page, settings dialog
public/
  sw.js                        offline app-shell service worker
  manifest.webmanifest         PWA manifest
  icons/                       PWA icons (generated)
src/
  main.ts                      bootstrap, MathLive font/sound config, service worker
  app.css                      retro desktop theme + layout
  engine/
    engine.ts                  compute-engine facade: LaTeX in, exact + decimal out
    engine.test.ts             unit tests
  graph/
    equation.ts                equation LaTeX -> compiled function (2D kinds, 3D)
    equation.test.ts           unit tests
    plot2d.ts                  2D canvas plotter: grid, curves, implicit, trace
    plot3d.ts                  3D canvas surface renderer: mesh, shading, orbit
  ui/
    app.ts                     tabs and pages
    keypad.ts                  keypad layouts as data
    keys.ts                    key buttons: press squish, hold-to-repeat
    calculator.ts              calculator + history pages
    graph.ts                   graph pages: equation list, keypad, plot
    motion.ts                  animation helpers (Web Animations API)
    storage.ts                 saved settings, history, equations, last tab
scripts/
  copy-mathlive-assets.mjs     vendors MathLive fonts into public/
  generate-icons.mjs           generates the PWA icons (zero-dep PNG encoder)
```

## Known trade-offs

- **Bundle size.** MathLive + compute-engine are large: ~4.9 MB raw /
  ~1.4 MB gzipped. Fine as an installable PWA (fetched once, then cached
  offline), but a good candidate for code-splitting — e.g. lazy-load
  compute-engine on first `=` since it isn't needed to render the editor.
