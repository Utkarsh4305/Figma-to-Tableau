/**
 * Generates icon.png — a 128×128 dark-rounded-square with three ascending
 * white bars, matching the in-UI SVG logo — using only Node built-ins.
 * No npm dependencies required.
 */
import { createWriteStream } from "fs";
import { createDeflate } from "zlib";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const W = 128, H = 128;

/* ── helpers ── */
const u8  = (n) => n & 0xff;
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const crc32 = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const typeBytes = [...type].map(c => c.charCodeAt(0));
  const payload   = [...typeBytes, ...data];
  const len       = u32(data.length);
  const crc       = u32(crc32(payload));
  return [...len, ...typeBytes, ...data, ...crc];
}

/* ── draw pixels ── */
const pixels = new Uint8Array(W * H * 4); // RGBA

// corner radius for the background rect
const BG   = [30, 30, 30, 255];   // #1e1e1e
const ZERO = [0, 0, 0, 0];        // transparent
const R    = 22;                   // corner radius

function setPixel(x, y, rgba) {
  const i = (y * W + x) * 4;
  pixels[i]   = rgba[0];
  pixels[i+1] = rgba[1];
  pixels[i+2] = rgba[2];
  pixels[i+3] = rgba[3];
}

function inRoundedRect(x, y, rx, ry, rw, rh, r) {
  const dx = Math.max(rx - x, 0, x - (rx + rw - 1));
  const dy = Math.max(ry - y, 0, y - (ry + rh - 1));
  return dx * dx + dy * dy <= r * r;
}

// Background
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    setPixel(x, y, inRoundedRect(x, y, 0, 0, W, H, R) ? BG : ZERO);
  }
}

// Draw a filled rect helper
function fillRect(x0, y0, w, h, rgba, alpha = 1) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      if (pixels[i+3] === 0) continue; // don't draw on transparent
      pixels[i]   = rgba[0];
      pixels[i+1] = rgba[1];
      pixels[i+2] = rgba[2];
      pixels[i+3] = Math.round(rgba[3] * alpha);
    }
  }
}

// Three ascending bars (same proportions as SVG scaled to 128px)
// SVG coords were in a 40px space → multiply by 128/40 = 3.2
const s = 128 / 40;
// Left bar:   x=8,y=22,w=5,h=10 → opacity 0.4
fillRect(Math.round(8*s), Math.round(22*s), Math.round(5*s), Math.round(10*s), [240,240,240,255], 0.4);
// Middle bar: x=17,y=16,w=5,h=16 → opacity 0.7
fillRect(Math.round(17*s), Math.round(16*s), Math.round(5*s), Math.round(16*s), [240,240,240,255], 0.7);
// Right bar:  x=26,y=10,w=5,h=22 → opacity 1.0
fillRect(Math.round(26*s), Math.round(10*s), Math.round(5*s), Math.round(22*s), [240,240,240,255], 1.0);

// Small dot above right bar: cx=28.5,cy=8,r=2 → opacity 0.5
const cx = Math.round(28.5*s), cy = Math.round(8*s), dr = Math.round(2*s);
for (let y = cy - dr; y <= cy + dr; y++) {
  for (let x = cx - dr; x <= cx + dr; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx*dx + dy*dy <= dr*dr) fillRect(x, y, 1, 1, [240,240,240,255], 0.5);
  }
}

/* ── PNG encode ── */
// IHDR
const IHDR = chunk("IHDR", [
  ...u32(W), ...u32(H),
  8,    // bit depth
  6,    // colour type: RGBA
  0, 0, 0 // compression, filter, interlace
]);

// Raw scanlines (filter byte 0 = None per row)
const scanlines = new Uint8Array(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  scanlines[y * (1 + W * 4)] = 0; // filter None
  for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 4;
    const dst = y * (1 + W * 4) + 1 + x * 4;
    scanlines[dst]   = pixels[src];
    scanlines[dst+1] = pixels[src+1];
    scanlines[dst+2] = pixels[src+2];
    scanlines[dst+3] = pixels[src+3];
  }
}

// Compress scanlines → IDAT via zlib deflate (synchronous via Buffer)
import { deflateSync } from "zlib";
const compressed = deflateSync(scanlines);
const IDAT = chunk("IDAT", [...compressed]);
const IEND = chunk("IEND", []);

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  ...IHDR, ...IDAT, ...IEND
]);

import { writeFileSync } from "fs";
writeFileSync(resolve(root, "icon.png"), Buffer.from(png));
console.log("icon.png written (" + png.length + " bytes)");
