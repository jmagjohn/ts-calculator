# TS Calculator

A scientific calculator written **entirely in TypeScript**, built on
[mathjs](https://mathjs.org/), packaged with Vite, and deployed as static
(serverless) hosting on Vercel.

- **Live:** https://ts-calculator-sigma.vercel.app
- **Source:** https://github.com/jmagjohn/ts-calculator

## Install on your phone (PWA)

This is an installable PWA: it runs full-screen with no browser chrome and
works offline after the first visit.

- **Android / Chrome:** open the live URL, open the menu, choose
  **"Install app" / "Add to Home screen"**.
- **iOS / Safari:** open the live URL, tap **Share**, then
  **"Add to Home Screen"**.

The service worker (`public/sw.js`) caches the app shell. Navigations are
network-first, so a new deploy is picked up on the next online load.

## Status

**v1 — Scientific engine.** Functions, constants, degree/radian modes, live
preview, and a clickable history tape.

Shipped:
- **v1** — Scientific engine
- **PWA** — installable + offline (manifest + service worker)

Planned:
- **v2** — Calculus (numeric derivative/integral, then symbolic via `nerdamer`)
- **v3** — 2D plots (cartesian, polar, parametric)
- **v4** — 3D surfaces (`three.js`)

## Features (v1)

- `+ - * / ^ % !` with full precedence, parentheses, and mathjs's expression grammar
- Trig (`sin/cos/tan` + `asin/acos/atan`), `ln`, `log10`, `sqrt`, `abs`, factorial
- Constants `π` and `e`, plus `ANS` (recall the last answer)
- Degree / radian toggle (bare `sin(30)` = `0.5` in Deg mode)
- Decimal / fraction result toggle (`1/3`, `5/4`, `-3/4`; irrationals stay decimal)
- Full expression entry: nothing is computed until you press `=`
- In-place editing in a real text field: click to place the caret, arrow keys,
  Home/End, drag-select, Ctrl+A. The keypad inserts at the caret, not the end
- Live result preview, float-noise trimming (`0.1 + 0.2` shows `0.3`)
- Sane notation: `100000` stays `100000` (no `1e+5` until ~1e21)
- Clickable history tape
- Installable PWA with offline support
- Retro-brutalist CRT UI (9 themes, scanline/motion toggles) — via the
  `retro-brutalist-ui` skill's drop-in stylesheet

## Why mathjs and not a hand-rolled parser?

v0 shipped a hand-written tokenizer + recursive-descent parser — nice for
learning, but reimplementing a computer algebra system by hand is a
not-invented-here trap. `src/engine/engine.ts` is a thin, typed facade over
mathjs that adds only the calculator-specific bits: angle-mode handling, the
missing `ln` alias, and display formatting. No `eval` anywhere.

## Commands

```bash
pnpm install     # deps (vite, typescript, vitest, mathjs)
pnpm dev         # local dev server
pnpm test        # unit tests
pnpm build       # typecheck + production build into dist/
pnpm preview     # serve the built output locally
```

## Deploy to Vercel

```bash
vercel           # preview deployment
vercel --prod    # production deployment
```

Vercel auto-detects Vite; `vercel.json` pins the build command and output
directory. The result is a static site served from Vercel's edge CDN.

The project is already connected to the GitHub repo, so pushing to `main`
triggers a production deploy automatically.

## Project layout

```
index.html                    # markup: display, keypad mount, history, toolbar
public/retro.js               # retro-brutalist runtime (skill asset, copied in)
src/
  main.ts                     # entry point
  retro.css                   # retro-brutalist stylesheet (skill asset, copied in)
  app.css                     # app-specific layout on top of retro.css
  engine/
    engine.ts                 # mathjs facade: angle modes, formatting
    engine.test.ts            # unit tests
  ui/
    keypad.ts                 # declarative keypad layout (data, not markup)
    calculator.ts             # controller: state, render, events, keyboard
```

## Known trade-offs

- **Bundle size.** Importing all of mathjs costs ~647 kB raw / ~183 kB gzipped.
  It can be slimmed dramatically by importing only the needed functions via
  `create({...})` instead of `all`. Deferred until the v2/v3 feature set is known.
- **History is in-memory.** Persistence (localStorage) lands with the PWA work in v5.
