// ---------------------------------------------------------------------------
// parser.ts — runs INSIDE the Figma sandbox (has the `figma` global, no DOM).
// Walks the selected frame and produces a dependency-free DashboardModel that
// is posted to the UI for mapping + Tableau generation.
// ---------------------------------------------------------------------------

import type {
  Color,
  DashboardModel,
  ParsedElement,
  ElementRole,
  ChartKind,
  Rect,
} from "../shared/types";
import {
  CHART_KEYWORDS,
  FILTER_KEYWORDS,
  NAV_KEYWORDS,
  HEADER_KEYWORDS,
  FOOTER_KEYWORDS,
  DEFAULT_SIZE,
  matchLayerPrefix,
} from "../shared/constants";

function toHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

function solidFill(node: SceneNode): Color | undefined {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return undefined;
  const solid = fills.find((f) => f.type === "SOLID" && f.visible !== false) as
    | SolidPaint
    | undefined;
  if (!solid) return undefined;
  const { r, g, b } = solid.color;
  const a = solid.opacity ?? 1;
  return { r, g, b, a, hex: toHex({ r, g, b }) };
}

function solidStroke(node: SceneNode): Color | undefined {
  const strokes = (node as GeometryMixin).strokes;
  if (!strokes || !Array.isArray(strokes)) return undefined;
  const solid = strokes.find((s) => s.type === "SOLID" && s.visible !== false) as
    | SolidPaint
    | undefined;
  if (!solid) return undefined;
  const { r, g, b } = solid.color;
  return { r, g, b, a: solid.opacity ?? 1, hex: toHex({ r, g, b }) };
}

function nameMatches(name: string, words: string[]): boolean {
  const n = name.toLowerCase();
  return words.some((w) => n.includes(w));
}

/**
 * Pull a KPI card's label + value out of its child TEXT layers (e.g. the
 * "metric" frame holds TEXT "Tasks Completed" + TEXT "67/85"). The card is an
 * opaque leaf, so we read its descendants directly here. Returns "label\nvalue".
 */
function kpiText(node: SceneNode): string | undefined {
  if (!("children" in node)) return undefined;
  const texts: string[] = [];
  const walk = (n: SceneNode) => {
    if (n.type === "TEXT") {
      const c = (n as TextNode).characters;
      if (typeof c === "string" && c.trim()) texts.push(c.trim());
    }
    if ("children" in n) for (const k of (n as ChildrenMixin).children) walk(k as SceneNode);
  };
  for (const k of (node as ChildrenMixin).children) walk(k as SceneNode);
  if (!texts.length) return undefined;
  const value = texts.find((t) => /\d/.test(t)); // "67/85", "48%", "3.6"
  const label = texts.find((t) => !/\d/.test(t) && t.length > 2);
  const parts = [label, value].filter(Boolean) as string[];
  return parts.length ? parts.join("\n") : texts[0];
}

/** True if the node is painted with a raster IMAGE fill (a logo/photo). */
function hasImageFill(node: SceneNode): boolean {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return false;
  return fills.some((f) => f.type === "IMAGE" && f.visible !== false);
}

/** Guess a chart kind from a layer name; undefined if no hint. */
function guessChartKind(name: string): ChartKind | undefined {
  for (const { kind, words } of CHART_KEYWORDS) {
    if (nameMatches(name, words)) return kind;
  }
  return undefined;
}

/** Layer-name words that mean "this is a worksheet/chart" without a chart kind. */
const WORKSHEET_KEYWORDS = ["sheet", "worksheet", "graph", "chart", "viz", "plot", "visual"];

/**
 * Pull a chart-kind hint out of a layer name and return a clean display name.
 * Supports the user's "[bar-hor]" / "[line]" bracket convention: the bracket
 * picks the mark type and is stripped from what we show ("Sheet 1[bar-hor]" ->
 * "Sheet 1", kind "bar").
 */
