// ---------------------------------------------------------------------------
// faithful.ts — runs INSIDE the Figma sandbox. A FAITHFUL transpiler: instead
// of classifying charts and binding them to sample data, it recreates the whole
// Figma frame as native Tableau dashboard zones (the LaDataViz approach):
//   - TEXT layers          -> text zones (real content, font, color)
//   - shapes / cards / bars -> colored `empty` zones (rect)
//   - icons / vectors / images -> bitmap zones (rasterized PNG)
// The output LOOKS like the design; it carries no live data.
// ---------------------------------------------------------------------------

import type { FaithfulModel, FaithfulTextRun, FaithfulZone, Rect } from "../shared/types";
import { matchLayerPrefix } from "../shared/constants";

// Map a "[type]" tag (from a "SHEET/Name[type]" layer name, the LaDataViz
// convention) to a Tableau mark class. Default Bar. Mirrors Template.twbx,
// where "[bar-hor]" -> Bar and "[area]" -> Area worksheets were generated.
function markFromTag(tag: string | undefined): string {
  switch ((tag || "").toLowerCase()) {
    case "line":
    case "trend":
      return "Line";
    case "area":
      return "Area";
    case "pie":
    case "donut":
    case "doughnut":
      return "Pie";
    case "scatter":
    case "bubble":
    case "circle":
      return "Circle";
    default:
      // bar / bar-hor / bar-vert / column / table / anything else -> Bar
      return "Bar";
  }
}

/**
 * Strip trailing LaDataViz-style ":option" suffixes off a layer name and report
 * which were present. e.g. "Trend[line]:showTitle:filter" -> name "Trend[line]"
 * with { showTitle, action:'filter' }. Only the confirmed-safe options are
 * recognised; an unknown ":foo" is left attached so it can't silently vanish.
 */
function parseLayerOptions(clean: string): {
  name: string;
  showTitle: boolean;
  action?: "filter" | "highlight";
} {
  let showTitle = false;
  let action: "filter" | "highlight" | undefined;
  let name = clean;
  const known = /:(showtitle|filter|highlight)\b/i;
  // Peel known suffixes off the end, one at a time (order-independent).
  let m: RegExpMatchArray | null;
  while ((m = name.match(new RegExp(known.source + "\\s*$", "i")))) {
    const opt = m[1].toLowerCase();
    if (opt === "showtitle") showTitle = true;
    else if (opt === "filter") action = "filter";
    else if (opt === "highlight") action = "highlight";
    name = name.slice(0, m.index).trim();
  }
  return { name: name || clean, showTitle, action };
}

/** Split a cleaned SHEET name ("Sheet 1[bar-hor]") into its name + mark class. */
function parseSheetTag(clean: string): { sheetName: string; chart: string } {
  const m = clean.match(/\[([^\]]*)\]/);
  const sheetName = clean.replace(/\[[^\]]*\]/g, "").trim() || clean || "Sheet";
  return { sheetName, chart: markFromTag(m ? m[1] : undefined) };
}

// Figma font sizes are PIXELS; Tableau `fontsize` is POINTS. Without this 96->72
// dpi conversion every font comes out ~1.33x too big (titles clip / text
// overlaps). 0.75 = 72/96. Matches the LaDataViz reference's font sizes.
const PT_PER_PX = 0.75;

const hh = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");

/** 6-digit #RRGGBB (font colors — the reference uses 6-digit for runs). */
function toHex(c: { r: number; g: number; b: number }): string {
  return `#${hh(c.r)}${hh(c.g)}${hh(c.b)}`.toUpperCase();
}

/**
 * 8-digit #RRGGBBAA (zone background fills). Tableau 2026.2 accepts the alpha
 * byte (the LaDataViz reference uses it for all 162 fills) — CRITICAL because a
 * low-opacity black (e.g. a progress-bar track) must stay faint, not collapse to
 * a solid black bar when we drop the alpha.
 */
function toHex8(c: { r: number; g: number; b: number }, alpha: number): string {
  return `#${hh(c.r)}${hh(c.g)}${hh(c.b)}${hh(alpha)}`.toUpperCase();
}

/**
 * The representative background fill of a node as an 8-digit color + effective
 * alpha. Handles SOLID and GRADIENT_* paints (a gradient is approximated by its
 * highest-alpha stop) so gradient cards/bars render in their real color family
 * instead of being skipped (which left the dark layer underneath showing).
 */
