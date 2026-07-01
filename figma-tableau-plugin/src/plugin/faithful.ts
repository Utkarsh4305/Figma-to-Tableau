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
    case "heatmap":
    case "square":
    case "map":
      return "Square";
    case "table":
    case "text":
    case "crosstab":
      return "Text";
    default:
      // bar / bar-hor / bar-vert / column / anything else -> Bar
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

/**
 * Split a cleaned BUTTON name into its caption and (optional) target dashboard.
 * Convention: "BUTTON/View Sales > Sales Dashboard" (or "->") → caption
 * "View Sales", target "Sales Dashboard". With no separator the whole remainder
 * is the caption and the target is left for seed.ts to infer.
 */
function parseButtonName(clean: string): { label: string; target?: string } {
  const m = clean.split(/\s*-?>\s*/);
  const label = (m[0] || clean).trim() || clean;
  const target = m.length > 1 ? m.slice(1).join(">").trim() : undefined;
  return { label, target: target || undefined };
}

/**
 * The design's own CHART color: the most vivid fill the designer drew INSIDE a
 * SHEET/ layer (the bars / line / slice), so a blue mock exports a blue chart
 * instead of LaDataViz's uniform gray. We scan descendants, skip the chart's own
 * card background (near-white / near-black / low-saturation grays) and pick the
 * highest-saturation solid/gradient fill that covers a meaningful area. Returns a
 * 6-digit hex, or undefined when nothing colorful enough is found (→ keep gray).
 */
function dominantChartColor(node: SceneNode): string | undefined {
  // saturation + value (HSV) of a 0..1 rgb triple.
  const sv = (c: { r: number; g: number; b: number }) => {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    return { s: max <= 0 ? 0 : (max - min) / max, v: max };
  };
  let best: { hex: string; score: number } | undefined;
  const consider = (paint: Paint | undefined, area: number) => {
    if (!paint || paint.visible === false) return;
    let col: { r: number; g: number; b: number } | undefined;
    let alpha = paint.opacity ?? 1;
    if (paint.type === "SOLID") col = (paint as SolidPaint).color;
    else if (paint.type.indexOf("GRADIENT") === 0) {
      const stops = (paint as GradientPaint).gradientStops || [];
      let pick = stops[0];
      for (const s of stops) if (sv(s.color).s > sv(pick?.color ?? { r: 0, g: 0, b: 0 }).s) pick = s;
      if (pick) {
        col = pick.color;
        alpha *= pick.color.a ?? 1;
      }
    }
    if (!col || alpha < 0.5) return;
    const { s, v } = sv(col);
    // skip card/background fills: greys (low saturation), near-white, near-black.
    if (s < 0.18 || v < 0.12 || (v > 0.95 && s < 0.12)) return;
    // prefer vivid AND larger fills (a big colored bar beats a tiny accent dot).
    const score = s * (0.6 + 0.4 * Math.min(1, area / 4000));
    if (!best || score > best.score) best = { hex: toHex(col), score };
  };
  const visit = (n: SceneNode, depth: number) => {
    if (depth > 6 || n.visible === false) return;
    const fills = (n as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      const w = (n as SceneNode & { width?: number }).width ?? 0;
      const h = (n as SceneNode & { height?: number }).height ?? 0;
      for (const f of fills) consider(f, w * h);
    }
    if ("children" in n) for (const c of (n as ChildrenMixin).children) visit(c as SceneNode, depth + 1);
  };
  if ("children" in node) for (const c of (node as ChildrenMixin).children) visit(c as SceneNode, 0);
  return best?.hex;
}

/**
 * The destination node id of a layer's Figma prototype interaction (its first
 * "Navigate to" reaction). Drives the Nav/ convention: instead of naming a target
 * in the layer name, the designer just wires a prototype connection in Figma and
 * we follow it. Reads both the modern `reactions[].actions[]` and the legacy
 * single `.action`; returns the first NODE-type action's destinationId.
 */