function parseNameHints(name: string): { clean: string; kind?: ChartKind } {
  let kind: ChartKind | undefined;
  const m = name.match(/\[([^\]]+)\]/);
  if (m) kind = guessChartKind(m[1]);
  const clean = name.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();
  return { clean: clean || name, kind };
}

/** True if e sits inside s (by center) and is meaningfully smaller — a label. */
function rectInside(s: Rect, e: Rect): boolean {
  const ecx = e.x + e.w / 2;
  const ecy = e.y + e.h / 2;
  return (
    ecx >= s.x &&
    ecx <= s.x + s.w &&
    ecy >= s.y &&
    ecy <= s.y + s.h &&
    e.w * e.h < s.w * s.h * 0.92
  );
}

const FRAME_LIKE = ["FRAME", "GROUP", "COMPONENT", "INSTANCE"];
function isFrameType(n: SceneNode): boolean {
  return FRAME_LIKE.indexOf(n.type) !== -1;
}
function hasChildNodes(n: SceneNode): boolean {
  return "children" in n && (n as ChildrenMixin).children.length > 0;
}

/**
 * True if a frame/group is a LAYOUT container that lays out multiple sub-panels
 * (charts/cards), rather than a single leaf chart. We recurse into these to
 * surface the real sheets inside.
 *
 * CRITICAL: only real sub-panels count — child FRAMES/GROUPS, or large
 * RECTANGLE panels. Plain TEXT/labels (e.g. a "S3 Graph" caption) NEVER make a
 * parent a container; otherwise a single chart panel gets torn apart into its
 * label text and an empty box (and no worksheet is produced).
 */
function looksLikeLayoutContainer(node: SceneNode): boolean {
  if (!("children" in node)) return false;
  const kids = (node as ChildrenMixin).children.filter(
    (c) => (c as SceneNode).visible !== false
  ) as SceneNode[];
  if (kids.length === 0) return false;
  const parentArea = node.width * node.height || 1;

  // A single frame-like child that itself has children = a pass-through wrapper
  // (a wrapper-of-wrapper chain). Recurse so we reach the panels inside.
  if (kids.length === 1) {
    return isFrameType(kids[0]) && hasChildNodes(kids[0]);
  }

  // Otherwise: count sizeable sub-panels. 2+ => this node lays them out.
  // A panel is a LARGE child (frame or rectangle) — size is the reliable
  // signal. We do NOT count a child merely because it has children: a chart
  // card with a tiny header sub-frame must stay a single worksheet, not be
  // mistaken for a layout container and torn apart.
  let panels = 0;
  for (const c of kids) {
    const big = c.width * c.height > 0.08 * parentArea;
    const named = nameMatches(c.name || "", WORKSHEET_KEYWORDS);
    if (isFrameType(c)) {
      if (big || named) panels++;
    } else if (c.type === "RECTANGLE" && big) {
      panels++;
    }
    // TEXT / VECTOR / LINE / ELLIPSE labels are NOT panels — ignored on purpose.
  }
  return panels >= 2;
}

/**
 * Classify a node into a Tableau-oriented role using name + structure + size.
 * The UI lets the user override every guess, so we err toward useful defaults.
 */
