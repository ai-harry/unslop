// Generates the menu-bar tray icon as a macOS "template" PNG with no image
// dependencies. A template image is black-on-transparent; macOS recolors it to
// match the menu bar (light/dark). We draw a simple rounded speech bubble.
//
// Output: resources/trayTemplate.png (16x16), resources/trayTemplate@2x.png (32x32).
// Run via `npm run icons` (invoked automatically by `npm run build`).

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "resources");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// RGBA (color type 6): 4 bytes/pixel. Used for the full-color app icon.
function encodeRgbaPng(size, colorAt) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter byte: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = colorAt(x, y);
      const off = y * (stride + 1) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Grayscale + alpha (color type 4): 2 bytes/pixel. Black shape, transparent bg.
function encodePng(size, shape) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 4; // color type: grayscale + alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = size * 2;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter byte: none
    for (let x = 0; x < size; x++) {
      const a = shape(x, y) ? 255 : 0;
      const off = y * (stride + 1) + 1 + x * 2;
      raw[off] = 0; // gray = black
      raw[off + 1] = a; // alpha
    }
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A rounded speech bubble: a rounded rectangle body plus a small tail bottom-left.
function bubbleShape(size) {
  const pad = size * 0.12;
  const left = pad;
  const right = size - pad;
  const top = pad;
  const bottom = size - pad * 1.9; // leave room for the tail
  const radius = size * 0.22;
  const tailX = size * 0.32;
  const tailW = size * 0.16;

  return (x, y) => {
    // Tail triangle below the body.
    if (y >= bottom && y <= size - pad) {
      const t = (y - bottom) / (size - pad - bottom);
      const half = (tailW / 2) * (1 - t);
      if (x >= tailX - half && x <= tailX + half) return true;
    }
    if (x < left || x > right || y < top || y > bottom) return false;
    // Rounded corners.
    const corners = [
      [left + radius, top + radius],
      [right - radius, top + radius],
      [left + radius, bottom - radius],
      [right - radius, bottom - radius],
    ];
    const insetX = x < left + radius || x > right - radius;
    const insetY = y < top + radius || y > bottom - radius;
    if (insetX && insetY) {
      for (const [cx, cy] of corners) {
        const dx = x - cx;
        const dy = y - cy;
        if (
          ((x < left + radius && dx <= 0) || (x > right - radius && dx >= 0)) &&
          ((y < top + radius && dy <= 0) || (y > bottom - radius && dy >= 0))
        ) {
          if (dx * dx + dy * dy <= radius * radius) return true;
          return false;
        }
      }
    }
    return true;
  };
}

// Test whether (x, y) is inside a rounded rectangle [l,t]-[r,b] with corner `rad`.
function inRoundedRect(x, y, l, t, r, b, rad) {
  if (x < l || x > r || y < t || y > b) return false;
  const corners = [
    [l + rad, t + rad, x < l + rad, y < t + rad],
    [r - rad, t + rad, x > r - rad, y < t + rad],
    [l + rad, b - rad, x < l + rad, y > b - rad],
    [r - rad, b - rad, x > r - rad, y > b - rad],
  ];
  for (const [cx, cy, condX, condY] of corners) {
    if (condX && condY) {
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= rad * rad;
    }
  }
  return true;
}

// The full-color app icon: a gold rounded-square tile (macOS "squircle"-ish) with
// a dark speech bubble drawn on top — the same mark as the menu-bar template.
function appIcon(size) {
  const margin = size * 0.08; // transparent breathing room around the tile
  const left = margin;
  const top = margin;
  const right = size - margin;
  const bottom = size - margin;
  const radius = (right - left) * 0.2237; // Big Sur-ish corner radius
  const bubble = bubbleShape(size);

  const GOLD = [255, 210, 63]; // --accent
  const INK = [42, 35, 0]; // --accent-ink

  return (x, y) => {
    if (!inRoundedRect(x, y, left, top, right, bottom, radius)) return [0, 0, 0, 0];
    if (bubble(x, y)) return [INK[0], INK[1], INK[2], 255];
    return [GOLD[0], GOLD[1], GOLD[2], 255];
  };
}

mkdirSync(outDir, { recursive: true });
const png16 = encodePng(16, bubbleShape(16));
const png32 = encodePng(32, bubbleShape(32));
writeFileSync(join(outDir, "trayTemplate.png"), png16);
writeFileSync(join(outDir, "trayTemplate@2x.png"), png32);
// Full-color app icon (Finder/Dock/DMG). electron-builder requires >= 512x512.
const appPng = encodeRgbaPng(512, appIcon(512));
writeFileSync(join(outDir, "icon.png"), appPng);

// Also emit the tray icon as a bundled TS module of base64 strings. The main
// process builds the tray nativeImage from these, so the menu-bar icon works
// identically in dev and in the packaged app with no runtime file path lookup.
const mod = `// AUTO-GENERATED by scripts/make-icons.mjs. Do not edit by hand.
// Base64 PNGs for the menu-bar tray template image (1x and 2x).
export const TRAY_ICON_16 = "${png16.toString("base64")}";
export const TRAY_ICON_32 = "${png32.toString("base64")}";
`;
writeFileSync(join(__dirname, "..", "src", "main", "tray-icon.ts"), mod);

process.stdout.write("Wrote tray icons to resources/ and src/main/tray-icon.ts\n");
