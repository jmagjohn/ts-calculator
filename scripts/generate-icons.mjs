/**
 * Generate the PWA icons with zero dependencies.
 *
 * Android only offers "Install app" when the manifest ships a >=192px PNG, so
 * we hand-roll a minimal PNG encoder (Node's zlib does the hard part) and draw
 * a simple phosphor-CRT mark: a neon frame plus an "=" sign.
 *
 * Run: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BG = [8, 9, 10, 255];
const GREEN = [0, 255, 156, 255];
const AMBER = [255, 196, 0, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Draw the mark. `safe` shrinks the glyph so a maskable crop can't clip it. */
function renderIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = 255;
  }

  const plot = (x, y, colour) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = colour[0];
    rgba[i + 1] = colour[1];
    rgba[i + 2] = colour[2];
    rgba[i + 3] = colour[3];
  };

  const rect = (x0, y0, w, h, colour) => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) plot(x, y, colour);
    }
  };

  const frame = Math.round(size * 0.06);
  const barWidth = Math.round(size * (maskable ? 0.34 : 0.46));
  const barHeight = Math.round(size * (maskable ? 0.075 : 0.09));
  const gap = Math.round(size * 0.085);
  const x0 = Math.round((size - barWidth) / 2);
  const yTop = Math.round(size / 2 - gap / 2 - barHeight);
  const yBottom = Math.round(size / 2 + gap / 2);

  if (!maskable) {
    // Neon frame, inset so it survives small renderings.
    rect(0, 0, size, frame, GREEN);
    rect(0, size - frame, size, frame, GREEN);
    rect(0, 0, frame, size, GREEN);
    rect(size - frame, 0, frame, size, GREEN);
  }

  rect(x0, yTop, barWidth, barHeight, GREEN);
  rect(x0, yBottom, barWidth, barHeight, AMBER);

  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { maskable: true }],
];

for (const [name, size, options] of targets) {
  const png = renderIcon(size, options);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name}: ${png.length} bytes`);
}