function classify(node: SceneNode, dash: Rect): { role: ElementRole; chartKind?: ChartKind } {
  const name = node.name || "";
  const t = node.type;

  if (t === "TEXT") {
    // Big text near the top is a header; otherwise a label.
    return { role: "text" };
  }

  if (nameMatches(name, FILTER_KEYWORDS)) return { role: "filter" };
  if (nameMatches(name, NAV_KEYWORDS)) return { role: "container" };
  if (nameMatches(name, HEADER_KEYWORDS)) return { role: "text" };
  if (nameMatches(name, FOOTER_KEYWORDS)) return { role: "text" };

  // A raster fill on a leaf (or rectangle) is a logo/photo -> Tableau image.
  const childless = !("children" in node) || (node as ChildrenMixin).children.length === 0;
  if (hasImageFill(node) && (childless || t === "RECTANGLE")) return { role: "image" };

  // A frame/group that lays out multiple sub-panels is a CONTAINER we recurse
  // into — decide this BEFORE any name-keyword guess. Otherwise a section
  // wrapper whose name happens to trip a chart keyword (e.g. "Data Metrics"
  // matching "metric", or a frame called "Charts") gets collapsed into a single
  // KPI/worksheet and every chart inside it is lost.
  const frameLike = t === "FRAME" || t === "GROUP" || t === "COMPONENT" || t === "INSTANCE";
  const layout = frameLike && looksLikeLayoutContainer(node);
  if (layout) return { role: "container" };

  const kind = guessChartKind(name);
  if (kind === "kpi") return { role: "kpi", chartKind: "kpi" };
  if (kind) return { role: "worksheet", chartKind: kind };

  // A node named like a sheet/chart (e.g. "Sheet 3", "S4 Graph") is a worksheet
  // LEAF (it wasn't a multi-panel container, handled above).
  if (nameMatches(name, WORKSHEET_KEYWORDS)) {
    return { role: "worksheet", chartKind: guessChartKind(name) ?? "bar" };
  }

  // Structural fallback: a wide-but-short rounded card tends to be a KPI; a
  // large frame is a chart panel.
  const area = node.width * node.height;
  const dashArea = dash.w * dash.h || 1;
  const ratio = area / dashArea;
  const aspect = node.width / Math.max(1, node.height);

  if (frameLike && ratio > 0.04) {
    if (aspect > 2.4 && node.height < dash.h * 0.18) return { role: "kpi", chartKind: "kpi" };
    return { role: "worksheet", chartKind: "bar" };
  }
  // A sizeable standalone rectangle is a chart panel/placeholder; a small one is
  // decorative chrome.
  if (t === "RECTANGLE") {
    return ratio > 0.04 ? { role: "worksheet", chartKind: "bar" } : { role: "container" };
  }
  return { role: "ignore" };
}

