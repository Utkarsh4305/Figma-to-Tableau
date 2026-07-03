// ---------------------------------------------------------------------------
// Shared builders for library components, default components, KPI/text cards,
// and the dashboard frame resolver.
// ---------------------------------------------------------------------------

/** Component library: 15 pre-built components with proper naming conventions. */
export const LIBRARY_COMPONENTS: Record<string, { name: string; w: number; h: number; fill: RGB; caption?: string; capColor?: RGB; stroke?: boolean; radius?: number; fontSize?: number }> = {
  "worksheet":          { name: "SHEET/New Worksheet[bar]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Worksheet", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "bar-chart":          { name: "SHEET/Bar Chart[bar]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Bar Chart", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "line-chart":         { name: "SHEET/Line Chart[line]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Line Chart", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "area-chart":         { name: "SHEET/Area Chart[area]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Area Chart", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "pie-chart":          { name: "SHEET/Pie Chart[pie]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Pie Chart", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "scatter-plot":       { name: "SHEET/Scatter Plot[scatter]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Scatter Plot", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "heatmap":            { name: "SHEET/Heatmap[heatmap]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Heatmap", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "table":              { name: "SHEET/Data Table[table]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Data Table", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
  "kpi-large":          { name: "KPI/Metric", w: 260, h: 140, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "1,234", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 32 },
  "kpi-small":          { name: "KPI/Sub Metric", w: 180, h: 80, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "56.7%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 22 },
  "filter":             { name: "FILTER/Category", w: 220, h: 40, fill: { r: 1, g: 1, b: 1 }, caption: "Category \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true, radius: 8 },
  "nav-button":         { name: "Nav/Dashboard", w: 160, h: 48, fill: { r: 0.145, g: 0.388, b: 0.922 }, caption: "Dashboard", capColor: { r: 1, g: 1, b: 1 }, radius: 8 },
  "named-button":       { name: "BUTTON/Open > Dashboard", w: 180, h: 48, fill: { r: 0.067, g: 0.094, b: 0.153 }, caption: "Open", capColor: { r: 1, g: 1, b: 1 }, radius: 8 },
  "text-box":           { name: "TEXT/Body", w: 360, h: 48, fill: { r: 1, g: 1, b: 1 }, caption: "Body text", capColor: { r: 0.06, g: 0.09, b: 0.15 } },
  "image-placeholder":  { name: "Image/Placeholder", w: 140, h: 140, fill: { r: 0.9, g: 0.91, b: 0.96 }, caption: "Image", capColor: { r: 0.4, g: 0.43, b: 0.55 }, stroke: true },
  "web-object":         { name: "URL/example.com", w: 480, h: 320, fill: { r: 0.97, g: 0.98, b: 1.0 }, caption: "URL/example.com", capColor: { r: 0.25, g: 0.28, b: 0.42 }, stroke: true },
};

/** Card types whose whole body IS a single text caption (the Text Box). Laid out
 * with `fillCaption` so it never clips. (KPI cards get their own multi-line
 * builder — see `fillKpiRows` — so they're not listed here.) */
export const TEXT_CARD_IDS = new Set(["text-box"]);

/** Default KPI card rows: heading / value / change, per KPI size. Rendered as ONE
 * text layer with a styled line per row (see `fillKpiRows`) so the user can just
 * edit/delete lines to get a 2- or 1-row KPI, and it can never clip or overlap on
 * export (a single Tableau text zone lays the lines out with correct spacing). */
export const KPI_ROWS: Record<string, Array<{ text: string; size: number; color: RGB }>> = {
  "kpi-large": [
    { text: "Metric",       size: 13, color: { r: 0.4,  g: 0.43, b: 0.55 } },
    { text: "1,234",        size: 32, color: { r: 0.1,  g: 0.12, b: 0.2  } },
    { text: "+12% vs last", size: 13, color: { r: 0.4,  g: 0.43, b: 0.55 } },
  ],
  "kpi-small": [
    { text: "Metric", size: 11, color: { r: 0.4,  g: 0.43, b: 0.55 } },
    { text: "56.7%",  size: 22, color: { r: 0.1,  g: 0.12, b: 0.2  } },
    { text: "+3.2%",  size: 11, color: { r: 0.4,  g: 0.43, b: 0.55 } },
  ],
};

/**
 * Lay a text-primary card out as a hug-height vertical Auto-Layout frame and drop
 * a caption inside that fills the card width and wraps. This fixes the KPI/text
 * clipping bug: a plain fixed-size frame clips content, so a caption taller than
 * the frame (multi-line) or wider than it got cut off top/bottom and left/right.
 * Here the caption stretches to the card width (wraps instead of clipping in X)
 * and the card hugs its height to fit every line (no clipping in Y). Stays
 * responsive — narrowing the card re-wraps the text and re-flows the height. */
export function fillCaption(
  frame: FrameNode,
  font: FontName,
  caption: string,
  fontSize: number,
  color: RGB,
  padX = 14,
  padY = 12,
): void {
  frame.layoutMode            = "VERTICAL";
  frame.counterAxisSizingMode = "FIXED";
  frame.primaryAxisSizingMode = "AUTO";
  frame.primaryAxisAlignItems = "CENTER";
  frame.paddingLeft = frame.paddingRight = padX;
  frame.paddingTop  = frame.paddingBottom = padY;
  frame.itemSpacing = 2;

  const txt = figma.createText();
  txt.fontName   = font;
  txt.characters = caption;
  txt.fontSize   = fontSize;
  txt.fills      = [{ type: "SOLID", color }];
  txt.textAutoResize = "HEIGHT";
  frame.appendChild(txt);
  txt.layoutAlign    = "STRETCH";
}

/**
 * Fill a KPI card with a heading / value / change stack, as ONE text layer whose
 * three lines each carry their own size + color, inside a hug-height vertical
 * Auto-Layout. One layer (not three) is deliberate: a single Tableau text zone
 * lays the lines out with correct spacing, so it can never clip a descender or
 * overlap a sibling zone on export (three separate zones could). It's still fully
 * flexible — the user edits the text and can delete the heading or change line to
 * drop to a 2- or 1-row KPI; the card re-hugs its height automatically. */
export function fillKpiRows(
  frame: FrameNode,
  font: FontName,
  rows: Array<{ text: string; size: number; color: RGB }>,
): void {
  frame.layoutMode            = "VERTICAL";
  frame.counterAxisSizingMode = "FIXED";
  frame.primaryAxisSizingMode = "AUTO";
  frame.primaryAxisAlignItems = "CENTER";
  frame.paddingLeft = frame.paddingRight = 14;
  frame.paddingTop  = frame.paddingBottom = 12;
  frame.itemSpacing = 2;

  const txt = figma.createText();
  txt.fontName   = font;
  txt.characters = rows.map((r) => r.text).join("\n");
  txt.fontSize   = rows[0].size;
  txt.fills      = [{ type: "SOLID", color: rows[0].color }];
  let pos = 0;
  for (const r of rows) {
    const end = pos + r.text.length;
    if (end > pos) {
      txt.setRangeFontSize(pos, end, r.size);
      txt.setRangeFills(pos, end, [{ type: "SOLID", color: r.color }]);
    }
    pos = end + 1;
  }
  txt.textAutoResize = "HEIGHT";
  frame.appendChild(txt);
  txt.layoutAlign    = "STRETCH";
}

/** Build (but don't place) a library-component frame. Shared by click-insert and
 * drag-and-drop so both produce an identical, correctly-named layer. */
export function buildLibraryFrame(componentId: string, font: FontName | null): FrameNode | null {
  const t = LIBRARY_COMPONENTS[componentId];
  if (!t) return null;
  const f = figma.createFrame();
  f.name = t.name;
  f.resize(t.w, t.h);
  f.cornerRadius = t.radius ?? 10;
  f.fills = [{ type: "SOLID", color: t.fill }];
  if (t.stroke) {
    f.strokes = [{ type: "SOLID", color: { r: 0.78, g: 0.8, b: 0.9 } }];
    f.strokeWeight = 1;
  }
  if (font && KPI_ROWS[componentId]) {
    fillKpiRows(f, font, KPI_ROWS[componentId]);
  } else if (font && t.caption) {
    const fontSize = t.fontSize ?? 14;
    const color = t.capColor ?? { r: 0.25, g: 0.28, b: 0.42 };
    if (TEXT_CARD_IDS.has(componentId)) {
      fillCaption(f, font, t.caption, fontSize, color);
    } else {
      const txt = figma.createText();
      txt.fontName = font;
      txt.characters = t.caption;
      txt.fontSize = fontSize;
      txt.fills = [{ type: "SOLID", color }];
      f.appendChild(txt);
      txt.x = 14;
      txt.y = Math.max(8, (t.h - txt.height) / 2);
    }
  }
  return f;
}

/** Per-kind Defaults template: layer name (carries the LaDataViz prefix), size,
 * look and the caption text drawn inside (so it reads like a real component in
 * Figma). Shared by click-insert and drag-and-drop. */
export const DEFAULT_COMPONENTS: Record<string, { name: string; w: number; h: number; fill: RGB; caption?: string; capColor?: RGB }> = {
  sheet:  { name: "SHEET/New Sheet[bar]", w: 360, h: 240, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "SHEET/New Sheet[bar]", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
  kpi:    { name: "KPI/Metric",           w: 220, h: 120, fill: { r: 0.95, g: 0.96, b: 1.0 },  caption: "1,234", capColor: { r: 0.1, g: 0.12, b: 0.2 } },
  nav:    { name: "Nav/Go to…",           w: 160, h: 48,  fill: { r: 0.145, g: 0.388, b: 0.922 }, caption: "Go to…", capColor: { r: 1, g: 1, b: 1 } },
  button: { name: "BUTTON/Open > Dashboard", w: 180, h: 48, fill: { r: 0.067, g: 0.094, b: 0.153 }, caption: "Open", capColor: { r: 1, g: 1, b: 1 } },
  filter: { name: "FILTER/Region",        w: 220, h: 40,  fill: { r: 1, g: 1, b: 1 },          caption: "Region ▾", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
  image:  { name: "Image/Logo",           w: 140, h: 140, fill: { r: 0.9, g: 0.91, b: 0.96 },  caption: "Image", capColor: { r: 0.4, g: 0.43, b: 0.55 } },
  web:    { name: "URL/example.com",      w: 480, h: 320, fill: { r: 0.97, g: 0.98, b: 1.0 },  caption: "URL/example.com", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
  text:   { name: "TEXT/Heading",         w: 360, h: 48,  fill: { r: 1, g: 1, b: 1 },           caption: "Heading", capColor: { r: 0.06, g: 0.09, b: 0.15 } },
};

/** Build (but don't place) a Defaults-tab starter frame. Shared by click-insert
 * and drag-and-drop so both produce an identical, correctly-named layer. */
export function buildDefaultFrame(kind: string, font: FontName | null): FrameNode | null {
  const t = DEFAULT_COMPONENTS[kind] ?? DEFAULT_COMPONENTS.sheet;
  if (!t) return null;
  const f = figma.createFrame();
  f.name = t.name;
  f.resize(t.w, t.h);
  f.cornerRadius = kind === "nav" || kind === "button" || kind === "filter" ? 8 : 10;
  f.fills = [{ type: "SOLID", color: t.fill }];
  if (kind === "sheet" || kind === "image" || kind === "web" || kind === "filter") {
    f.strokes = [{ type: "SOLID", color: { r: 0.78, g: 0.8, b: 0.9 } }];
    f.strokeWeight = 1;
  }
  if (font && t.caption) {
    const fontSize = kind === "kpi" ? 28 : 14;
    const color = t.capColor ?? { r: 0.25, g: 0.28, b: 0.42 };
    if (kind === "kpi" || kind === "text") {
      fillCaption(f, font, t.caption, fontSize, color);
    } else {
      const txt = figma.createText();
      txt.fontName = font;
      txt.characters = t.caption;
      txt.fontSize = fontSize;
      txt.fills = [{ type: "SOLID", color }];
      f.appendChild(txt);
      txt.x = 14;
      txt.y = Math.max(8, (t.h - txt.height) / 2);
    }
  }
  return f;
}

/** The dashboard frame in play: the selection resolved up to its outermost
 * frame, else the first frame on the page, else null. */
export function findDashboardFrame(): SceneNode | null {
  const sel = figma.currentPage.selection[0];
  const isFrameLike = (n: BaseNode) =>
    n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE" || n.type === "COMPONENT_SET";
  if (sel) {
    let p: BaseNode | null = sel;
    let outer: SceneNode | null = null;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      if (isFrameLike(p)) outer = p as SceneNode;
      p = p.parent;
    }
    if (outer) return outer;
  }
  return (figma.currentPage.children.find((n) => n.type === "FRAME") as SceneNode) || null;
}
