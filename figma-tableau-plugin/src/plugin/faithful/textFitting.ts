// ---------------------------------------------------------------------------
// textFitting.ts — Tableau text-size estimation and font scaling.
// ---------------------------------------------------------------------------

import type { FaithfulZone } from "../../shared/types";

// Per-character advance widths for Segoe UI (the font every export maps to),
// in EM units (fraction of the point size), measured with GDI
// (TextRenderer.MeasureText, NoPadding, 40-char runs) — chars 32..126.
// prettier-ignore
export const SEGOE_EMS = [
  0.292,0.299,0.412,0.607,0.554,0.839,0.415,0.247,0.314,0.314,0.434,0.704,0.232,0.419,0.232,0.404,
  0.554,0.554,0.554,0.554,0.554,0.554,0.554,0.554,0.554,0.554,0.232,0.232,0.704,0.704,0.704,0.464,
  0.974,0.659,0.592,0.607,0.719,0.524,0.502,0.704,0.727,0.284,0.337,0.599,0.487,0.914,0.764,0.772,
  0.577,0.772,0.614,0.547,0.561,0.704,0.637,0.952,0.607,0.569,0.584,0.314,0.397,0.314,0.704,0.434,
  0.284,0.524,0.607,0.479,0.607,0.539,0.329,0.607,0.584,0.254,0.254,0.517,0.254,0.877,0.584,0.607,
  0.607,0.607,0.367,0.442,0.352,0.584,0.494,0.742,0.479,0.502,0.472,0.314,0.254,0.314,0.704,
];
export const PX_PER_PT = 4 / 3; // 96 dpi
export const TABLEAU_TEXT_SCALE = 1.5;
export const LINE_BOX = 1.85;

/** Width (px) one line of text occupies at its DESIGN size. */
export function estLineWidthPx(text: string, pt: number, bold?: boolean): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    em += c >= 32 && c <= 126 ? SEGOE_EMS[c - 32] : 1.0;
  }
  return em * pt * PX_PER_PT * (bold ? 1.08 : 1) + 8;
}

/** A text zone's one-line width need, honoring per-run sizes/weights. */
export function zoneNeedW(z: FaithfulZone): number {
  if (z.runs && z.runs.length > 1) {
    let w = 0;
    for (const r of z.runs) w += estLineWidthPx(r.text, r.fontSize ?? z.fontSize ?? 14, r.bold) - 8;
    return w + 8;
  }
  return estLineWidthPx(z.text || "", z.fontSize ?? 14, z.bold);
}

/** Scale a text zone's font (and each styled run) by `ratio`. */
export function scaleZoneFont(z: FaithfulZone, ratio: number): void {
  const base = z.fontSize ?? 14;
  z.fontSize = Math.max(6, base * ratio);
  if (z.runs) for (const r of z.runs) r.fontSize = Math.max(6, (r.fontSize ?? base) * ratio);
}

/**
 * Fit every text zone so it renders COMPLETELY in Tableau, for ANY design.
 * Ground rules learned from the user's real exports:
 *   1. Tableau draws text wider than the design (see TABLEAU_TEXT_SCALE) and
 *      does NOT soft-wrap a text zone — an overflowing line is "…"-truncated.
 *   2. A floating text zone may sit fully INSIDE another zone (a card) or fully
 *      outside one, but a PARTIAL overlap breaks rendering (only the overhang
 *      draws — "Con..", invisible "$1.24M"). So a zone must never be grown past
 *      its enclosing card, or into a neighbor it didn't already touch.
 * Strategy per text zone: grow the box (toward its alignment) up to the space
 * its container and neighbors allow; if the text still can't fit on one line,
 * SHRINK ITS FONT to the available width — a slightly smaller complete label
 * beats a truncated one. Multi-line stacks (`#L` ids from one Figma node) are
 * re-fit as one block so the lines stay adjacent.
 */
