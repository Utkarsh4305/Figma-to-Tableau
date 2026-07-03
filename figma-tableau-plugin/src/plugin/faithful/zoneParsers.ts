// ---------------------------------------------------------------------------
// zoneParsers.ts — SHEET / BUTTON / Nav / FILTER layer-name parsers.
// ---------------------------------------------------------------------------

import { toHex, PT_PER_PX, solidHex } from "./colorGeometry";

// Map a "[type]" tag (from a "SHEET/Name[type]" layer name, the LaDataViz
// convention) to a Tableau mark class. Default Bar. Mirrors Template.twbx,
// where "[bar-hor]" -> Bar and "[area]" -> Area worksheets were generated.
export function markFromTag(tag: string | undefined): string {
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
export function parseLayerOptions(clean: string): {
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
export function parseButtonName(clean: string): { label: string; target?: string } {
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
export function dominantChartColor(node: SceneNode): string | undefined {
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
export function navDestination(node: SceneNode): string | undefined {
  const reactions = (node as SceneNode & { reactions?: readonly unknown[] }).reactions;
  if (Array.isArray(reactions)) {
    for (const r of reactions as Array<{ action?: unknown; actions?: unknown[] }>) {
      const actions = Array.isArray(r.actions) ? r.actions : r.action ? [r.action] : [];
      for (const a of actions as Array<{ type?: string; destinationId?: string | null }>) {
        if (a && a.type === "NODE" && a.destinationId) return a.destinationId;
      }
    }
  }
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) {
      const d = navDestination(c as SceneNode);
      if (d) return d;
    }
  }
  return undefined;
}

/** First TEXT descendant's text + color + point size (a button's caption). */
export function firstTextStyle(node: SceneNode): { text?: string; color?: string; sizePt?: number } {
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
export function parseSheetTag(clean: string): { sheetName: string; chart: string } {
  const m = clean.match(/\[([^\]]*)\]/);
  const sheetName = clean.replace(/\[[^\]]*\]/g, "").trim() || clean || "Sheet";
  return { sheetName, chart: markFromTag(m ? m[1] : undefined) };
}