function rectOf(node: SceneNode, origin: { x: number; y: number }): Rect {
  // absoluteBoundingBox is robust across rotation/transform.
  const bb = (node as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox;
  if (bb) {
    return { x: bb.x - origin.x, y: bb.y - origin.y, w: bb.w ?? node.width, h: bb.h ?? node.height };
  }
  return { x: node.x - origin.x, y: node.y - origin.y, w: node.width, h: node.height };
}

function parseNode(
  node: SceneNode,
  origin: { x: number; y: number },
  dash: Rect,
  depth: number
): ParsedElement | null {
  if (node.visible === false) return null;

  // LaDataViz-style prefix wins over heuristics: "SHEET/Foo" -> worksheet "Foo".
  const prefix = matchLayerPrefix(node.name || "");
  let role: ElementRole;
  let chartKind: ChartKind | undefined;
  if (prefix) {
    role = prefix.role;
    chartKind = role === "worksheet" ? guessChartKind(node.name) ?? "bar" : undefined;
  } else {
    const guess = classify(node, dash);
    role = guess.role;
    chartKind = guess.chartKind;
  }
  const rect = rectOf(node, origin);

  // Clean "[bar-hor]"-style chart hints out of the display name, and let the
  // hint pick the mark type for worksheets.
  const hints = parseNameHints(prefix ? prefix.clean : node.name || "");
  if (role === "worksheet" && hints.kind) chartKind = hints.kind;

  const el: ParsedElement = {
    id: node.id,
    name: hints.clean,
    figmaType: node.type,
    rect,
    role,
    chartKind,
    explicit: !!prefix,
    fill: solidFill(node),
    stroke: solidStroke(node),
  };

  // Auto Layout direction drives faithful "tiled" container export.
  const lm = (node as SceneNode & { layoutMode?: string }).layoutMode;
  if (lm === "HORIZONTAL") el.autoLayout = "horz";
  else if (lm === "VERTICAL") el.autoLayout = "vert";

  if (node.type === "TEXT") {
    const tn = node as TextNode;
    el.text = typeof tn.characters === "string" ? tn.characters : "";
    if (tn.fontSize !== figma.mixed) el.fontSize = tn.fontSize as number;
    if (tn.fontName !== figma.mixed) {
      el.fontFamily = (tn.fontName as FontName).family;
      el.bold = /bold|semibold|black|heavy/i.test((tn.fontName as FontName).style);
    }
  }

  if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
    el.cornerRadius = node.cornerRadius;
  }

  // For a KPI card, pull its label + number out of the child text so the tile
  // shows "Tasks Completed / 67/85" instead of an empty "—" placeholder.
  if (role === "kpi" && !el.text) {
    const kt = kpiText(node);
    if (kt) el.text = kt;
  }

  // Auto-name charts/KPIs from their inner TITLE text so sheets are called
  // "Daily Task Completion", not "container" / "Group 289204". The user can't
  // hand-name every layer, so we derive a readable name. An explicit prefix
  // (SHEET/Name) always wins and is left untouched.
  if (!prefix && (role === "worksheet" || role === "kpi")) {
    const title =
      role === "kpi" && el.text ? el.text.split("\n")[0].trim() : firstTitleText(node);
    if (title && title.length >= 2) el.name = title.slice(0, 60);
  }

  // Recurse only one level into chart panels (we don't need their internals),
  // but fully recurse into pure containers so we surface nested charts/text.
  // An explicitly-prefixed leaf (SHEET/, IMAGE/, BUTTON/, FILTER/) is opaque.
  const isLeafChart =
    role === "worksheet" ||
    role === "kpi" ||
    role === "filter" ||
    role === "image" ||
    (prefix && role !== "container");
  if (!isLeafChart && "children" in node && depth < 16) {
    const kids: ParsedElement[] = [];
    for (const child of node.children) {
      const parsed = parseNode(child as SceneNode, origin, dash, depth + 1);
      if (parsed) kids.push(parsed);
    }
    if (kids.length) el.children = kids;
  }

  return el;
}

/** Flatten the tree to the meaningful leaves we map to Tableau objects. */
function flatten(els: ParsedElement[], out: ParsedElement[]): void {
  for (const e of els) {
    const hasKids = e.children && e.children.length > 0;
    if (e.role !== "ignore" && e.role !== "container") {
      out.push({ ...e, children: undefined });
    } else if (e.role === "container" && !hasKids && e.fill) {
      // a standalone styled rectangle = a visual container worth keeping
      out.push({ ...e, children: undefined });
    }
    if (hasKids) flatten(e.children!, out);
  }
}

function collectPalette(els: ParsedElement[]): string[] {
  const counts = new Map<string, number>();
  const add = (c?: Color) => {
    if (c && c.a > 0.05) counts.set(c.hex, (counts.get(c.hex) ?? 0) + 1);
  };
  const walk = (list: ParsedElement[]) => {
    for (const e of list) {
      add(e.fill);
      add(e.stroke);
      if (e.children) walk(e.children);
    }
  };
  walk(els);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
}

function collectFonts(els: ParsedElement[]): string[] {
  const set = new Set<string>();
  const walk = (list: ParsedElement[]) => {
    for (const e of list) {
      if (e.fontFamily) set.add(e.fontFamily);
      if (e.children) walk(e.children);
    }
  };
  walk(els);
  return [...set];
}

/**
 * Entry point. Parses the current selection (or the first top-level frame on
 * the page if nothing is selected) into a DashboardModel.
 */
/**
 * The frame we convert. LaDataViz-style: convert EXACTLY what the user selected.
 * - If the selection is itself a frame/component/instance, use that node — do
 *   NOT climb to an outer wrapper frame (climbing would convert the wrong
 *   design, e.g. a parent board that also holds a sample dashboard).
 * - If the user clicked a child LEAF layer (text, shape) inside a dashboard,
 *   climb to the NEAREST frame ancestor so we still grab the whole dashboard.
 * Falls back to the first top-level frame on the page when nothing useful is
 * selected.
 */
