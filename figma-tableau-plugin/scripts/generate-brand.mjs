/**
 * Renders the two Figma Community listing assets from their sources:
 *
 *   icon.svg          →  icon.png   128 × 128, transparent corners
 *   scripts/cover.html →  cover.png 1920 × 960 (the listing thumbnail)
 *
 * Chromium does the drawing, so the cover gets real DM Serif Display /
 * Inter text and properly anti-aliased corners — the hand-rolled PNG
 * encoder this replaced could do neither.
 *
 *   npm run brand          (needs `npx playwright install chromium` once)
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// Prefer the Chrome already on the machine so a fresh clone doesn't have
// to pull down Playwright's own ~150 MB build; fall back to that build
// (npx playwright install chromium) when no system Chrome is present.
const browser = await chromium
  .launch({ channel: "chrome" })
  .catch(() => chromium.launch());

/* ── cover.png — 1920 × 960 ───────────────────────────────────────── */
const cover = await browser.newPage({ viewport: { width: 1920, height: 960 } });
await cover.goto(pathToFileURL(resolve(here, "cover.html")).href, { waitUntil: "networkidle" });
// Google Fonts arrive after first paint; without this the serif line
// screenshots as the Georgia fallback.
await cover.evaluate(() => document.fonts.ready);
await cover.waitForTimeout(250);
await cover.screenshot({ path: resolve(root, "cover.png") });
console.log("cover.png  1920×960");

/* ── icon.png — 128 × 128, corners left transparent ───────────────── */
const icon = await browser.newPage({ viewport: { width: 128, height: 128 } });
// Inlined rather than navigated to: an .svg document has no <head>, so
// there is nowhere to hang the "no margin, no background" style.
await icon.setContent(
  "<style>html,body{margin:0;background:transparent}svg{display:block}</style>" +
    readFileSync(resolve(root, "icon.svg"), "utf8"),
);
await icon.screenshot({ path: resolve(root, "icon.png"), omitBackground: true });
console.log("icon.png   128×128");

await browser.close();