function navDestination(node: SceneNode): string | undefined {
  // Read this node's own reactions first.
  const reactions = (node as SceneNode & { reactions?: readonly unknown[] }).reactions;
  if (Array.isArray(reactions)) {
    for (const r of reactions as Array<{ action?: unknown; actions?: unknown[] }>) {
      const actions = Array.isArray(r.actions) ? r.actions : r.action ? [r.action] : [];
      for (const a of actions as Array<{ type?: string; destinationId?: string | null }>) {
        if (a && a.type === "NODE" && a.destinationId) return a.destinationId;
      }
    }
  }
  // The designer often wires the prototype link from an inner button/instance, not
  // the named Nav/ frame itself — so search descendants for the first navigation.
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) {
      const d = navDestination(c as SceneNode);
      if (d) return d;
    }
  }
  return undefined;
}

/** First TEXT descendant's text + color + point size (a button's caption). */
function firstTextStyle(node: SceneNode): { text?: string; color?: string; sizePt?: number } {
  let found: { text?: string; color?: string; sizePt?: number } | undefined;
  const visit = (n: SceneNode) => {
    if (found || n.visible === false) return;
    if (n.type === "TEXT") {
      const tn = n as TextNode;
      const size = tn.fontSize !== figma.mixed ? (tn.fontSize as number) * PT_PER_PX : undefined;
      const chars = typeof tn.characters === "string" ? tn.characters.trim() : "";
      found = { text: chars || undefined, color: solidHex(n), sizePt: size };
      return;
    }
    if ("children" in n) for (const c of (n as ChildrenMixin).children) visit(c as SceneNode);
  };
  if ("children" in node) for (const c of (node as ChildrenMixin).children) visit(c as SceneNode);
  return found || {};
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
  // Nav/Label -> a native Tableau navigation button whose TARGET comes from the
  // layer's Figma prototype interaction (its "Navigate to" reaction), resolved to
  // a worksheet or dashboard window by expandNavTargets + seed.ts. The caption is
  // the inner text (or the label after "Nav/"); colors/shape come from the layer.
  // Like BUTTON/ we don't recurse — the native button replaces the inner design.
  const navRe = /^\s*nav\s*\/\s*/i;
  if (navRe.test(node.name || "")) {
    const clean = (node.name || "").replace(navRe, "").trim();
    const { label } = parseButtonName(clean);
    const ts = firstTextStyle(node);
    const fill = fillOf(node);
    const cr = (node as SceneNode & { cornerRadius?: number | symbol }).cornerRadius;
    zones.push({
      id: node.id,
      name: node.name || "Nav",
      kind: "button",
      ...rect,
      label: ts.text || label,
      isNav: true,
      navTargetId: navDestination(node),
      fill: fill && fill.a > 0.01 ? fill.hex : undefined,
      fontColor: ts.color,
      fontSize: ts.sizePt,
      cornerRadius: typeof cr === "number" ? cr : undefined,
    });
    return;
  }

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
      markColor: dominantChartColor(node),
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
  // IMAGE/<label> -> a rasterised bitmap zone (type-v2='bitmap').
  // The IMAGE/ prefix forces image handling regardless of the node's fills,
  // so a solid-colour rect tagged IMAGE/ still becomes a bitmap (it gets
  // rasterised in attachFaithfulImages). We don't recurse.
  if (pfx && pfx.role === "image") {
    zones.push({ id: node.id, name: node.name || "Image", kind: "image", ...rect });
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
  // BUTTON/Label[ > Target] -> a native Tableau navigation button
  // (type-v2='dashboard-object' + <button action='tabdoc:goto-sheet'>). Confirmed
  // from LaDataViz's multi.twbx. We don't recurse: the native button replaces the
  // inner label/background the designer drew (like SHEET/ and FILTER/). The
  // caption/colors come from the layer name + the button's own fill + its label.
  if (pfx && pfx.role === "button") {
    const { label, target } = parseButtonName(pfx.clean);
    const ts = firstTextStyle(node);
    const fill = fillOf(node);
    const cr = (node as SceneNode & { cornerRadius?: number | symbol }).cornerRadius;
    zones.push({
      id: node.id,
      name: node.name || "Button",
      kind: "button",
      ...rect,
      // Caption = the text the designer actually drew inside the button (so it
      // matches Figma); fall back to the layer-name label if there's no inner
      // text. The TARGET still comes from the layer name's "> Target" part.
      label: ts.text || label,
      target,
      fill: fill && fill.a > 0.01 ? fill.hex : undefined,
      fontColor: ts.color,
      fontSize: ts.sizePt,
      cornerRadius: typeof cr === "number" ? cr : undefined,
    });
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

/** Faithfully transpile ONE frame into a FaithfulModel (one dashboard). */
function buildModelForFrame(frame: SceneNode): FaithfulModel {
  const bb =
    (frame as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox ?? {
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
    };
  const origin = { x: bb.x, y: bb.y };
  const zones: FaithfulZone[] = [];

  // A frame whose OWN name is SHEET/… is a single worksheet (not a dashboard of
  // its inner parts). This makes a Nav/ destination that points straight at a
  // SHEET/ frame become one Tableau worksheet we can navigate to. The whole frame
  // is the sheet zone (id === frame id, so seed maps the nav target to it).
  const framePfx = matchLayerPrefix(frame.name || "");
  if (framePfx && framePfx.role === "worksheet") {
    const { sheetName, chart } = parseSheetTag(framePfx.clean);
    const sheetBg = fillOf(frame);
    return {
      id: frame.id,
      title: frame.name || sheetName,
      width: bb.w || frame.width,
      height: bb.h || frame.height,
      background: sheetBg?.hex,
      zones: [
        { id: frame.id, name: frame.name || sheetName, kind: "sheet", x: 0, y: 0, w: bb.w || frame.width, h: bb.h || frame.height, sheetName, chart, markColor: dominantChartColor(frame) },
      ],
    };
  }

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

export function parseFaithful(): FaithfulModel {
  const frame = findFrame();
  if (!frame) throw new Error("Select a frame (or have at least one frame on the page) to convert.");
  return buildModelForFrame(frame);
}

/**
 * Resolve a selected node to the OUTERMOST frame-like ancestor — i.e. the
 * dashboard it belongs to. A top-level frame resolves to itself; a frame NESTED
 * in another frame (e.g. a `SHEET/` card the user dragged INTO their dashboard,
 * or staged sheets dropped inside it) resolves UP to that dashboard, so the
 * dashboard — with the sheet as a child — is what gets exported, not the lone
 * card. (Previously a frame-like node returned itself, which made a selected
 * inner `SHEET/` frame export as its own stray single-sheet dashboard.)
 */
function resolveFrame(node: SceneNode): SceneNode | undefined {
  let outer: SceneNode | undefined = isFrameLike(node) ? node : undefined;
  let p: BaseNode | null = node.parent;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    if (isFrameLike(p)) outer = p as SceneNode;
    p = p.parent;
  }
  if (outer) return outer;
  // A bare group selection with no frame ancestor: transpile it as-is.
  return "children" in node ? node : undefined;
}

function bbTopLeft(n: SceneNode): { x: number; y: number } {
  const bb = (n as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox;
  return bb ? { x: bb.x, y: bb.y } : { x: n.x, y: n.y };
}

/**
 * Every distinct frame the export should cover — one Tableau dashboard each.
 * The user's SELECTION drives it: select N frames → N dashboards (LaDataViz's
 * multi-dashboard workflow). Children of the same frame collapse to that frame;
 * results are de-duplicated and ordered top-to-bottom, left-to-right (reading
 * order) so dashboards come out in a predictable sequence. With nothing usable
 * selected we fall back to the single-frame behaviour (first frame on the page).
 */
function collectFrames(): SceneNode[] {
  const out: SceneNode[] = [];
  const seen = new Set<string>();
  for (const n of figma.currentPage.selection) {
    const f = resolveFrame(n as SceneNode);
    if (f && !seen.has(f.id)) {
      seen.add(f.id);
      out.push(f);
    }
  }
  if (out.length === 0) {
    const f = findFrame();
    if (f) out.push(f);
  }
  out.sort((a, b) => {
    const pa = bbTopLeft(a);
    const pb = bbTopLeft(b);
    return pa.y - pb.y || pa.x - pb.x;
  });
  return out;
}

/**
 * Transpile EVERY selected frame — one FaithfulModel (→ one Tableau dashboard)
 * per frame. This is the multi-dashboard entry point; `parseFaithful()` stays as
 * the single-frame transpile used by the capture tests.
 */
export function parseFaithfulAll(): FaithfulModel[] {
  const frames = collectFrames();
  if (!frames.length) throw new Error("Select one or more frames to convert.");
  return frames.map(buildModelForFrame);
}

/**
 * Build a SHEET-ONLY model from a node the designer wired a Nav/ link to: just
 * the one worksheet, no dashboard. This is what makes "navigate to a sheet" add
 * ONLY the sheet (not its enclosing dashboard). The zone id === the node id so
 * seed maps the nav target straight to this worksheet.
 */
function buildSheetOnlyModel(node: SceneNode): FaithfulModel {
  const pfx = matchLayerPrefix(node.name || "");
  const { sheetName, chart } = parseSheetTag(pfx ? pfx.clean : node.name || "Sheet");
  const bb =
    (node as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox ?? {
      x: node.x,
      y: node.y,
      w: node.width,
      h: node.height,
    };
  const w = bb.w || node.width || 600;
  const h = bb.h || node.height || 400;
  return {
    id: node.id,
    title: sheetName,
    sheetOnly: true,
    width: w,
    height: h,
    zones: [
      { id: node.id, name: node.name || sheetName, kind: "sheet", x: 0, y: 0, w, h, sheetName, chart, markColor: dominantChartColor(node) },
    ],
  };
}

/**
 * Resolve every Nav/ button's Figma interaction to a real export target, pulling
 * in any destination the user didn't select. For each Nav/ zone that carries a
 * `navTargetId` (the reaction's destination node):
 *   - if the destination is a SHEET (its own name is a SHEET/ layer, or it's
 *     already a placed sheet), navigate to that WORKSHEET. If its worksheet isn't
 *     already being exported, append a SHEET-ONLY model so just the sheet — NOT
 *     its whole dashboard — is added (the user's explicit ask);
 *   - otherwise navigate to the destination's enclosing DASHBOARD, appending that
 *     frame as a full dashboard model if it wasn't selected.
 * Only the directly-referenced destinations are pulled in (one level deep), so a
 * single Nav/ link can't drag the whole prototype graph into the export. Returns
 * the (possibly longer) model list. Runs in the sandbox (needs getNodeByIdAsync).
 */
export async function expandNavTargets(models: FaithfulModel[]): Promise<FaithfulModel[]> {
  const out = [...models];
  const haveFrame = new Set(out.map((m) => m.id).filter((id): id is string => !!id));
  const sheetNodeIds = new Set<string>();
  for (const m of out) for (const z of m.zones) if (z.kind === "sheet") sheetNodeIds.add(z.id);

  // Snapshot the nav zones from the USER-selected models only (one level deep).
  const navZones: FaithfulZone[] = [];
  for (const m of models) for (const z of m.zones) if (z.kind === "button" && z.navTargetId) navZones.push(z);

  for (const z of navZones) {
    let dest: BaseNode | null = null;
    try {
      dest = await figma.getNodeByIdAsync(z.navTargetId!);
    } catch {
      dest = null;
    }
    if (!dest || !("type" in dest)) continue;
    const destNode = dest as SceneNode;

    // SHEET destination -> navigate to a WORKSHEET. A destination is a sheet when
    // its OWN name carries a SHEET/ prefix, or it's already a placed sheet zone.
    const destPfx = matchLayerPrefix(destNode.name || "");
    const destIsSheet = (destPfx && destPfx.role === "worksheet") || sheetNodeIds.has(destNode.id);
    if (destIsSheet) {
      z.navTargetIsSheet = true;
      // If the worksheet isn't already in the export, add it ALONE (no dashboard).
      if (!sheetNodeIds.has(destNode.id) && !haveFrame.has(destNode.id)) {
        haveFrame.add(destNode.id);
        const sheetModel = buildSheetOnlyModel(destNode);
        out.push(sheetModel);
        sheetNodeIds.add(destNode.id);
      }
      continue;
    }

    // DASHBOARD destination -> navigate to the enclosing frame's window.
    const frame = resolveFrame(destNode);
    if (!frame) continue;
    z.navTargetFrameId = frame.id;
    z.navTargetIsSheet = false;
    if (!haveFrame.has(frame.id)) {
      haveFrame.add(frame.id);
      const model = buildModelForFrame(frame);
      out.push(model);
      for (const z2 of model.zones) if (z2.kind === "sheet") sheetNodeIds.add(z2.id);
    }
  }
  return out;
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
