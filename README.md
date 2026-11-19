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
display, square corners, Tahoma, and a taskbar with a working Start menu.

## Buttons

The layout follows a classic phone scientific calculator:

| Row | Keys |
| --- | --- |
| Toolbar | `Settings` `Copy` `Paste` `Clear` |
| Top | `2nd` · smart `( )` · `%` · cursor-keys toggle |
| Body | fraction `÷` `×` `⌫` / `7 8 9 −` / `4 5 6 +` / `1 2 3 =` / `0 .` |

- **`2nd`** swaps the body for a tabbed scientific panel (swipe or tap the
  tabs): √, x², ⁿ√, xⁿ, x⁻¹, x!, nCr, nPr, ln, e, eˣ, π, log, log₂, logₓ, 10ˣ,
  1/x, 2ˣ, |x|, Ans, and sin/cos/tan, their inverses, hyperbolic functions,
  sec/csc/cot, °, ∛, and a DEG/RAD switch. The top row becomes `( ) E`.
- **`( )`** opens a bracket, or closes one when a bracket is open and a value
  comes before the cursor.
- **Cursor toggle** adds ◀ ▶ keys (hold to repeat) for moving through
  fractions, powers and roots. `⌫` also repeats while held.
- **After `=`**: a digit or function starts a new calculation; an operator
  continues from `Ans`.
- **Tap the answer** to flip between fraction and decimal.
- **Settings**: degrees/radians, answer format (auto / exact / decimal),
  animations on or off. Settings and the last 50 calculations are saved on
  the device.
- Nothing is calculated until you press `=`. Enter evaluates and Escape clears
  on a physical keyboard.

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
| History, Start menu | staggered reveal (AN-03) |
| Windows | zoom open from the button that opened them |
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
index.html                     window, display, toolbar, taskbar, dialogs
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
  ui/
    keypad.ts                  keypad layouts as data
    calculator.ts              controller: editor, keys, results, windows
    motion.ts                  animation helpers (Web Animations API)
    storage.ts                 saved settings + history
scripts/
  copy-mathlive-assets.mjs     vendors MathLive fonts into public/
  generate-icons.mjs           generates the PWA icons (zero-dep PNG encoder)
```

## Known trade-offs

- **Bundle size.** MathLive + compute-engine are large: ~4.9 MB raw /
  ~1.4 MB gzipped. Fine as an installable PWA (fetched once, then cached
  offline), but a good candidate for code-splitting — e.g. lazy-load
  compute-engine on first `=` since it isn't needed to render the editor.
