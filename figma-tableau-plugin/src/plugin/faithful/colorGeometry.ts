// ---------------------------------------------------------------------------
// colorGeometry.ts — color helpers, paint queries, geometry utilities.
// ---------------------------------------------------------------------------

import type { Rect } from "../../shared/types";

// Figma font sizes are PIXELS; Tableau `fontsize` is POINTS. Without this 96->72
// dpi conversion every font comes out ~1.33x too big (titles clip / text
// overlaps). 0.75 = 72/96. Matches the LaDataViz reference's font sizes.
export const PT_PER_PX = 0.75;

export const hh = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");

/** 6-digit #RRGGBB (font colors — the reference uses 6-digit for runs). */
export function toHex(c: { r: number; g: number; b: number }): string {
  return `#${hh(c.r)}${hh(c.g)}${hh(c.b)}`.toUpperCase();
}

/**
 * 8-digit #RRGGBBAA (zone background fills). Tableau 2026.2 accepts the alpha
 * byte (the LaDataViz reference uses it for all 162 fills) — CRITICAL because a
 * low-opacity black (e.g. a progress-bar track) must stay faint, not collapse to
 * a solid black bar when we drop the alpha.
 */
export function toHex8(c: { r: number; g: number; b: number }, alpha: number): string {
  return `#${hh(c.r)}${hh(c.g)}${hh(c.b)}${hh(alpha)}`.toUpperCase();
}

/**
 * The representative background fill of a node as an 8-digit color + effective
 * alpha. Handles SOLID and GRADIENT_* paints (a gradient is approximated by its
 * highest-alpha stop) so gradient cards/bars render in their real color family
 * instead of being skipped (which left the dark layer underneath showing).
 */
export function fillOf(node: SceneNode): { hex: string; a: number } | undefined {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return undefined;
  const p = fills.find(
    (f) => f.visible !== false && (f.type === "SOLID" || f.type.indexOf("GRADIENT") === 0)
  );
  if (!p) return undefined;
  const op = p.opacity ?? 1;
  if (p.type === "SOLID") {
    const a = op;
    return { hex: toHex8((p as SolidPaint).color, a), a };
  }
  const stops = (p as GradientPaint).gradientStops || [];
  if (!stops.length) return undefined;
  let best = stops[Math.floor(stops.length / 2)];
  for (const s of stops) if ((s.color.a ?? 1) > (best.color.a ?? 1)) best = s;
  const a = op * (best.color.a ?? 1);
  return { hex: toHex8(best.color, a), a };
}

/** First visible solid fill as a 6-digit hex (font colors). */
export function solidHex(node: SceneNode): string | undefined {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return undefined;
  const s = fills.find((f) => f.type === "SOLID" && f.visible !== false) as SolidPaint | undefined;
  return s ? toHex(s.color) : undefined;
}

export function firstSolidStroke(node: SceneNode): { hex: string; w: number } | undefined {
  const strokes = (node as GeometryMixin).strokes;
  if (!strokes || !Array.isArray(strokes)) return undefined;
  const s = strokes.find((x) => x.type === "SOLID" && x.visible !== false) as SolidPaint | undefined;
  if (!s) return undefined;
  const w = (node as GeometryMixin).strokeWeight;
  return { hex: toHex(s.color), w: typeof w === "number" ? w : 1 };
}

export function hasImageFill(node: SceneNode): boolean {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return false;
  return fills.some((f) => f.type === "IMAGE" && f.visible !== false);
}

// Vector-ish nodes we rasterize to a bitmap (Tableau can't draw the paths).
export const VECTORISH = ["VECTOR", "LINE", "STAR", "POLYGON", "ELLIPSE", "BOOLEAN_OPERATION"];
export const FILLABLE = ["RECTANGLE", "FRAME", "COMPONENT", "INSTANCE"];

export function rectOf(node: SceneNode, origin: { x: number; y: number }): Rect {
  const bb = (node as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox;
  const rot = (node as SceneNode & { rotation?: number }).rotation;
  if (bb && typeof rot === "number" && Math.abs(rot) > 1 && node.width > 0 && node.height > 0) {
    const cx = bb.x + (bb.w ?? node.width) / 2;
    const cy = bb.y + (bb.h ?? node.height) / 2;
    return { x: cx - node.width / 2 - origin.x, y: cy - node.height / 2 - origin.y, w: node.width, h: node.height };
  }
  if (bb) return { x: bb.x - origin.x, y: bb.y - origin.y, w: bb.w ?? node.width, h: bb.h ?? node.height };
  return { x: node.x - origin.x, y: node.y - origin.y, w: node.width, h: node.height };
}

export const MAX_ZONES = 1500;

export function isBoldStyle(style: string | undefined): boolean {
  return /\bbold\b|black|heavy|extrabold/i.test(style || "");
}
