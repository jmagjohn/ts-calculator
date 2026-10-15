/**
 * Vendor MathLive's math fonts into public/ so the PWA renders math offline.
 *
 * MathLive loads its KaTeX fonts from a URL at runtime; pointing that URL at
 * our own origin (see main.ts) means a self-hosted deploy never reaches a CDN.
 *
 * Run automatically via the predev/prebuild scripts.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "mathlive", "fonts");
const target = join(root, "public", "mathlive", "fonts");

if (!existsSync(source)) {
  console.error(`MathLive fonts not found at ${source}. Is "mathlive" installed?`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

console.log("Copied MathLive fonts -> public/mathlive/fonts");
