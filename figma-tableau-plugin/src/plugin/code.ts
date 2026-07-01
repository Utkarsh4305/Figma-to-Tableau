// ---------------------------------------------------------------------------
// code.ts — the Figma plugin main thread (sandbox). Has the `figma` global,
// no DOM. Opens the UI, parses the selection into a DashboardModel, and posts
// it to the UI. All Tableau generation / zipping / downloading happens in the
// UI iframe (which has Blob + JSZip + FileSaver).
// ---------------------------------------------------------------------------

import { parseSelection, attachImages, applyAutoTags } from "./parser";
import { parseFaithfulAll, attachFaithfulImages, expandNavTargets } from "./faithful";
import type { UiToPlugin, PluginToUi } from "../shared/types";
import { UI_SIZE } from "../shared/constants";

figma.showUI(__html__, { width: UI_SIZE.width, height: UI_SIZE.height, themeColors: true });

function post(msg: PluginToUi): void {
  figma.ui.postMessage(msg);
}

async function parseAndSend(): Promise<void> {
  try {
    const model = parseSelection();
    // Rasterizing logos is best-effort: a failure must not block the model.
    try {
      await attachImages(model);
    } catch {
      /* images just won't render as bitmaps */
    }
    post({ type: "model-ready", model });
  } catch (e) {
    post({ type: "model-ready", model: null, error: (e as Error).message });
  }
}

/** Restore the imported workbook data persisted from a prior session. */
async function restoreImport(): Promise<void> {
  try {
    const stored = await figma.clientStorage.getAsync("ft-import");
    post({ type: "import-restored", data: stored ?? null });
  } catch {
    post({ type: "import-restored", data: null });
  }
}

// Rename detected layers with SHEET//KPI/… prefixes, then re-parse so the UI
// reflects the now-explicit classification.
async function applyTagsAndResend(): Promise<void> {
  try {
    const n = await applyAutoTags();
    figma.notify(n ? `Tagged ${n} layer(s) — re-reading…` : "Nothing new to tag.");
    await parseAndSend();
  } catch (e) {
    post({ type: "model-ready", model: null, error: (e as Error).message });
  }
}

// Faithful transpile: recreate every SELECTED frame as native zones (one Tableau
// dashboard each), rasterizing icons/vectors. Best-effort images must not block
// the models.
async function sendFaithful(): Promise<void> {
  try {
    // dynamic-page docs: make sure every page (and its nodes' prototype reactions
    // + the frames those navigate to) is loaded before we read interactions.
    try {
      await figma.loadAllPagesAsync();
    } catch {
      /* older API / single-page docs — reactions on the current page still read */
    }
    // Pull in any Nav/ interaction destinations the user didn't select (so the
    // navigation has a real worksheet/dashboard to land on), THEN rasterize.
    let models = parseFaithfulAll();
    try {
      models = await expandNavTargets(models);
    } catch {
      /* nav expansion is best-effort — a failure just leaves buttons unlinked */
    }
    for (const m of models) {
      try {
        await attachFaithfulImages(m);
      } catch {
        /* some images just won't render */
      }
    }
    post({ type: "faithful-ready", models });
  } catch (e) {
    post({ type: "faithful-ready", models: null, error: (e as Error).message });
  }
}

/** The dashboard frame in play: the selection resolved up to its outermost
 * frame, else the first frame on the page, else null. */
