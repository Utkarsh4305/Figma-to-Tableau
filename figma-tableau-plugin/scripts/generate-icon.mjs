/**
 * Generates icon.png — the 128×128 plugin launch icon: a teal-gradient rounded
 * square with three ascending white "dashboard" bars and a mint accent node,
 * matching icon.svg and the website favicon/logo. Uses only Node built-ins;
 * no npm dependencies required.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";
import { deflateSync } from "zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const W = 128, H = 128;

/* ── PNG chunk helpers ── */
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
  const typeBytes = [...type].map((c) => c.charCodeAt(0));
  const payload = [...typeBytes, ...data];
  return [...u32(data.length), ...typeBytes, ...data, ...u32(crc32(payload))];
}

/* ── canvas ── */
const pixels = new Uint8Array(W * H * 4); // RGBA
const R = 32; // corner radius at 128px (16 in the 64 viewBox)

function inRoundedRect(x, y, rx, ry, rw, rh, r) {
  const dx = Math.max(rx - x, 0, x - (rx + rw - 1));
  const dy = Math.max(ry - y, 0, y - (ry + rh - 1));
  return dx * dx + dy * dy <= r * r;
}
function setPixel(x, y, rgba) {
  const i = (y * W + x) * 4;
  pixels[i] = rgba[0]; pixels[i + 1] = rgba[1]; pixels[i + 2] = rgba[2]; pixels[i + 3] = rgba[3];
}
/** Composite `color` at opacity `op` over the existing (opaque) badge pixel. */
function blend(x, y, color, op) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  if (pixels[i + 3] === 0) return; // outside the badge — leave transparent
  pixels[i] = Math.round(pixels[i] * (1 - op) + color[0] * op);
  pixels[i + 1] = Math.round(pixels[i + 1] * (1 - op) + color[1] * op);
  pixels[i + 2] = Math.round(pixels[i + 2] * (1 - op) + color[2] * op);
  pixels[i + 3] = 255;
}
function fillRoundRect(x0, y0, w, h, color, op, r) {
  for (let y = Math.floor(y0); y < y0 + h; y++)
    for (let x = Math.floor(x0); x < x0 + w; x++)
      if (inRoundedRect(x, y, x0, y0, w, h, r)) blend(x, y, color, op);
}
function fillCircle(cx, cy, r, color, op) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) blend(x, y, color, op);
    }
}

/* ── draw: diagonal teal gradient badge ── */
const C0 = [13, 148, 136];  // #0d9488 top-left
const C1 = [0, 217, 160];   // #00d9a0 bottom-right
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (inRoundedRect(x, y, 0, 0, W, H, R)) {
      const t = (x + y) / (W + H - 2);
      setPixel(x, y, [lerp(C0[0], C1[0], t), lerp(C0[1], C1[1], t), lerp(C0[2], C1[2], t), 255]);
    } else {
      setPixel(x, y, [0, 0, 0, 0]);
    }
  }
}

/* ── ascending bars + accent node (64-viewBox coords × 2) ── */
const WHITE = [255, 255, 255];
const rad = 5.2; // 2.6 × 2
fillRoundRect(35, 64, 15, 30, WHITE, 0.55, rad); // short
fillRoundRect(56.5, 50, 15, 44, WHITE, 0.78, rad); // mid
fillRoundRect(78, 36, 15, 58, WHITE, 1, rad); // tall
fillCircle(85.5, 25, 6.8, [198, 255, 240], 1); // #c6fff0 node

/* ── PNG encode ── */
const IHDR = chunk("IHDR", [...u32(W), ...u32(H), 8, 6, 0, 0, 0]);
const scanlines = new Uint8Array(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  scanlines[y * (1 + W * 4)] = 0; // filter: None
  for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 4;
    const dst = y * (1 + W * 4) + 1 + x * 4;
    scanlines[dst] = pixels[src]; scanlines[dst + 1] = pixels[src + 1];
    scanlines[dst + 2] = pixels[src + 2]; scanlines[dst + 3] = pixels[src + 3];
  }
}
const IDAT = chunk("IDAT", [...deflateSync(scanlines)]);
const IEND = chunk("IEND", []);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...IHDR, ...IDAT, ...IEND]);
writeFileSync(resolve(root, "icon.png"), Buffer.from(png));
console.log("icon.png written (" + png.length + " bytes)");