function fillOf(node: SceneNode): { hex: string; a: number } | undefined {
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
function solidHex(node: SceneNode): string | undefined {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return undefined;
  const s = fills.find((f) => f.type === "SOLID" && f.visible !== false) as SolidPaint | undefined;
  return s ? toHex(s.color) : undefined;
}

function firstSolidStroke(node: SceneNode): { hex: string; w: number } | undefined {
  const strokes = (node as GeometryMixin).strokes;
  if (!strokes || !Array.isArray(strokes)) return undefined;
  const s = strokes.find((x) => x.type === "SOLID" && x.visible !== false) as SolidPaint | undefined;
  if (!s) return undefined;
  const w = (node as GeometryMixin).strokeWeight;
  return { hex: toHex(s.color), w: typeof w === "number" ? w : 1 };
}

function hasImageFill(node: SceneNode): boolean {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return false;
  return fills.some((f) => f.type === "IMAGE" && f.visible !== false);
}

// Vector-ish nodes we rasterize to a bitmap (Tableau can't draw the paths).
const VECTORISH = ["VECTOR", "LINE", "STAR", "POLYGON", "ELLIPSE", "BOOLEAN_OPERATION"];
const FILLABLE = ["RECTANGLE", "FRAME", "COMPONENT", "INSTANCE"];

function rectOf(node: SceneNode, origin: { x: number; y: number }): Rect {
  const bb = (node as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox;
  const rot = (node as SceneNode & { rotation?: number }).rotation;
  // Rotated node: its absoluteBoundingBox is the AABB of the rotated shape, so a
  // thin bar rotated 90deg comes out tall+thin (a vertical sliver) — e.g. the
  // Tasks-panel progress bars collapsed into one blue line. Tableau zones can't
  // rotate, so render the node's UNROTATED size centered in that AABB; a
  // 90deg-rotated bar then lays back down as the horizontal bar it's meant to be.
  if (bb && typeof rot === "number" && Math.abs(rot) > 1 && node.width > 0 && node.height > 0) {
    const cx = bb.x + (bb.w ?? node.width) / 2;
    const cy = bb.y + (bb.h ?? node.height) / 2;
    return { x: cx - node.width / 2 - origin.x, y: cy - node.height / 2 - origin.y, w: node.width, h: node.height };
  }
  if (bb) return { x: bb.x - origin.x, y: bb.y - origin.y, w: bb.w ?? node.width, h: bb.h ?? node.height };
  return { x: node.x - origin.x, y: node.y - origin.y, w: node.width, h: node.height };
}

const MAX_ZONES = 1500;

function isBoldStyle(style: string | undefined): boolean {
  // Only true heavy weights (>=700) are bold. Medium/SemiBold render at normal
  // weight in the LaDataViz reference; treating them as bold widens the text and
  // makes Tableau truncate it ("67/85" -> "6.."). `\bbold\b` matches "Bold" but
  // not the "Bold" inside "SemiBold" (no word boundary there).
  return /\bbold\b|black|heavy|extrabold/i.test(style || "");
}

/**
 * Split a text layer into styled runs (size / font / color spans). A KPI card
 * is frequently ONE text node mixing an 11pt label with a 20pt value; flattening
 * that to a single fallback size makes the big number render tiny. Reading the
 * per-character styles preserves each run's real size — exactly how the
 * LaDataViz reference emits separate sized <run>s.
 */
function styledRuns(tn: TextNode): FaithfulTextRun[] | undefined {
  const getSeg = (tn as unknown as {
    getStyledTextSegments?: (fields: string[]) => Array<{
      characters: string;
      fontSize: number;
      fontName: FontName | symbol;
      fills: readonly Paint[] | symbol;
    }>;
  }).getStyledTextSegments;
  if (typeof getSeg !== "function") return undefined;
  let segs: ReturnType<NonNullable<typeof getSeg>>;
  try {
    segs = getSeg.call(tn, ["fontSize", "fontName", "fills"]);
  } catch {
    return undefined;
  }
  if (!segs || segs.length <= 1) return undefined; // single style -> flat path
  const runs: FaithfulTextRun[] = [];
  for (const s of segs) {
    if (!s.characters) continue;
    const fam = s.fontName !== figma.mixed ? (s.fontName as FontName).family : undefined;
    const style = s.fontName !== figma.mixed ? (s.fontName as FontName).style : "";
    let color: string | undefined;
    if (Array.isArray(s.fills)) {
      const solid = s.fills.find((f) => f.type === "SOLID" && f.visible !== false) as
        | SolidPaint
        | undefined;
      if (solid) color = toHex(solid.color);
    }
    runs.push({
      text: s.characters,
      fontSize: typeof s.fontSize === "number" ? s.fontSize * PT_PER_PX : undefined,
      fontFamily: fam,
      fontColor: color,
      bold: isBoldStyle(style),
    });
  }
  return runs.length > 1 ? runs : undefined;
}

function alignOf(node: TextNode): number {
  switch (node.textAlignHorizontal) {
    case "CENTER":
      return 1;
    case "RIGHT":
      return 2;
    default:
      return 0;
  }
}

/**
 * Walk every visible node back-to-front (parent emitted before its children, so
 * children draw on top — matching Figma z-order). Pushes a FaithfulZone for any
 * node that has its own visual (text / fill / image / vector).
 */
function walk(node: SceneNode, origin: { x: number; y: number }, zones: FaithfulZone[]): void {
  if (zones.length >= MAX_ZONES) return;
  if (node.visible === false) return;
  const opacity = (node as SceneNode & { opacity?: number }).opacity;
  if (typeof opacity === "number" && opacity < 0.02) return;

  const rect = rectOf(node, origin);
  // Skip nodes with no resolvable geometry (would emit a "NaN" attr otherwise).
  if (![rect.x, rect.y, rect.w, rect.h].every((n) => Number.isFinite(n))) return;
  if (rect.w <= 0 || rect.h <= 0) return;
  const t = node.type;

  // SHEET/-tagged layer -> a REAL Tableau worksheet (bound to sample data) sits
  // here instead of the static design. Emit one sheet zone and DON'T recurse:
  // the worksheet replaces whatever the designer drew inside the frame. This is
  // exactly how LaDataViz produced the live charts in Template.twbx.
  const pfx = matchLayerPrefix(node.name || "");
  if (pfx && pfx.role === "worksheet") {
    const opts = parseLayerOptions(pfx.clean);
    const { sheetName, chart } = parseSheetTag(opts.name);
    zones.push({
      id: node.id,
      name: node.name || sheetName,
      kind: "sheet",
      ...rect,
      sheetName,
      chart,
      showTitle: opts.showTitle || undefined,
      actionKind: opts.action,
    });
    return;
  }
  // FILTER/Field -> a real Tableau quick-filter card on that dimension (the
  // LaDataViz convention). Confirmed schema (type-v2='filter' in DM_Dashboards).
  // We don't recurse: the card replaces whatever placeholder the designer drew.
  if (pfx && pfx.role === "filter") {
    zones.push({
      id: node.id,
      name: node.name || "Filter",
      kind: "filter",
      ...rect,
      filterField: parseLayerOptions(pfx.clean).name || pfx.clean,
    });
    return;
  }
  // URL/<page> -> a real Tableau web page object (type-v2='web'). Confirmed
  // schema (see "Using Web Page Object in Tableau.twb"). The text after URL/ is
  // the page address; bare hosts get an https:// scheme. We don't recurse.
  if (pfx && pfx.role === "web") {
    const raw = pfx.clean.trim();
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    zones.push({ id: node.id, name: node.name || "Web", kind: "web", ...rect, url });
    return;
  }

  if (t === "TEXT") {
    const tn = node as TextNode;
    const chars = typeof tn.characters === "string" ? tn.characters : "";
    if (chars.trim()) {
      const fam = tn.fontName !== figma.mixed ? (tn.fontName as FontName).family : undefined;
      const style = tn.fontName !== figma.mixed ? (tn.fontName as FontName).style : "";
      const runs = styledRuns(tn); // run sizes already px->pt converted
      // Flat fallback in POINTS (used for single-style text and by consumers that
      // ignore `runs`). With mixed styles, fall back to the run covering the most
      // characters instead of a hardcoded 14.
      let flatPt = tn.fontSize !== figma.mixed ? (tn.fontSize as number) * PT_PER_PX : undefined;
      if (flatPt == null && runs) {
        flatPt = runs.reduce((a, b) => (b.text.length > a.text.length ? b : a)).fontSize;
      }
      const sizePt = flatPt ?? 14;
      // Grow a too-short Figma text box so Tableau doesn't clip glyph tops (a
      // big title in an auto-height layer can have a bbox shorter than its line
      // box). Only ever grows, never shrinks; ~1.7px per point per line.
      const lines = Math.max(1, chars.replace(/\n+$/, "").split("\n").length);
      const maxPt = Math.max(sizePt, ...(runs ? runs.map((r) => r.fontSize ?? 0) : [0]));
      const needH = Math.ceil(maxPt * 1.5 * lines);
      if (rect.h < needH) {
        // Grow CENTERED on the original text box so the extra height doesn't all
        // push downward into the element below (a big title would otherwise
        // overlap the subtitle beneath it).
        rect.y = Math.max(0, rect.y - (needH - rect.h) / 2);
        rect.h = needH;
      }
      // Width safety: the emitted font is mapped to Segoe UI (see safeFont in the
      // generator), whose average glyph advance is ~0.6× the point size — close
      // to the design fonts (Inter/Roboto) the Figma box was sized for, so the
      // text should already FIT its box. Only nudge the width up when the box is
      // genuinely too small for that real Segoe UI width (a modest, only-grows
      // cushion), so text no longer OVERFLOWS past its container. The old 1.15×
      // factor assumed a much wider substituted fallback and over-grew massively.
      // Short strings only (≤20 visible chars); long text keeps its Figma bbox.
      const longestLine = chars.split("\n").reduce((a, b) => (b.length > a.length ? b : a), "");
      if (longestLine.replace(/\s/g, "").length <= 20) {
        const estW = Math.ceil(longestLine.length * maxPt * 0.62 + maxPt * 0.3);
        if (rect.w < estW) rect.w = estW;
      }
      zones.push({
        id: node.id,
        name: node.name || "Text",
        kind: "text",
        ...rect,
        text: chars,
        fontSize: sizePt,
        fontFamily: fam,
        fontColor: solidHex(node) || "#101828",
        bold: isBoldStyle(style),
        align: alignOf(tn),
        runs,
      });
    }
    return; // text has no children we care about
  }

  // Opaque visuals we rasterize (icons, logos, photos, line/curve charts).
  if (hasImageFill(node) || VECTORISH.indexOf(t) !== -1) {
    zones.push({ id: node.id, name: node.name || "Image", kind: "image", ...rect });
    return; // treat as a single bitmap; don't descend into path internals
  }

  // A shape/card/bar with a fill becomes a colored `empty` zone. The 8-digit
  // fill preserves alpha so a low-opacity layer stays faint instead of rendering
  // as a solid (this is what turned the progress-bar track into a black bar).
  const fill = fillOf(node);
  const stroke = firstSolidStroke(node);
  if ((fill && fill.a > 0.01) || stroke) {
    if (FILLABLE.indexOf(t) !== -1) {
      const cr = (node as SceneNode & { cornerRadius?: number | symbol }).cornerRadius;
      zones.push({
        id: node.id,
        name: node.name || "Rectangle",
        kind: "rect",
        ...rect,
        fill: fill && fill.a > 0.01 ? fill.hex : undefined,
        cornerRadius: typeof cr === "number" ? cr : undefined,
        strokeColor: stroke?.hex,
        strokeWidth: stroke?.w,
      });
    }
  }

  // Recurse so inner text / bars / icons are captured and drawn on top.
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) walk(c as SceneNode, origin, zones);
  }
}

