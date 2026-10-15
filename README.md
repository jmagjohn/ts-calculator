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

## Behaviour

- **The screen never scrolls.** The calculator fills the viewport and is
  locked there (`100dvh`-style layout, `body { overflow: hidden }`).
- **Nothing is calculated until you press `=`.** There is no live preview.
- **One control chrome:** a small hamburger, top-right, opens a drawer with
  theme, angle mode, exact/decimal results, and history. No branding header.
- **Scanlines and CRT motion are off permanently** (the retro stylesheet's
  overlays are disabled and their toggles removed).

## The editor

The input is a **MathLive** `<math-field>`: a real structural editor.

| Key | What it does |
| --- | --- |
| `a/b` | inserts `\frac{\placeholder{}}{\placeholder{}}` — caret lands in the numerator |
| `x^n` | inserts `^{\placeholder{}}` — caret lands in the exponent |
| `√` | inserts `\sqrt{\placeholder{}}` — caret lands in the radicand |
| `←` `→` | move the caret through the structure |
| `⌫` | delete backwards |
| `sin cos tan ln log` | insert a function applied to a slot |

The `\placeholder{}` (rather than an empty group `{}`) is what makes MathLive
focus the new slot. This was found by browser QA, not by guessing.

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
index.html                     full-screen shell: math fields, keypad mount, drawer
public/
  retro.js                     retro-brutalist runtime (skill asset)
  sw.js                        offline app-shell service worker
  manifest.webmanifest         PWA manifest
  icons/                       PWA icons (generated)
src/
  main.ts                      bootstrap, MathLive font/sound config, service worker
  retro.css                    retro-brutalist stylesheet (skill asset)
  app.css                      locked full-screen layout
  engine/
    engine.ts                  compute-engine facade: LaTeX in, exact + decimal out
    engine.test.ts             unit tests
  ui/
    keypad.ts                  keypad as data (inserts, commands, actions)
    calculator.ts              controller: editor, results, history, drawer
scripts/
  copy-mathlive-assets.mjs     vendors MathLive fonts into public/
  generate-icons.mjs           generates the PWA icons (zero-dep PNG encoder)
```

## Known trade-offs

- **Bundle size.** MathLive + compute-engine are large: ~4.9 MB raw /
  ~1.4 MB gzipped. Fine as an installable PWA (fetched once, then cached
  offline), but a good candidate for code-splitting — e.g. lazy-load
  compute-engine on first `=` since it isn't needed to render the editor.
- **History is in-memory.** Persistence lands with a later pass.