function isFrameLike(n: BaseNode): boolean {
  return (
    n.type === "FRAME" ||
    n.type === "COMPONENT" ||
    n.type === "COMPONENT_SET" ||
    n.type === "INSTANCE"
  );
}

export function findFrame(): SceneNode | undefined {
  const sel = figma.currentPage.selection[0];
  if (sel) {
    // Selected a frame/component directly -> convert THAT frame, as-is.
    if (isFrameLike(sel)) return sel;
    // Selected a child layer -> climb only to the NEAREST frame ancestor.
    let p: BaseNode | null = sel.parent;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      if (isFrameLike(p)) return p as SceneNode;
      p = p.parent;
    }
    // Selected a non-frame container (e.g. a group) with no frame ancestor.
    if ("children" in sel) return sel;
  }
  return figma.currentPage.children.find(
    (n) => n.type === "FRAME" || n.type === "COMPONENT"
  ) as SceneNode | undefined;
}

/**
 * Diagnostic dump of the raw Figma tree + the role each node would classify to.
 * Surfaced in the UI Preview so structure mismatches can be inspected directly.
 */
function buildDebugTree(node: SceneNode, dash: Rect, depth: number, out: string[]): void {
  if (depth > 6 || out.length > 120) return;
  if ((node as SceneNode).visible === false) return;
  const prefix = matchLayerPrefix(node.name || "");
  const role = prefix ? prefix.role : classify(node, dash).role;
  const w = Math.round(node.width);
  const h = Math.round(node.height);
  out.push(`${"  ".repeat(depth)}${node.type} "${(node.name || "").slice(0, 24)}" ${w}x${h} -> ${role}`);
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) {
      buildDebugTree(c as SceneNode, dash, depth + 1, out);
    }
  }
}