function isFrameLike(n: BaseNode): boolean {
  return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "COMPONENT_SET" || n.type === "INSTANCE";
}

function findFrame(): SceneNode | undefined {
  const sel = figma.currentPage.selection[0];
  if (sel) {
    if (isFrameLike(sel)) return sel;
    let p: BaseNode | null = sel.parent;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      if (isFrameLike(p)) return p as SceneNode;
      p = p.parent;
    }
    if ("children" in sel) return sel;
  }
  return figma.currentPage.children.find((n) => n.type === "FRAME" || n.type === "COMPONENT") as
    | SceneNode
    | undefined;
}

export function parseFaithful(): FaithfulModel {
  const frame = findFrame();
  if (!frame) throw new Error("Select a frame (or have at least one frame on the page) to convert.");
  const bb =
    (frame as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox ?? {
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
    };
  const origin = { x: bb.x, y: bb.y };
  const zones: FaithfulZone[] = [];

  // The frame's own background first (so it sits behind everything).
  const bg = fillOf(frame);
  if (bg && bg.a > 0.01) {
    zones.push({ id: frame.id + ":bg", name: frame.name || "Background", kind: "rect", x: 0, y: 0, w: bb.w, h: bb.h, fill: bg.hex });
  }
  if ("children" in frame) {
    for (const c of (frame as ChildrenMixin).children) walk(c as SceneNode, origin, zones);
  }

  return {
    id: frame.id,
    title: frame.name || "Dashboard",
    width: bb.w || frame.width,
    height: bb.h || frame.height,
    background: bg?.hex,
    zones,
  };
}

// --- image rasterization (sandbox) ------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

/** Rasterize every image-kind zone to a base64 PNG. Failures are skipped. */
export async function attachFaithfulImages(model: FaithfulModel): Promise<void> {
  for (const z of model.zones) {
    if (z.kind !== "image" || z.imagePng) continue;
    try {
      const node = (await figma.getNodeByIdAsync(z.id)) as SceneNode | null;
      const exporter = node as (SceneNode & { exportAsync?: (s: unknown) => Promise<Uint8Array> }) | null;
      if (exporter && typeof exporter.exportAsync === "function") {
        const bytes = await exporter.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
        z.imagePng = bytesToBase64(bytes);
      }
    } catch {
      /* leave imagePng undefined — that zone just won't render */
    }
  }
  // Drop image zones that couldn't be rasterized (no empty bitmaps).
  model.zones = model.zones.filter((z) => z.kind !== "image" || z.imagePng);
}