function findDashboardFrame(): SceneNode | null {
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

// Preloaded label font, so the drop handler can create text SYNCHRONOUSLY (a
// drop callback shouldn't await — the gesture context can be lost). Populated at
// startup by loadLabelFont(); until then drop-created frames just omit their
// caption text (harmless — the layer NAME still carries the Tableau mapping).
let preloadedLabelFont: FontName | null = null;

/** Best-effort: load a usable font for the placeholder labels. */
async function loadLabelFont(): Promise<FontName | null> {
  for (const f of [
    { family: "Inter", style: "Regular" },
    { family: "Roboto", style: "Regular" },
    { family: "Arial", style: "Regular" },
  ]) {
    try {
      await figma.loadFontAsync(f);
      preloadedLabelFont = f;
      return f;
    } catch {
      /* try next */
    }
  }
  return null;
}

// Warm the font cache at startup so drag-and-drop can build labelled frames
// synchronously (see preloadedLabelFont).
void loadLabelFont();

/**
 * Create one `SHEET/<name>` placeholder frame per chosen imported worksheet,
 * placed INSIDE the dashboard frame in a tidy grid BELOW the existing content
 * (the frame is grown taller to fit). Inside-the-frame is what makes them export:
 * they're children of the dashboard, so the faithful walk picks them up and each
 * swaps in its real imported sheet. Below the content means they never overlap
 * the design — the user drags each up into place (or leaves it; it still exports).
 * The dashboard frame stays SELECTED so the very next export includes them.
 * Skips any `SHEET/<name>` already present so re-clicking is safe. With no
 * dashboard frame we fall back to dropping them on the page.
 */
async function addSheets(names: string[]): Promise<void> {
  const frame = findDashboardFrame();
  // Host = the dashboard frame itself (so the sheets are its children and export);
  // only fall back to the page when there's no frame at all.
  const host: BaseNode & ChildrenMixin =
    frame && "appendChild" in frame ? (frame as unknown as BaseNode & ChildrenMixin) : figma.currentPage;
  const inFrame = host === (frame as unknown);

  // Skip names already present among the host's direct SHEET/ children.
  const existing = new Set(
    ("children" in host ? host.children : [])
      .map((c) => c.name)
      .filter((n) => /^\s*sheet\s*\//i.test(n))
      .map((n) => n.replace(/^\s*sheet\s*\/\s*/i, "").trim().toLowerCase())
  );
  const todo = names.filter((n) => !existing.has(n.trim().toLowerCase()));
  if (todo.length === 0) {
    figma.notify("Those sheets are already on your dashboard.");
    return;
  }

  const font = await loadLabelFont();
  const SW = 360, SH = 240, GAP = 24, COLS = 2;
  // Inside the frame: a grid starting just below the current content (frame-
  // relative coords). On the page fallback: just right of the frame.
  const baseX = inFrame ? GAP : frame ? frame.x + frame.width + 80 : 0;
  const baseY = inFrame ? (frame ? frame.height + GAP : GAP) : frame ? frame.y : 0;
  const created: SceneNode[] = [];
  todo.forEach((name, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const f = figma.createFrame();
    f.name = `SHEET/${name}`;
    f.resize(SW, SH);
    f.x = baseX + col * (SW + GAP);
    f.y = baseY + row * (SH + GAP);
    f.cornerRadius = 10;
    f.fills = [{ type: "SOLID", color: { r: 0.93, g: 0.94, b: 0.98 } }];
    f.strokes = [{ type: "SOLID", color: { r: 0.78, g: 0.8, b: 0.9 } }];
    f.strokeWeight = 1;
    if (font) {
      const t = figma.createText();
      t.fontName = font;
      t.characters = name;
      t.fontSize = 16;
      t.fills = [{ type: "SOLID", color: { r: 0.25, g: 0.28, b: 0.42 } }];
      f.appendChild(t);
      t.x = 16;
      t.y = 16;
    }
    host.appendChild(f);
    created.push(f);
  });

  // Grow the dashboard frame so the new grid sits fully inside it (no overlap).
  if (inFrame && frame && created.length && "resize" in frame) {
    const rows = Math.ceil(todo.length / COLS);
    const neededH = baseY + rows * (SH + GAP);
    if (neededH > frame.height) (frame as FrameNode).resize(frame.width, Math.ceil(neededH));
  }

  if (created.length) {
    // Select the DASHBOARD (not the cards) so the next export targets it with the
    // sheets included; zoom to the new cards so the user can find/reposition them.
    figma.currentPage.selection = frame ? [frame] : created;
    figma.viewport.scrollAndZoomIntoView(created);
  }
  const where = inFrame ? "onto your dashboard (below the design)" : "beside your dashboard";
  figma.notify(`Added ${created.length} sheet(s) ${where} — reposition them, then export. They'll swap in their real data.`);
}

/** Component library: 15 pre-built components with proper naming conventions. */
const LIBRARY_COMPONENTS: Record<string, { name: string; w: number; h: number; fill: RGB; caption?: string; capColor?: RGB; stroke?: boolean; radius?: number; fontSize?: number }> = {
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
const TEXT_CARD_IDS = new Set(["text-box"]);

/**
 * Lay a text-primary card out as a hug-height vertical Auto-Layout frame and drop
 * a caption inside that fills the card width and wraps. This fixes the KPI/text
 * clipping bug: a plain fixed-size frame clips content, so a caption taller than
 * the frame (multi-line) or wider than it got cut off top/bottom and left/right.
 * Here the caption stretches to the card width (wraps instead of clipping in X)
 * and the card hugs its height to fit every line (no clipping in Y). Stays
 * responsive — narrowing the card re-wraps the text and re-flows the height. */
function fillCaption(
  frame: FrameNode,
  font: FontName,
  caption: string,
  fontSize: number,
  color: RGB,
  padX = 14,
  padY = 12,
): void {
  frame.layoutMode            = "VERTICAL";
  frame.counterAxisSizingMode = "FIXED"; // keep the card's width…
  frame.primaryAxisSizingMode = "AUTO";  // …but hug its height to the text
  frame.primaryAxisAlignItems = "CENTER";
  frame.paddingLeft = frame.paddingRight = padX;
  frame.paddingTop  = frame.paddingBottom = padY;
  frame.itemSpacing = 2;

  const txt = figma.createText();
  txt.fontName   = font;
  txt.characters = caption;
  txt.fontSize   = fontSize;
  txt.fills      = [{ type: "SOLID", color }];
  // Order matters: switch OFF width-auto-resize BEFORE appending/stretching.
  // While a text is WIDTH_AND_HEIGHT it sizes to its own content and Figma
  // ignores layoutAlign="STRETCH", so it would keep clipping horizontally.
  txt.textAutoResize = "HEIGHT";  // wrap and grow in height, never clip
  frame.appendChild(txt);
  txt.layoutAlign    = "STRETCH"; // fill the card width so long text wraps
}

/** Default KPI card rows: heading / value / change, per KPI size. Rendered as ONE
 * text layer with a styled line per row (see `fillKpiRows`) so the user can just
 * edit/delete lines to get a 2- or 1-row KPI, and it can never clip or overlap on
 * export (a single Tableau text zone lays the lines out with correct spacing). */
const KPI_ROWS: Record<string, Array<{ text: string; size: number; color: RGB }>> = {
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
 * Fill a KPI card with a heading / value / change stack, as ONE text layer whose
 * three lines each carry their own size + color, inside a hug-height vertical
 * Auto-Layout. One layer (not three) is deliberate: a single Tableau text zone
 * lays the lines out with correct spacing, so it can never clip a descender or
 * overlap a sibling zone on export (three separate zones could). It's still fully
 * flexible — the user edits the text and can delete the heading or change line to
 * drop to a 2- or 1-row KPI; the card re-hugs its height automatically. */
function fillKpiRows(
  frame: FrameNode,
  font: FontName,
  rows: Array<{ text: string; size: number; color: RGB }>,
): void {
  frame.layoutMode            = "VERTICAL";
  frame.counterAxisSizingMode = "FIXED"; // keep the card's width…
  frame.primaryAxisSizingMode = "AUTO";  // …but hug its height to the rows
  frame.primaryAxisAlignItems = "CENTER";
  frame.paddingLeft = frame.paddingRight = 14;
  frame.paddingTop  = frame.paddingBottom = 12;
  frame.itemSpacing = 2;

  const txt = figma.createText();
  txt.fontName   = font;
  txt.characters = rows.map((r) => r.text).join("\n");
  txt.fontSize   = rows[0].size;
  txt.fills      = [{ type: "SOLID", color: rows[0].color }];
  // Give each line its own size + color (same loaded font family/style, so no
  // extra font load is needed). Skip the '\n' between lines.
  let pos = 0;
  for (const r of rows) {
    const end = pos + r.text.length;
    if (end > pos) {
      txt.setRangeFontSize(pos, end, r.size);
      txt.setRangeFills(pos, end, [{ type: "SOLID", color: r.color }]);
    }
    pos = end + 1;
  }
  txt.textAutoResize = "HEIGHT";          // set BEFORE stretch (see fillCaption)
  frame.appendChild(txt);
  txt.layoutAlign    = "STRETCH";         // fill card width, wrap, never clip
}

/** Build (but don't place) a library-component frame. Shared by click-insert and
 * drag-and-drop so both produce an identical, correctly-named layer. */
function buildLibraryFrame(componentId: string, font: FontName | null): FrameNode | null {
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
    // KPI card: default heading / value / change rows (user can delete rows).
    fillKpiRows(f, font, KPI_ROWS[componentId]);
  } else if (font && t.caption) {
    const fontSize = t.fontSize ?? 14;
    const color = t.capColor ?? { r: 0.25, g: 0.28, b: 0.42 };
    if (TEXT_CARD_IDS.has(componentId)) {
      // Text Box: hug-height Auto-Layout so the caption never clips.
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

async function insertLibraryComponent(componentId: string): Promise<void> {
  const frame = findDashboardFrame();
  const parent: BaseNode & ChildrenMixin =
    frame && frame.parent && "appendChild" in frame.parent
      ? (frame.parent as BaseNode & ChildrenMixin)
      : figma.currentPage;
  const originX = frame ? frame.x + frame.width + 80 : 0;
  const originY = frame ? frame.y : 0;
  const font = await loadLabelFont();

  const t = LIBRARY_COMPONENTS[componentId];
  if (!t) return;
  const f = buildLibraryFrame(componentId, font);
  if (!f) return;

  f.x = originX + (Object.keys(LIBRARY_COMPONENTS).indexOf(componentId) % 3) * (t.w + 24);
  f.y = originY + Math.floor(Object.keys(LIBRARY_COMPONENTS).indexOf(componentId) / 3) * (t.h + 24);
  parent.appendChild(f);
  figma.currentPage.selection = [f];
  figma.viewport.scrollAndZoomIntoView([f]);
  figma.notify(`Inserted ${t.name} beside your dashboard`);
}

/** Dashboard templates: create a full dashboard layout with multiple components. */
const TEMPLATES: Record<string, { name: string; w: number; h: number; children: { name: string; w: number; h: number; x: number; y: number; fill: RGB; caption?: string; capColor?: RGB; radius?: number; fontSize?: number }[] }> = {
  "clinical": {
    name: "Clinical Dashboard",
    w: 1200, h: 800,
    children: [
      { name: "KPI/Patients", w: 240, h: 90, x: 20, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "1,284", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "KPI/Readmissions", w: 240, h: 90, x: 280, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "3.2%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "KPI/Avg Stay", w: 240, h: 90, x: 540, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "4.7d", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "KPI/Bed Occupancy", w: 240, h: 90, x: 800, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "87%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "SHEET/Admissions Trend[line]", w: 560, h: 300, x: 20, y: 130, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Admissions Trend", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Department Breakdown[bar]", w: 380, h: 300, x: 600, y: 130, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Dept Breakdown", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Patient Demographics[pie]", w: 380, h: 280, x: 20, y: 450, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Demographics", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Readmission Rate[scatter]", w: 380, h: 280, x: 420, y: 450, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Readmission Rate", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "FILTER/Department", w: 200, h: 40, x: 860, y: 450, fill: { r: 1, g: 1, b: 1 }, caption: "Department \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "FILTER/Date Range", w: 200, h: 40, x: 860, y: 510, fill: { r: 1, g: 1, b: 1 }, caption: "Date \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "TEXT/Clinical Dashboard", w: 400, h: 32, x: 20, y: 750, fill: { r: 1, g: 1, b: 1 }, caption: "Clinical Performance Dashboard", capColor: { r: 0.06, g: 0.09, b: 0.15 }, fontSize: 11 },
    ],
  },
  "sales": {
    name: "Sales Dashboard",
    w: 1200, h: 800,
    children: [
      { name: "KPI/Revenue", w: 240, h: 90, x: 20, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "$2.4M", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "KPI/Growth", w: 240, h: 90, x: 280, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "+12.5%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "KPI/Orders", w: 240, h: 90, x: 540, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "8,432", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "KPI/Conversion", w: 240, h: 90, x: 800, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "3.8%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 28 },
      { name: "SHEET/Sales Trend[line]", w: 760, h: 300, x: 20, y: 130, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Sales Trend", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Sales by Region[bar]", w: 400, h: 300, x: 800, y: 130, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "By Region", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Product Mix[pie]", w: 380, h: 280, x: 20, y: 460, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Product Mix", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Forecast[area]", w: 380, h: 280, x: 420, y: 460, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Forecast", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "FILTER/Region", w: 200, h: 40, x: 860, y: 460, fill: { r: 1, g: 1, b: 1 }, caption: "Region \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "FILTER/Product", w: 200, h: 40, x: 860, y: 520, fill: { r: 1, g: 1, b: 1 }, caption: "Product \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "TEXT/Sales Dashboard", w: 400, h: 32, x: 20, y: 760, fill: { r: 1, g: 1, b: 1 }, caption: "Sales Performance Dashboard", capColor: { r: 0.06, g: 0.09, b: 0.15 }, fontSize: 11 },
    ],
  },
  "finance": {
    name: "Finance Dashboard",
    w: 1200, h: 800,
    children: [
      { name: "KPI/Revenue", w: 200, h: 80, x: 20, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "$8.2M", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/Expenses", w: 200, h: 80, x: 240, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "$5.1M", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/Net Income", w: 200, h: 80, x: 460, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "$3.1M", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/Margin", w: 200, h: 80, x: 680, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "37.8%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/Cash Flow", w: 200, h: 80, x: 900, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "$1.2M", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "SHEET/P&L Trend[line]", w: 580, h: 300, x: 20, y: 120, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "P&L Trend", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Category Breakdown[bar]", w: 580, h: 300, x: 620, y: 120, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Category Breakdown", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Budget vs Actual[bar]", w: 380, h: 260, x: 20, y: 440, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Budget vs Actual", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Expenses by Dept[pie]", w: 380, h: 260, x: 420, y: 440, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Expenses by Dept", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "FILTER/Period", w: 200, h: 40, x: 860, y: 440, fill: { r: 1, g: 1, b: 1 }, caption: "Period \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "FILTER/Department", w: 200, h: 40, x: 860, y: 500, fill: { r: 1, g: 1, b: 1 }, caption: "Department \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "TEXT/Finance Dashboard", w: 400, h: 32, x: 20, y: 730, fill: { r: 1, g: 1, b: 1 }, caption: "Financial Overview Dashboard", capColor: { r: 0.06, g: 0.09, b: 0.15 }, fontSize: 11 },
    ],
  },
  "executive": {
    name: "Executive Dashboard",
    w: 1200, h: 800,
    children: [
      { name: "KPI/Total Revenue", w: 260, h: 100, x: 20, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "$24.8M", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 30 },
      { name: "KPI/YoY Growth", w: 260, h: 100, x: 310, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "+18.3%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 30 },
      { name: "KPI/Active Users", w: 260, h: 100, x: 600, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "42.5K", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 30 },
      { name: "KPI/NPS Score", w: 260, h: 100, x: 890, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "72", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 30 },
      { name: "SHEET/Revenue Trend[line]", w: 780, h: 280, x: 20, y: 140, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Revenue Trend", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Channel Performance[bar]", w: 380, h: 280, x: 820, y: 140, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "By Channel", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Regional Revenue[bar]", w: 380, h: 260, x: 20, y: 450, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "By Region", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Market Share[pie]", w: 380, h: 260, x: 420, y: 450, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Market Share", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Product Scorecard[table]", w: 380, h: 260, x: 820, y: 450, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Product Scorecard", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "TEXT/Executive Dashboard", w: 400, h: 32, x: 20, y: 740, fill: { r: 1, g: 1, b: 1 }, caption: "Executive Overview Dashboard", capColor: { r: 0.06, g: 0.09, b: 0.15 }, fontSize: 11 },
    ],
  },
  "operations": {
    name: "Operations Dashboard",
    w: 1200, h: 800,
    children: [
      { name: "KPI/Efficiency", w: 220, h: 80, x: 20, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "94.2%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/Downtime", w: 220, h: 80, x: 260, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "2.1h", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/Throughput", w: 220, h: 80, x: 500, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "1,842", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/Quality Score", w: 220, h: 80, x: 740, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "98.5%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "KPI/On-Time Rate", w: 220, h: 80, x: 980, y: 20, fill: { r: 0.95, g: 0.96, b: 1.0 }, caption: "96%", capColor: { r: 0.1, g: 0.12, b: 0.2 }, fontSize: 26 },
      { name: "SHEET/Production Trend[line]", w: 580, h: 280, x: 20, y: 120, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Production Trend", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Downtime by Cause[bar]", w: 580, h: 280, x: 620, y: 120, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Downtime Causes", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Quality Metrics[heatmap]", w: 380, h: 260, x: 20, y: 420, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Quality Metrics", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "SHEET/Bottleneck Analysis[scatter]", w: 380, h: 260, x: 420, y: 420, fill: { r: 0.93, g: 0.94, b: 0.98 }, caption: "Bottleneck Analysis", capColor: { r: 0.25, g: 0.28, b: 0.42 } },
      { name: "FILTER/Department", w: 200, h: 40, x: 860, y: 420, fill: { r: 1, g: 1, b: 1 }, caption: "Department \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "FILTER/Shift", w: 200, h: 40, x: 860, y: 480, fill: { r: 1, g: 1, b: 1 }, caption: "Shift \u25BE", capColor: { r: 0.25, g: 0.28, b: 0.42 }, radius: 8 },
      { name: "TEXT/Operations Dashboard", w: 400, h: 32, x: 20, y: 720, fill: { r: 1, g: 1, b: 1 }, caption: "Operations Performance Dashboard", capColor: { r: 0.06, g: 0.09, b: 0.15 }, fontSize: 11 },
    ],
  },
};

async function applyTemplate(templateId: string): Promise<void> {
  const font = await loadLabelFont();
  const t = TEMPLATES[templateId];
  if (!t) return;

  const frame = findDashboardFrame();
  const parent: BaseNode & ChildrenMixin =
    frame && frame.parent && "appendChild" in frame.parent
      ? (frame.parent as BaseNode & ChildrenMixin)
      : figma.currentPage;
  const originX = frame ? frame.x + frame.width + 80 : 0;
  const pageH = (figma.currentPage as any).height || 1200;
  const originY = frame ? frame.y : Math.max(0, (pageH - t.h) / 2);

  const dash = figma.createFrame();
  dash.name = t.name;
  dash.resize(t.w, t.h);
  dash.x = originX;
  dash.y = originY;
  dash.cornerRadius = 10;
  dash.fills = [{ type: "SOLID", color: { r: 0.07, g: 0.075, b: 0.085 } }];

  for (const c of t.children) {
    const child = figma.createFrame();
    child.name = c.name;
    child.resize(c.w, c.h);
    child.x = c.x;
    child.y = c.y;
    child.cornerRadius = c.radius ?? 10;
    child.fills = [{ type: "SOLID", color: c.fill }];
    if (c.name.startsWith("SHEET/") || c.name.startsWith("URL/") || c.name.startsWith("Image/") || c.name.startsWith("FILTER/")) {
      child.strokes = [{ type: "SOLID", color: { r: 0.78, g: 0.8, b: 0.9 } }];
      child.strokeWeight = 1;
    }
    if (font && c.caption) {
      const fontSize = c.fontSize ?? 14;
      const color = c.capColor ?? { r: 0.25, g: 0.28, b: 0.42 };
      if (c.name.startsWith("KPI/") || c.name.startsWith("TEXT/")) {
        // KPI / Text zones: hug-height Auto-Layout so the caption never clips.
        fillCaption(child, font, c.caption, fontSize, color, 10, 10);
      } else {
        const txt = figma.createText();
        txt.fontName = font;
        txt.characters = c.caption;
        txt.fontSize = fontSize;
        txt.fills = [{ type: "SOLID", color }];
        child.appendChild(txt);
        txt.x = 10;
        txt.y = Math.max(6, (c.h - txt.height) / 2);
      }
    }
    dash.appendChild(child);
  }

  parent.appendChild(dash);
  figma.currentPage.selection = [dash];
  figma.viewport.scrollAndZoomIntoView([dash]);
  figma.notify(`Created "${t.name}" template with ${t.children.length} components.`);
}

/**
 * Insert ONE ready-made, correctly-named starter component (the Defaults tab):
 * a `SHEET/`, `KPI/`, `Nav/`, `BUTTON/`, `FILTER/`, `Image/`, `URL/` or `TEXT/`
 * layer, placed in empty space beside the dashboard frame so it never overlaps
 * the design. The user then drags it onto their dashboard (and, for Nav/, wires a
 * prototype "Navigate to" connection in Figma). Selected + zoomed for discovery.
 */
// Per-kind Defaults template: layer name (carries the LaDataViz prefix), size,
// look and the caption text drawn inside (so it reads like a real component in
// Figma). Shared by click-insert and drag-and-drop.
const DEFAULT_COMPONENTS: Record<string, { name: string; w: number; h: number; fill: RGB; caption?: string; capColor?: RGB }> = {
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
function buildDefaultFrame(kind: string, font: FontName | null): FrameNode | null {
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
      // KPI / Text: hug-height Auto-Layout so the caption never clips.
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

async function insertDefault(kind: string): Promise<void> {
  const frame = findDashboardFrame();
  const parent: BaseNode & ChildrenMixin =
    frame && frame.parent && "appendChild" in frame.parent
      ? (frame.parent as BaseNode & ChildrenMixin)
      : figma.currentPage;
  const originX = frame ? frame.x + frame.width + 80 : 0;
  const originY = frame ? frame.y : 0;
  const font = await loadLabelFont();

  const f = buildDefaultFrame(kind, font);
  if (!f) return;
  f.x = originX;
  f.y = originY;
  parent.appendChild(f);
  figma.currentPage.selection = [f];
  figma.viewport.scrollAndZoomIntoView([f]);
  const hint = kind === "nav" ? " — now wire a prototype “Navigate to” link from it in Figma." : "";
  figma.notify(`Inserted ${f.name} beside your dashboard — drag it onto your design${hint}`);
}

/** Nearest frame-like ancestor of `node` (inclusive) we can appendChild into, so
 * a dropped component becomes a CHILD of the dashboard (and thus exports). */
function frameLikeContainer(node: BaseNode | null): (BaseNode & ChildrenMixin) | null {
  const isFrameLike = (n: BaseNode) =>
    n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE" || n.type === "COMPONENT_SET";
  let p: BaseNode | null = node;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    if (isFrameLike(p) && "appendChild" in p) return p as BaseNode & ChildrenMixin;
    p = p.parent;
  }
  return null;
}

/**
 * Drag-and-drop from the plugin UI onto the canvas. The Library / Defaults cards
 * set a `text/plain` dataTransfer payload ({ ftDrop, source, id }); Figma fires
 * this `drop` event with that payload + the canvas position. We build the same
 * frame the click-insert would and drop it AT the cursor — inside the dashboard
 * frame under the cursor (so it exports) or free on the page otherwise.
 */
function handleDrop(event: DropEvent): void {
  const item = event.items.find((i) => i.type === "text/plain");
  if (!item) return;
  let payload: { ftDrop?: boolean; source?: string; id?: string };
  try {
    payload = JSON.parse(item.data);
  } catch {
    return;
  }
  if (!payload || !payload.ftDrop || !payload.id) return;

  const font = preloadedLabelFont;
  const f =
    payload.source === "library"
      ? buildLibraryFrame(payload.id, font)
      : buildDefaultFrame(payload.id, font);
  if (!f) return;

  // Drop INTO the frame-like container under the cursor so it's a dashboard child
  // (converting the PAGE-space drop point — absoluteX/absoluteY — to that frame's
  // local coordinates via its absolute transform); else drop free on the page.
  const container = frameLikeContainer(event.node);
  if (container) {
    container.appendChild(f);
    const at = (container as unknown as { absoluteTransform: Transform }).absoluteTransform;
    f.x = Math.round(event.absoluteX - at[0][2]);
    f.y = Math.round(event.absoluteY - at[1][2]);
  } else {
    figma.currentPage.appendChild(f);
    f.x = Math.round(event.absoluteX);
    f.y = Math.round(event.absoluteY);
  }
  figma.currentPage.selection = [f];
  figma.notify(`Added ${f.name}`);
}

/**
 * Fix a clipped card the user already placed or hand-built (the "Fix selected
 * card" button). Same idea as `fillCaption` but applied to an existing frame:
 * make every text line wrap to the card width and let the card grow in height so
 * nothing clips. If the card is just a vertical stack of text lines (the usual
 * KPI / text-box case) we convert it to a hug-height vertical Auto-Layout so it
 * also stays responsive; a mixed card (icons, shapes) is un-clipped + wrapped +
 * grown in place so we don't reflow the user's design. Returns true if changed.
 */
function fixCardClipping(frame: FrameNode, texts: TextNode[]): boolean {
  const kids = frame.children;
  const INSET = 12;

  if (kids.every((c) => c.type === "TEXT")) {
    // Preserve the card's current inset and top→bottom reading order, then lay
    // it out as a hug-height Auto-Layout with each line stretched (wraps to fill
    // the width; the card grows to fit every line).
    const minX = Math.max(0, Math.min(...kids.map((c) => c.x)));
    const minY = Math.max(0, Math.min(...kids.map((c) => c.y)));
    const ordered = [...kids].sort((a, b) => a.y - b.y);
    for (const t of texts) t.textAutoResize = "HEIGHT";
    frame.layoutMode            = "VERTICAL";
    frame.counterAxisSizingMode = "FIXED";
    frame.primaryAxisSizingMode = "AUTO";
    frame.primaryAxisAlignItems = "CENTER";
    frame.paddingLeft = frame.paddingRight = minX || INSET;
    frame.paddingTop  = frame.paddingBottom = minY || INSET;
    frame.itemSpacing = 2;
    frame.clipsContent = false;
    for (const c of ordered) frame.appendChild(c);      // restack top→bottom
    for (const t of texts) t.layoutAlign = "STRETCH";   // fill width, wrap
    return true;
  }

  // Mixed content: don't reflow. Just stop clipping, wrap each text to the space
  // left of the card's right edge, and grow the card so the lowest child fits.
  frame.clipsContent = false;
  for (const t of texts) {
    t.textAutoResize = "HEIGHT";
    const avail = Math.max(24, frame.width - t.x - INSET);
    t.resize(avail, t.height);
  }
  let bottom = 0;
  for (const c of frame.children) bottom = Math.max(bottom, c.y + c.height);
  if (bottom + INSET > frame.height) frame.resize(frame.width, Math.ceil(bottom + INSET));
  return true;
}

/** Un-clip the text on the currently selected card(s). */
async function fixSelectedClipping(): Promise<void> {
  const sel = figma.currentPage.selection;
  if (!sel.length) {
    figma.notify("Select a card (a frame) on the canvas first, then click Fix.");
    return;
  }
  let fixed = 0;
  for (const node of sel) {
    if (node.type !== "FRAME" && node.type !== "COMPONENT") continue;
    const frame = node as FrameNode;
    const texts = frame.children.filter((c): c is TextNode => c.type === "TEXT");
    if (!texts.length) continue;
    // Editing a text's layout needs its font(s) loaded (covers mixed formatting).
    for (const t of texts) {
      const len = Math.max(1, t.characters.length);
      const fonts = t.getRangeAllFontNames(0, len);
      await Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
    }
    if (fixCardClipping(frame, texts)) fixed++;
  }
  figma.notify(
    fixed
      ? `Fixed text clipping on ${fixed} card(s) — text now wraps and the card grows to fit.`
      : "No frame with text was selected. Select the card frame (not the text) and try again."
  );
}

// Re-parse whenever the user changes their selection.
figma.on("selectionchange", () => void parseAndSend());

// Place a component dragged from the UI Library / Defaults cards onto the canvas.
// Returning false tells Figma we've handled the drop (no default behaviour).
figma.on("drop", (event: DropEvent) => {
  try {
    handleDrop(event);
  } catch (e) {
    figma.notify(`Couldn't drop component: ${(e as Error).message}`);
  }
  return false;
});

figma.ui.onmessage = (msg: UiToPlugin) => {
  switch (msg.type) {
    case "request-parse":
      void parseAndSend();
      void restoreImport();
      break;
    case "apply-tags":
      void applyTagsAndResend();
      break;
    case "request-faithful":
      void sendFaithful();
      break;
    case "add-sheets":
      void addSheets(msg.names);
      break;
    case "insert-default":
      void insertDefault(msg.kind);
      break;
    case "save-import":
      // Best-effort persistence: a large import (e.g. a .hyper extract) can
      // exceed the clientStorage quota — swallow the rejection so it doesn't
      // surface as an unhandled error; the user just re-uploads next session.
      figma.clientStorage.setAsync("ft-import", msg.data).catch(() => {});
      break;
    case "resize":
      figma.ui.resize(Math.max(360, msg.width), Math.max(420, msg.height));
      break;
    case "notify":
      figma.notify(msg.message);
      break;
    case "insert-library-component":
      void insertLibraryComponent(msg.componentId);
      break;
    case "apply-template":
      void applyTemplate(msg.templateId);
      break;
    case "fix-clipping":
      void fixSelectedClipping();
      break;
  }
};

// Initial parse on launch + restore persisted import data from prior session.
void parseAndSend();
void restoreImport();