export function fitFaithfulText(zones: FaithfulZone[], frameW: number, frameH: number): void {
  type Box = { x: number; y: number; w: number; h: number };
  const solids = zones.filter((z) => z.kind !== "text");
  const contains = (r: Box, t: Box, tol = 2) =>
    r.x <= t.x + tol && r.y <= t.y + tol && r.x + r.w >= t.x + t.w - tol && r.y + r.h >= t.y + t.h - tol;
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const vBand = (a: Box, b: Box) => a.y < b.y + b.h && b.y < a.y + a.h;
  const hBand = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w;

  const boundsFor = (orig: Box): Box => {
    let best: Box = { x: 2, y: 2, w: frameW - 4, h: frameH - 4 };
    let bestArea = Infinity;
    for (const s of solids) {
      if (s.w * s.h < bestArea && contains(s, orig)) {
        best = { x: s.x + 3, y: s.y + 1, w: s.w - 6, h: s.h - 2 };
        bestArea = s.w * s.h;
      }
    }
    return best;
  };

  const fitZoneWidth = (z: FaithfulZone, orig: Box, b: Box, needW: number, exclude: Set<FaithfulZone>): number => {
    if (z.w >= needW) return z.w;
    let nx = z.x;
    if (z.align === 1) nx = z.x - (needW - z.w) / 2;
    else if (z.align === 2) nx = z.x - (needW - z.w);
    let nRight = nx + needW;
    if (nRight > b.x + b.w) nRight = b.x + b.w;
    if (nx < b.x) nx = b.x;
    const band = { x: nx, y: z.y, w: nRight - nx, h: z.h };
    for (const s of zones) {
      if (exclude.has(s) || contains(s, orig) || overlaps(s, orig) || !vBand(band, s)) continue;
      if (s.x >= orig.x + orig.w) nRight = Math.min(nRight, s.x - 2);
      else if (s.x + s.w <= orig.x) nx = Math.max(nx, s.x + s.w + 2);
    }
    const avail = Math.max(10, nRight - nx);
    z.x = nx;
    z.w = Math.min(needW, avail);
    return avail;
  };

  const vWindowFor = (xr: Box, orig: Box, b: Box, exclude: Set<FaithfulZone>): { top: number; bottom: number } => {
    let top = b.y;
    let bottom = b.y + b.h;
    for (const s of zones) {
      if (exclude.has(s) || contains(s, orig) || overlaps(s, orig) || !hBand(xr, s)) continue;
      if (s.y >= orig.y + orig.h) bottom = Math.min(bottom, s.y - 2);
      else if (s.y + s.h <= orig.y) top = Math.max(top, s.y + s.h + 2);
    }
    if (bottom < top + 8) bottom = top + 8;
    return { top, bottom };
  };

  const placeV = (z: Box, orig: Box, needH: number, win: { top: number; bottom: number }): void => {
    const h = Math.min(needH, win.bottom - win.top);
    let y = orig.y + orig.h / 2 - h / 2;
    if (y < win.top) y = win.top;
    if (y + h > win.bottom) y = win.bottom - h;
    z.y = y;
    z.h = h;
  };

  const groups = new Map<string, FaithfulZone[]>();
  const singles: FaithfulZone[] = [];
  for (const z of zones) {
    if (z.kind !== "text") continue;
    const m = /^(.*)#L\d+$/.exec(z.id);
    if (m) {
      const g = groups.get(m[1]);
      if (g) g.push(z);
      else groups.set(m[1], [z]);
    } else singles.push(z);
  }

  for (const z of singles) {
    const orig: Box = { x: z.x, y: z.y, w: z.w, h: z.h };
    const excl = new Set([z]);
    const b = boundsFor(orig);
    const needW = zoneNeedW(z);
    const avail = fitZoneWidth(z, orig, b, needW, excl);
    if (avail < needW - 1) {
      scaleZoneFont(z, Math.max(0.45, avail / needW));
    }
    const needH = Math.max(orig.h, Math.ceil((z.fontSize ?? 14) * LINE_BOX));
    placeV(z, orig, needH, vWindowFor({ x: z.x, y: z.y, w: z.w, h: z.h }, orig, b, excl));
  }

  for (const g of groups.values()) {
    const union: Box = {
      x: Math.min(...g.map((z) => z.x)),
      y: Math.min(...g.map((z) => z.y)),
      w: Math.max(...g.map((z) => z.x + z.w)) - Math.min(...g.map((z) => z.x)),
      h: Math.max(...g.map((z) => z.y + z.h)) - Math.min(...g.map((z) => z.y)),
    };
    const excl = new Set(g);
    const b = boundsFor(union);
    let shrink = 1;
    for (const z of g) {
      const orig: Box = { x: z.x, y: z.y, w: z.w, h: z.h };
      const needW = zoneNeedW(z);
      const avail = fitZoneWidth(z, orig, b, needW, excl);
      if (avail < needW - 1) shrink = Math.min(shrink, Math.max(0.45, avail / needW));
    }
    if (shrink < 1) for (const z of g) scaleZoneFont(z, shrink);
    const sizes = g.map((z) => z.fontSize ?? 14);
    const sumSize = sizes.reduce((a, s) => a + s, 0) || 1;
    const needBlockH = Math.max(union.h, Math.ceil(sumSize * LINE_BOX));
    const fitted: Box = {
      x: Math.min(...g.map((z) => z.x)),
      y: union.y,
      w: Math.max(...g.map((z) => z.x + z.w)) - Math.min(...g.map((z) => z.x)),
      h: union.h,
    };
    const block: Box = { ...fitted };
    placeV(block, union, needBlockH, vWindowFor(fitted, union, b, excl));
    let yCursor = block.y;
    for (let i = 0; i < g.length; i++) {
      const lineH = block.h * (sizes[i] / sumSize);
      g[i].y = yCursor;
      g[i].h = lineH;
      yCursor += lineH;
    }
  }

  for (const z of zones) {
    if (z.kind !== "text") continue;
    const base = z.fontSize ?? 14;
    if (z.runs) {
      for (const r of z.runs)
        r.fontSize = Math.max(6, Math.round(((r.fontSize ?? base) / TABLEAU_TEXT_SCALE) * 2) / 2);
    }
    z.fontSize = Math.max(6, Math.round((base / TABLEAU_TEXT_SCALE) * 2) / 2);
  }

  for (const z of zones) {
    if (z.kind !== "text") continue;
    z.x = Math.max(0, Math.round(z.x));
    z.y = Math.max(0, Math.round(z.y));
    z.w = Math.max(1, Math.round(z.w));
    z.h = Math.max(1, Math.round(z.h));
    if (z.fontSize != null) z.fontSize = Math.round(z.fontSize * 2) / 2;
  }
}