export function parseSelection(): DashboardModel {
  const frame = findFrame();
  if (!frame) {
    throw new Error("Select a frame (or have at least one frame on the page) to convert.");
  }

  const bb =
    (frame as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox ?? {
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
    };
  const origin = { x: bb.x, y: bb.y };
  const dash: Rect = { x: 0, y: 0, w: bb.w || DEFAULT_SIZE.width, h: bb.h || DEFAULT_SIZE.height };

  const tree: ParsedElement[] = [];
  if ("children" in frame) {
    for (const child of frame.children) {
      const parsed = parseNode(child as SceneNode, origin, dash, 0);
      if (parsed) tree.push(parsed);
    }
  }

  const rawFlat: ParsedElement[] = [];
  flatten(tree, rawFlat);

  // De-overlap: drop text/kpi/filter/container labels that fall INSIDE a
  // worksheet/image region — they're the chart's own title/number/legend in the
  // mockup, not separate dashboard objects. This is what makes the export place
  // cleanly instead of piling leaked labels on top of the charts.
  const regions = rawFlat.filter((e) => e.role === "worksheet" || e.role === "image");
  const flat = rawFlat.filter((e) => {
    if (e.role === "worksheet" || e.role === "image") return true;
    return !regions.some((s) => s !== e && rectInside(s.rect, e.rect));
  });

  const dbg: string[] = [];
  if ("children" in frame) {
    for (const child of frame.children) buildDebugTree(child as SceneNode, dash, 0, dbg);
  }

  // Promote the largest top-of-frame text to the dashboard title.
  let title = frame.name || "Dashboard";
  const headings = flat
    .filter((e) => e.figmaType === "TEXT" && e.text && e.rect.y < dash.h * 0.18)
    .sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
  if (headings.length && headings[0].text) title = headings[0].text!.split("\n")[0].slice(0, 80);

  return {
    id: frame.id,
    title,
    width: dash.w,
    height: dash.h,
    background: solidFill(frame),
    elements: flat,
    tree,
    palette: collectPalette(tree),
    fonts: collectFonts(tree),
    debugTree: dbg.join("\n"),
  };
}

// --- image export (sandbox-only; the UI iframe has no `figma` global) --------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64-encode bytes without `btoa` (absent in the Figma sandbox). */
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

/** Render a node to a base64 PNG, or undefined if it can't be exported. */
async function exportPng(node: SceneNode, scale = 2): Promise<string | undefined> {
  const exporter = node as SceneNode & {
    exportAsync?: (s: { format: "PNG"; constraint?: { type: "SCALE"; value: number } }) => Promise<Uint8Array>;
  };
  if (typeof exporter.exportAsync !== "function") return undefined;
  const bytes = await exporter.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
  return bytesToBase64(bytes);
}

/**
 * Rasterize every image-role element (logos/icons) to a PNG and attach it to
 * the model. Runs after parseSelection, inside the sandbox.
 */
export async function attachImages(model: DashboardModel): Promise<void> {
  for (const e of model.elements) {
    if (e.role !== "image" || e.imagePng) continue;
    try {
      const node = (await figma.getNodeByIdAsync(e.id)) as SceneNode | null;
      if (node) e.imagePng = await exportPng(node);
    } catch (e) {
      console.warn("Image export failed for element:", e);
    }
  }
}

// --- auto-tagging: rename detected layers with LaDataViz-style prefixes -------

const PREFIX_FOR: Partial<Record<ElementRole, string>> = {
  worksheet: "SHEET/",
  kpi: "KPI/",
  image: "IMAGE/",
  filter: "FILTER/",
  button: "BUTTON/",
};

/** First descendant TEXT that reads like a human title (3–40 chars, not a number). */
function firstTitleText(node: SceneNode): string | undefined {
  if (!("children" in node)) return undefined;
  let found: string | undefined;
  const walk = (n: SceneNode) => {
    if (found) return;
    if (n.type === "TEXT") {
      const c = (n as TextNode).characters;
      if (typeof c === "string") {
        const t = c.trim().split("\n")[0];
        if (t.length >= 3 && t.length <= 40 && !/^\d/.test(t)) found = t;
      }
    }
    if ("children" in n) for (const k of (n as ChildrenMixin).children) walk(k as SceneNode);
  };
  for (const k of (node as ChildrenMixin).children) walk(k as SceneNode);
  return found;
}

/** A readable name for a worksheet/KPI layer: its title text, else its clean name. */
function niceName(node: SceneNode, e: ParsedElement): string {
  if (e.role === "kpi" && e.text) {
    const label = e.text.split("\n")[0].trim();
    if (label && !/^\d/.test(label)) return label.slice(0, 40);
  }
  if (e.role === "worksheet") {
    const t = firstTitleText(node);
    if (t) return t.slice(0, 40);
  }
  const base = (e.name || node.name || "Sheet").replace(/[/]/g, " ").trim();
  return base.slice(0, 40) || "Sheet";
}

/**
 * Rename the detected chart/KPI/image/filter/button layers in Figma with the
 * matching LaDataViz-style prefix (SHEET/, KPI/, …) so future parses are
 * deterministic. Skips layers that already carry a known prefix. Returns the
 * number of layers renamed.
 */
export async function applyAutoTags(): Promise<number> {
  const model = parseSelection();
  let n = 0;
  for (const e of model.elements) {
    const prefix = PREFIX_FOR[e.role];
    if (!prefix) continue;
    let node: SceneNode | null = null;
    try {
      node = (await figma.getNodeByIdAsync(e.id)) as SceneNode | null;
    } catch (e) {
      console.warn("getNodeByIdAsync failed in auto-tag:", e);
      node = null;
    }
    if (!node) continue;
    if (matchLayerPrefix(node.name || "")) continue; // already tagged
    node.name = prefix + niceName(node, e);
    n++;
  }
  return n;
}
