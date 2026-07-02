// ---------------------------------------------------------------------------
// code.ts — the Figma plugin main thread (sandbox). Has the `figma` global,
// no DOM. Opens the UI, parses the selection into a DashboardModel, and posts
// it to the UI. All Tableau generation / zipping / downloading happens in the
// UI iframe (which has Blob + JSZip + FileSaver).
// ---------------------------------------------------------------------------

import { parseSelection, attachImages, applyAutoTags } from "./parser";
import { parseFaithfulAll, attachFaithfulImages, expandNavTargets, collectFrames } from "./faithful";
import type { UiToPlugin, PluginToUi } from "../shared/types";
import { UI_SIZE, DOMAIN_ACCENTS } from "../shared/constants";

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
    // Every selected frame becomes its own Tableau dashboard on export — tell
    // the UI their names so the Selection card can reflect the real export scope.
    let frameNames: string[] | undefined;
    try {
      frameNames = collectFrames().map((f) => f.name || "Frame");
    } catch {
      /* selection card just falls back to the parsed model's title */
    }
    post({ type: "model-ready", model, frameNames });
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

/** Dashboard templates: create a full dashboard layout with multiple components.
 * Each template has a DISTINCT layout (sidebar / hero+rail / two-column / hero+
 * scorecard / monitoring grid) and a domain-appropriate set of charts + KPIs, so
 * applying one gives a purpose-built starting point \u2014 not the same grid recolored. */
interface TChild {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: RGB;
  caption?: string;
  capColor?: RGB;
  radius?: number;
  fontSize?: number;
  label?: string; // KPI small heading above the value
  delta?: string; // KPI change line below the value
  deltaColor?: RGB;
}

// Shared template palette (light cards on a dark canvas).
const T_KPI: RGB = { r: 0.95, g: 0.96, b: 1.0 };
const T_SH: RGB = { r: 0.93, g: 0.94, b: 0.98 };
const T_FIL: RGB = { r: 1, g: 1, b: 1 };
const T_SHCAP: RGB = { r: 0.25, g: 0.28, b: 0.42 };
const T_VAL: RGB = { r: 0.1, g: 0.12, b: 0.2 };
const T_UP: RGB = { r: 0.13, g: 0.6, b: 0.35 }; // positive / good change
const T_DOWN: RGB = { r: 0.86, g: 0.15, b: 0.15 }; // negative / bad change
const T_BG: RGB = { r: 0.07, g: 0.075, b: 0.085 };
const T_TITLE: RGB = { r: 0.92, g: 0.93, b: 0.97 };

// Concise child builders so each template reads as a layout, not a wall of RGB.
const tTitle = (name: string, x: number, y: number, w: number, caption: string): TChild =>
  ({ name, x, y, w, h: 30, fill: T_BG, caption, capColor: T_TITLE, fontSize: 16 });
const tKpi = (
  name: string, x: number, y: number, w: number, h: number,
  value: string, label: string, delta?: string, deltaColor: RGB = T_UP,
): TChild => ({ name, x, y, w, h, fill: T_KPI, caption: value, capColor: T_VAL, fontSize: h >= 96 ? 30 : 26, label, delta, deltaColor });
const tSheet = (name: string, x: number, y: number, w: number, h: number, caption: string): TChild =>
  ({ name, x, y, w, h, fill: T_SH, caption, capColor: T_SHCAP });
const tFilter = (name: string, x: number, y: number, w: number, h: number, caption: string): TChild =>
  ({ name, x, y, w, h, fill: T_FIL, caption, capColor: T_SHCAP, radius: 8 });

// Per-template palette is DERIVED from the domain accent at apply time (see
// applyTemplate): a dark accent-hued canvas plus accent-TINTED cards and
// strokes, so each template reads unmistakably as its own domain \u2014 not the
// same lavender cards recolored. Tints stay far below the exporter's
// vividness threshold (dominantChartColor skips fills with saturation < 0.18),
// so the accent-colored captions remain the sampled chart mark color.
const WHITE: RGB = { r: 1, g: 1, b: 1 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };
/** Blend `f` of color `c` into `base` (f=0 \u2192 base, f=1 \u2192 c). */
const mix = (c: RGB, base: RGB, f: number): RGB => ({
  r: c.r * f + base.r * (1 - f),
  g: c.g * f + base.g * (1 - f),
  b: c.b * f + base.b * (1 - f),
});

const TEMPLATES: Record<string, { name: string; w: number; h: number; bg?: RGB; children: TChild[] }> = {
  // \u2500\u2500 Clinical \u2014 LEFT SIDEBAR: KPI/filter rail on the left, charts fill the right.
  "clinical": {
    name: "Clinical Dashboard",
    w: 1300, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 520, "Clinical Performance Dashboard"),
      tKpi("KPI/Total Patients", 24, 64, 250, 100, "1,284", "Total Patients", "+4.2% MoM"),
      tKpi("KPI/Readmission Rate", 24, 176, 250, 100, "3.2%", "Readmission Rate", "-0.6% MoM"),
      tKpi("KPI/Avg Length of Stay", 24, 288, 250, 100, "4.7 d", "Avg Length of Stay", "-0.3 d"),
      tKpi("KPI/Bed Occupancy", 24, 400, 250, 100, "87%", "Bed Occupancy", "+2 pts"),
      tFilter("FILTER/Department", 24, 512, 250, 44, "Department \u25BE"),
      tFilter("FILTER/Month", 24, 568, 250, 44, "Month \u25BE"),
      tSheet("SHEET/Admissions Trend[line]", 298, 64, 978, 280, "Admissions Trend"),
      tSheet("SHEET/Admissions by Department[bar]", 298, 360, 478, 200, "Admissions by Department"),
      tSheet("SHEET/Patient Mix[pie]", 792, 360, 484, 200, "Patient Mix"),
      tSheet("SHEET/Readmissions vs Admissions[scatter]", 298, 576, 978, 224, "Readmissions vs Admissions"),
    ],
  },
  // \u2500\u2500 Sales \u2014 HERO + RAIL: big trend hero with a region rail, then a 3-up row.
  "sales": {
    name: "Sales Dashboard",
    w: 1280, h: 800,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Sales Performance Dashboard"),
      tFilter("FILTER/Region", 944, 22, 150, 36, "Region \u25BE"),
      tFilter("FILTER/Month", 1106, 22, 150, 36, "Month \u25BE"),
      tKpi("KPI/Revenue", 24, 74, 290, 90, "$2.4M", "Revenue", "+12.5% YoY"),
      tKpi("KPI/Growth", 330, 74, 290, 90, "+12.5%", "Growth", "vs last year"),
      tKpi("KPI/Orders", 636, 74, 290, 90, "8,432", "Orders", "+6.1%"),
      tKpi("KPI/Conversion", 942, 74, 290, 90, "3.8%", "Conversion", "+0.4 pts"),
      tSheet("SHEET/Sales Trend[area]", 24, 176, 860, 320, "Sales Trend"),
      tSheet("SHEET/Sales by Region[bar]", 900, 176, 356, 320, "Sales by Region"),
      tSheet("SHEET/Product Mix[pie]", 24, 508, 396, 272, "Product Mix"),
      tSheet("SHEET/Orders by Region[bar]", 436, 508, 396, 272, "Orders by Region"),
      tSheet("SHEET/Revenue Forecast[area]", 848, 508, 408, 272, "Revenue Forecast"),
    ],
  },
  // \u2500\u2500 Finance \u2014 TWO BIG COLUMNS under a 5-KPI strip (P&L left, breakdown right).
  "finance": {
    name: "Finance Dashboard",
    w: 1260, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Financial Overview Dashboard"),
      tFilter("FILTER/Quarter", 980, 22, 130, 36, "Quarter \u25BE"),
      tFilter("FILTER/Category", 1122, 22, 114, 36, "Category \u25BE"),
      tKpi("KPI/Revenue", 24, 74, 232, 88, "$8.2M", "Revenue", "+9% YoY"),
      tKpi("KPI/Expenses", 268, 74, 232, 88, "$5.1M", "Expenses", "+4% YoY", T_DOWN),
      tKpi("KPI/Net Income", 512, 74, 232, 88, "$3.1M", "Net Income", "+18% YoY"),
      tKpi("KPI/Margin", 756, 74, 232, 88, "37.8%", "Margin", "+2.1 pts"),
      tKpi("KPI/Cash Flow", 1000, 74, 236, 88, "$1.2M", "Cash Flow", "+0.3M"),
      tSheet("SHEET/Revenue & Expense Trend[line]", 24, 174, 596, 330, "Revenue & Expense Trend"),
      tSheet("SHEET/Budget vs Actual[bar]", 24, 520, 596, 320, "Budget vs Actual"),
      tSheet("SHEET/Revenue by Category[bar]", 640, 174, 596, 330, "Revenue by Category"),
      tSheet("SHEET/Expense Breakdown[pie]", 640, 520, 596, 320, "Expense Breakdown"),
    ],
  },
  // \u2500\u2500 Executive \u2014 HERO TREND across the top, KPI row, then a 3-up scorecard.
  "executive": {
    name: "Executive Dashboard",
    w: 1280, h: 780,
    children: [
      tTitle("TEXT/Title", 24, 20, 420, "Executive Overview"),
      tSheet("SHEET/Revenue Trend[line]", 24, 60, 1232, 256, "Revenue Trend"),
      tKpi("KPI/Total Revenue", 24, 336, 296, 100, "$24.8M", "Total Revenue", "+18.3% YoY"),
      tKpi("KPI/YoY Growth", 332, 336, 296, 100, "+18.3%", "YoY Growth", "vs last year"),
      tKpi("KPI/Active Users", 640, 336, 296, 100, "42.5K", "Active Users", "+9.7%"),
      tKpi("KPI/NPS Score", 948, 336, 296, 100, "72", "NPS Score", "+5 pts"),
      tSheet("SHEET/Revenue by Channel[bar]", 24, 452, 396, 308, "Revenue by Channel"),
      tSheet("SHEET/Market Share[pie]", 436, 452, 396, 308, "Market Share"),
      tSheet("SHEET/Channel Scorecard[table]", 848, 452, 408, 308, "Channel Scorecard"),
    ],
  },
  // \u2500\u2500 Operations \u2014 MONITORING GRID: KPI strip + a 2-up and a 3-up chart grid.
  "operations": {
    name: "Operations Dashboard",
    w: 1320, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 420, "Operations Monitoring"),
      tFilter("FILTER/Department", 1050, 22, 128, 36, "Department \u25BE"),
      tFilter("FILTER/Week", 1190, 22, 106, 36, "Week \u25BE"),
      tKpi("KPI/Efficiency", 24, 74, 244, 88, "94.2%", "Efficiency", "+1.3%"),
      tKpi("KPI/Downtime", 280, 74, 244, 88, "2.1 h", "Downtime", "-0.4 h"),
      tKpi("KPI/Throughput", 536, 74, 244, 88, "1,842", "Throughput", "+3.5%"),
      tKpi("KPI/Quality Score", 792, 74, 244, 88, "98.5%", "Quality Score", "+0.2%"),
      tKpi("KPI/On-Time Rate", 1048, 74, 248, 88, "96%", "On-Time Rate", "+1 pt"),
      tSheet("SHEET/Production Trend[line]", 24, 174, 870, 300, "Production Trend"),
      tSheet("SHEET/Downtime by Cause[bar]", 910, 174, 386, 300, "Downtime by Cause"),
      tSheet("SHEET/Quality Metrics[heatmap]", 24, 490, 410, 340, "Quality Metrics"),
      tSheet("SHEET/Bottleneck Analysis[scatter]", 450, 490, 430, 340, "Bottleneck Analysis"),
      tSheet("SHEET/Output by Department[bar]", 896, 490, 400, 340, "Output by Department"),
    ],
  },
  // ── Marketing — FUNNEL TOWER: a tall conversion funnel fills the LEFT column,
  // a 2×2 performance grid on the right, KPI row on top.
  "marketing": {
    name: "Marketing Dashboard",
    w: 1300, h: 840,
    children: [
      tTitle("TEXT/Title", 24, 20, 480, "Marketing Campaign Performance"),
      tFilter("FILTER/Channel", 1000, 22, 130, 36, "Channel ▾"),
      tFilter("FILTER/Week", 1142, 22, 134, 36, "Week ▾"),
      tKpi("KPI/Leads", 24, 74, 296, 92, "18.2K", "Leads (MQLs)", "+14% WoW"),
      tKpi("KPI/CTR", 336, 74, 296, 92, "3.6%", "Click-Through", "+0.5 pts"),
      tKpi("KPI/CAC", 648, 74, 296, 92, "$42", "Cost per Lead", "-$6 WoW"),
      tKpi("KPI/ROAS", 960, 74, 296, 92, "4.8x", "Return on Ad Spend", "+0.4x"),
      tSheet("SHEET/Conversion Funnel[bar]", 24, 182, 420, 634, "Conversion Funnel"),
      tSheet("SHEET/Leads Trend[area]", 468, 182, 390, 302, "Leads Trend"),
      tSheet("SHEET/Leads by Channel[bar]", 874, 182, 402, 302, "Leads by Channel"),
      tSheet("SHEET/Channel Mix[pie]", 468, 500, 390, 316, "Channel Mix"),
      tSheet("SHEET/Conversions vs Leads[scatter]", 874, 500, 402, 316, "Conversions vs Leads"),
    ],
  },
  // ── HR — RIGHT SIDEBAR (the mirror of Clinical): charts fill the left, a rail
  // of people KPIs + filters runs down the right.
  "hr": {
    name: "HR Dashboard",
    w: 1300, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 520, "People & Workforce Analytics"),
      tSheet("SHEET/Headcount Trend[line]", 24, 64, 978, 280, "Headcount Trend"),
      tSheet("SHEET/Attrition by Department[bar]", 24, 360, 478, 200, "Attrition by Department"),
      tSheet("SHEET/Workforce Mix[pie]", 518, 360, 484, 200, "Workforce Mix"),
      tSheet("SHEET/Headcount by Department[bar]", 24, 576, 978, 224, "Headcount by Department"),
      tKpi("KPI/Headcount", 1026, 64, 250, 100, "1,204", "Headcount", "+38 MoM"),
      tKpi("KPI/Attrition", 1026, 176, 250, 100, "7.2%", "Attrition Rate", "-0.8% MoM"),
      tKpi("KPI/Time to Hire", 1026, 288, 250, 100, "28 d", "Time to Hire", "-3 d"),
      tKpi("KPI/eNPS", 1026, 400, 250, 100, "41", "Employee NPS", "+6 pts"),
      tFilter("FILTER/Department", 1026, 512, 250, 44, "Department ▾"),
      tFilter("FILTER/Month", 1026, 568, 250, 44, "Month ▾"),
    ],
  },
  // ── Supply Chain — STACKED BANDS: two full-width flow charts stacked (trend,
  // then on-time by warehouse), a 3-up detail row at the bottom.
  "supplychain": {
    name: "Supply Chain Dashboard",
    w: 1280, h: 880,
    children: [
      tTitle("TEXT/Title", 24, 20, 480, "Supply Chain & Logistics"),
      tFilter("FILTER/Warehouse", 1004, 22, 130, 36, "Warehouse ▾"),
      tFilter("FILTER/Week", 1146, 22, 110, 36, "Week ▾"),
      tKpi("KPI/Shipments", 24, 74, 296, 90, "42.1K", "Shipments", "+5.2% WoW"),
      tKpi("KPI/On-Time", 336, 74, 296, 90, "94.6%", "On-Time Delivery", "+1.1%"),
      tKpi("KPI/Backorders", 648, 74, 296, 90, "312", "Backorders", "-48 WoW"),
      tKpi("KPI/Inventory Turns", 960, 74, 296, 90, "8.4", "Inventory Turns", "+0.3"),
      tSheet("SHEET/Shipments Trend[line]", 24, 180, 1232, 250, "Shipments Trend"),
      tSheet("SHEET/On-Time by Warehouse[bar]", 24, 446, 1232, 200, "On-Time by Warehouse"),
      tSheet("SHEET/Shipments by Warehouse[bar]", 24, 662, 396, 194, "Shipments by Warehouse"),
      tSheet("SHEET/Backorder Mix[pie]", 436, 662, 396, 194, "Backorder Mix"),
      tSheet("SHEET/Backorders vs Shipments[scatter]", 848, 662, 408, 194, "Backorders vs Shipments"),
    ],
  },
  // ── Customer Support — QUADRANT: four equal service-desk charts in a 2×2, the
  // five KPIs as a summary strip along the BOTTOM.
  "support": {
    name: "Customer Support Dashboard",
    w: 1280, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Customer Support Performance"),
      tFilter("FILTER/Channel", 1000, 22, 130, 36, "Channel ▾"),
      tFilter("FILTER/Week", 1142, 22, 114, 36, "Week ▾"),
      tSheet("SHEET/Tickets Trend[line]", 24, 70, 610, 300, "Tickets Trend"),
      tSheet("SHEET/Tickets by Channel[bar]", 650, 70, 606, 300, "Tickets by Channel"),
      tSheet("SHEET/Resolved vs Open[bar]", 24, 386, 610, 300, "Resolved vs Open"),
      tSheet("SHEET/Channel Mix[pie]", 650, 386, 606, 300, "Channel Mix"),
      tKpi("KPI/Tickets", 24, 702, 232, 134, "6,842", "Tickets", "+3.1% WoW"),
      tKpi("KPI/CSAT", 268, 702, 232, 134, "4.6", "CSAT (of 5)", "+0.2"),
      tKpi("KPI/First Response", 512, 702, 232, 134, "1.2 h", "First Response", "-0.3 h"),
      tKpi("KPI/Resolution", 756, 702, 232, 134, "8.4 h", "Resolution Time", "-1.1 h"),
      tKpi("KPI/SLA", 1000, 702, 256, 134, "97%", "SLA Met", "+2 pts"),
    ],
  },
  // ── Product Analytics — SPLIT HERO: a wide users trend beside a tall adoption
  // pie up top, KPI row through the middle, a 2-up detail row below.
  "product": {
    name: "Product Analytics Dashboard",
    w: 1280, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Product Analytics"),
      tSheet("SHEET/Active Users Trend[area]", 24, 64, 820, 300, "Active Users Trend"),
      tSheet("SHEET/Feature Adoption Mix[pie]", 860, 64, 396, 300, "Feature Adoption Mix"),
      tKpi("KPI/DAU", 24, 380, 296, 96, "42.5K", "Daily Active Users", "+8.3% WoW"),
      tKpi("KPI/Retention", 332, 380, 296, 96, "68%", "30-Day Retention", "+2 pts"),
      tKpi("KPI/Sessions", 640, 380, 296, 96, "128K", "Sessions", "+11%"),
      tKpi("KPI/Churn", 948, 380, 296, 96, "3.1%", "Churn Rate", "-0.4 pts"),
      tSheet("SHEET/Usage by Feature[bar]", 24, 492, 610, 304, "Usage by Feature"),
      tSheet("SHEET/Sessions vs Users[scatter]", 650, 492, 606, 304, "Sessions vs Users"),
    ],
  },
  // ── IT Operations — STATUS BOARD: a tall service-health heatmap owns the LEFT
  // rail, a 2×2 KPI block + stacked traffic charts on the right.
  "itops": {
    name: "IT Operations Dashboard",
    w: 1320, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "IT Operations & Reliability"),
      tFilter("FILTER/Service", 1044, 22, 140, 36, "Service ▾"),
      tFilter("FILTER/Day", 1196, 22, 100, 36, "Day ▾"),
      tSheet("SHEET/Service Health[heatmap]", 24, 74, 420, 742, "Service Health"),
      tKpi("KPI/Uptime", 468, 74, 400, 100, "99.95%", "Uptime", "+0.02%"),
      tKpi("KPI/Requests", 884, 74, 412, 100, "48.2M", "Requests / day", "+6.1%"),
      tKpi("KPI/Error Rate", 468, 186, 400, 100, "0.12%", "Error Rate", "-0.03 pts"),
      tKpi("KPI/Latency", 884, 186, 412, 100, "142 ms", "p95 Latency", "-8 ms"),
      tSheet("SHEET/Requests Trend[line]", 468, 302, 828, 250, "Requests Trend"),
      tSheet("SHEET/Errors by Service[bar]", 468, 568, 406, 248, "Errors by Service"),
      tSheet("SHEET/Errors vs Requests[scatter]", 890, 568, 406, 248, "Errors vs Requests"),
    ],
  },
  // ── Manufacturing — SHOP FLOOR: KPI strip, a tall defect heatmap owns the
  // RIGHT rail, production charts in a 2×2 on the left.
  "manufacturing": {
    name: "Manufacturing Dashboard",
    w: 1320, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Manufacturing & Production"),
      tFilter("FILTER/Line", 1044, 22, 140, 36, "Line ▾"),
      tFilter("FILTER/Week", 1196, 22, 100, 36, "Week ▾"),
      tKpi("KPI/OEE", 24, 74, 300, 90, "82.4%", "OEE", "+1.6%"),
      tKpi("KPI/Units", 336, 74, 300, 90, "94.2K", "Units Produced", "+4.1% WoW"),
      tKpi("KPI/Defect Rate", 648, 74, 300, 90, "1.8%", "Defect Rate", "-0.3 pts"),
      tKpi("KPI/Yield", 960, 74, 300, 90, "96.5%", "First-Pass Yield", "+0.7%"),
      tSheet("SHEET/Output Trend[line]", 24, 180, 420, 310, "Output Trend"),
      tSheet("SHEET/Units by Line[bar]", 460, 180, 424, 310, "Units by Line"),
      tSheet("SHEET/Yield by Line[bar]", 24, 506, 420, 310, "Yield by Line"),
      tSheet("SHEET/Defects vs Units[scatter]", 460, 506, 424, 310, "Defects vs Units"),
      tSheet("SHEET/Defect Heatmap[heatmap]", 900, 180, 396, 636, "Defect Heatmap"),
    ],
  },
  // ── Retail / E-commerce — ASYMMETRIC COLUMNS: a wide storefront column (trend
  // + units) beside a narrow merchandising column (mix, category, basket).
  "retail": {
    name: "Retail Dashboard",
    w: 1280, h: 840,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Retail & E-commerce Overview"),
      tFilter("FILTER/Category", 978, 22, 140, 36, "Category ▾"),
      tFilter("FILTER/Month", 1130, 22, 126, 36, "Month ▾"),
      tKpi("KPI/Revenue", 24, 74, 296, 92, "$4.8M", "Revenue", "+9.4% MoM"),
      tKpi("KPI/AOV", 336, 74, 296, 92, "$68", "Avg Order Value", "+$4"),
      tKpi("KPI/Conversion", 648, 74, 296, 92, "3.1%", "Checkout Conversion", "+0.3 pts"),
      tKpi("KPI/Returns", 960, 74, 296, 92, "4.2%", "Return Rate", "-0.5 pts"),
      tSheet("SHEET/Revenue Trend[area]", 24, 182, 800, 330, "Revenue Trend"),
      tSheet("SHEET/Units by Category[bar]", 24, 528, 800, 288, "Units by Category"),
      tSheet("SHEET/Category Mix[pie]", 840, 182, 416, 240, "Category Mix"),
      tSheet("SHEET/Revenue by Category[bar]", 840, 438, 416, 180, "Revenue by Category"),
      tSheet("SHEET/Units vs Revenue[scatter]", 840, 634, 416, 182, "Units vs Revenue"),
    ],
  },
  // ── Project Management — KANBAN COLUMNS: three equal delivery lanes, each a
  // KPI over its tall chart (velocity/burn-up · open items · status mix).
  "project": {
    name: "Project Management Dashboard",
    w: 1300, h: 840,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Project Delivery & Velocity"),
      tFilter("FILTER/Team", 1020, 22, 120, 36, "Team ▾"),
      tFilter("FILTER/Sprint", 1152, 22, 124, 36, "Sprint ▾"),
      tKpi("KPI/Velocity", 24, 74, 404, 96, "48", "Velocity (pts)", "+5 pts"),
      tSheet("SHEET/Completed Trend[line]", 24, 186, 404, 630, "Completed by Sprint"),
      tKpi("KPI/Open", 452, 74, 404, 96, "74", "Open Items", "-11"),
      tSheet("SHEET/Open by Team[bar]", 452, 186, 404, 630, "Open Items by Team"),
      tKpi("KPI/On-Track", 880, 74, 396, 96, "86%", "On-Track", "+4 pts"),
      tSheet("SHEET/Status Mix[pie]", 880, 186, 396, 630, "Status Mix"),
    ],
  },
  // ── ESG / Sustainability — MIX SPOTLIGHT: a big energy-mix pie + 2×2 impact
  // KPI block on the left, stacked emissions charts on the right.
  "esg": {
    name: "ESG Dashboard",
    w: 1280, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "ESG & Sustainability"),
      tFilter("FILTER/Facility", 1000, 22, 130, 36, "Facility ▾"),
      tFilter("FILTER/Quarter", 1142, 22, 114, 36, "Quarter ▾"),
      tSheet("SHEET/Energy Mix[pie]", 24, 74, 500, 452, "Energy Mix"),
      tKpi("KPI/Emissions", 24, 542, 242, 122, "12.4K t", "CO₂ Emissions", "-6.2% YoY"),
      tKpi("KPI/Renewable", 282, 542, 242, 122, "58%", "Renewable Energy", "+7 pts"),
      tKpi("KPI/Water", 24, 680, 242, 116, "-9%", "Water Intensity", "vs baseline"),
      tKpi("KPI/Diversion", 282, 680, 242, 116, "74%", "Waste Diversion", "+5 pts"),
      tSheet("SHEET/Emissions Trend[line]", 548, 74, 708, 350, "Emissions Trend"),
      tSheet("SHEET/Emissions by Facility[bar]", 548, 440, 708, 170, "Emissions by Facility"),
      tSheet("SHEET/Renewable by Facility[bar]", 548, 626, 708, 170, "Renewable by Facility"),
    ],
  },
};

/** The template's field accent as a Figma RGB. Template ids match the
 * DOMAIN_ACCENTS keys except "operations" (the domain key is "ops"). */
function templateAccent(templateId: string): RGB | undefined {
  const hex = DOMAIN_ACCENTS[templateId === "operations" ? "ops" : templateId];
  if (!hex) return undefined;
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

/**
 * A guaranteed-EMPTY page position for a new dashboard: just past the
 * rightmost top-level node on the page (nothing extends beyond it, so the spot
 * can never overlap an existing design), top-aligned with the selected
 * dashboard frame when there is one (else with the topmost node).
 */
function emptyPlacement(): { x: number; y: number } {
  const nodes = figma.currentPage.children;
  if (!nodes.length) return { x: 0, y: 0 };
  const frame = findDashboardFrame();
  let maxRight = -Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    maxRight = Math.max(maxRight, n.x + n.width);
    minY = Math.min(minY, n.y);
  }
  return { x: Math.ceil(maxRight + 160), y: Math.round(frame ? frame.y : minY) };
}

async function applyTemplate(templateId: string): Promise<void> {
  const font = await loadLabelFont();
  const t = TEMPLATES[templateId];
  if (!t) return;
  // Field accent: colors the KPI values + SHEET/ captions so each template reads
  // as its own domain. The caption color also drives the EXPORT — the faithful
  // transpiler samples the most vivid fill inside a SHEET/ layer as the chart's
  // mark color, so a clinical template exports cyan charts, sales green, etc.
  const accent = templateAccent(templateId);

  // Domain palette derived from the accent: dark accent-hued canvas plus
  // accent-tinted cards and strokes. The card tints are pale on purpose (their
  // saturation stays under the exporter's 0.18 vividness cutoff), so the
  // accent-colored captions — not the cards — remain the sampled mark color.
  // Canvas keeps 60% of the accent: the accents are dark colors to begin with,
  // so anything below ~0.5 reads as black once Tableau renders it (confirmed on
  // the user's exports at 0.18 and 0.42). 0.6 gives a rich, unmistakably hued
  // canvas — dark red for retail, forest green for sales, indigo for finance —
  // while the light cards keep full contrast.
  const pal = accent
    ? {
        bg: mix(accent, BLACK, 0.6),
        sheet: mix(accent, WHITE, 0.07),
        kpi: mix(accent, WHITE, 0.12),
        stroke: mix(accent, WHITE, 0.35),
      }
    : undefined;

  // Always place the new dashboard in EMPTY page space (past everything on the
  // page) so it can never land on top of an existing design.
  const spot = emptyPlacement();

  const dash = figma.createFrame();
  dash.name = t.name;
  dash.resize(t.w, t.h);
  dash.x = spot.x;
  dash.y = spot.y;
  dash.cornerRadius = 10;
  dash.fills = [{ type: "SOLID", color: pal ? pal.bg : T_BG }];

  for (const c of t.children) {
    const child = figma.createFrame();
    child.name = c.name;
    child.resize(c.w, c.h);
    child.x = c.x;
    child.y = c.y;
    child.cornerRadius = c.radius ?? 10;
    // Swap the shared placeholder colors for the domain tint (matched by
    // reference: every builder uses the same T_SH/T_KPI/T_BG constants).
    const fill =
      pal && c.fill === T_SH ? pal.sheet
      : pal && c.fill === T_KPI ? pal.kpi
      : pal && c.fill === T_BG ? pal.bg
      : c.fill;
    child.fills = [{ type: "SOLID", color: fill }];
    if (c.name.startsWith("SHEET/") || c.name.startsWith("URL/") || c.name.startsWith("Image/") || c.name.startsWith("FILTER/")) {
      child.strokes = [{ type: "SOLID", color: pal ? pal.stroke : { r: 0.78, g: 0.8, b: 0.9 } }];
      child.strokeWeight = 1;
    }
    if (font && (c.caption || c.label)) {
      const fontSize = c.fontSize ?? 14;
      const color = c.capColor ?? { r: 0.25, g: 0.28, b: 0.42 };
      if (c.name.startsWith("KPI/") && c.label) {
        // Rich KPI card: small label / big value / change line, as ONE styled
        // text layer in a hug-height Auto-Layout (reuses fillKpiRows so it never
        // clips and stays editable, exactly like the library KPI cards). The
        // value line takes the template's field accent.
        const rows: Array<{ text: string; size: number; color: RGB }> = [
          { text: c.label, size: 13, color: { r: 0.4, g: 0.43, b: 0.55 } },
          { text: c.caption ?? "", size: fontSize, color: accent ?? color },
        ];
        if (c.delta) rows.push({ text: c.delta, size: 12, color: c.deltaColor ?? T_UP });
        fillKpiRows(child, font, rows);
      } else if (c.name.startsWith("KPI/") || c.name.startsWith("TEXT/")) {
        // KPI / Text zones: hug-height Auto-Layout so the caption never clips.
        fillCaption(child, font, c.caption ?? "", fontSize, color, 10, 10);
      } else {
        const txt = figma.createText();
        txt.fontName = font;
        txt.characters = c.caption ?? "";
        txt.fontSize = fontSize;
        // SHEET/ captions carry the field accent — visible in Figma AND sampled
        // by the exporter as that chart's mark color (see dominantChartColor).
        const capCol = accent && c.name.startsWith("SHEET/") ? accent : color;
        txt.fills = [{ type: "SOLID", color: capCol }];
        child.appendChild(txt);
        txt.x = 10;
        txt.y = Math.max(6, (c.h - txt.height) / 2);
      }
    }
    dash.appendChild(child);
  }

  figma.currentPage.appendChild(dash);
  figma.currentPage.selection = [dash];
  figma.viewport.scrollAndZoomIntoView([dash]);
  figma.notify(`Created "${t.name}" (${t.children.length} components) in empty space beside your designs.`);
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

/** Send the Account-tab info: the Figma user's name + the persisted export count. */
async function sendAccountInfo(): Promise<void> {
  let exportCount = 0;
  try {
    const stored = await figma.clientStorage.getAsync("ft-export-count");
    if (typeof stored === "number" && isFinite(stored)) exportCount = stored;
  } catch {
    /* counter is cosmetic — default to 0 */
  }
  post({
    type: "account-info",
    userName: figma.currentUser ? figma.currentUser.name : null,
    exportCount,
  });
}

/** Bump the persisted export counter, then refresh the Account tab. */
async function logExport(): Promise<void> {
  let count = 0;
  try {
    const stored = await figma.clientStorage.getAsync("ft-export-count");
    if (typeof stored === "number" && isFinite(stored)) count = stored;
    await figma.clientStorage.setAsync("ft-export-count", count + 1);
  } catch {
    /* counter is cosmetic — never block the export flow */
  }
  void sendAccountInfo();
}

/** Forget the imported workbook persisted across sessions. */
async function clearImport(): Promise<void> {
  try {
    await figma.clientStorage.deleteAsync("ft-import");
    figma.notify("Stored Tableau workbook cleared — charts will use demo data until you upload again.");
  } catch {
    figma.notify("Couldn't clear the stored workbook — try again.");
  }
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
    case "request-account":
      void sendAccountInfo();
      break;
    case "log-export":
      void logExport();
      break;
    case "clear-import":
      void clearImport();
      break;
  }
};

// Initial parse on launch + restore persisted import data from prior session.
void parseAndSend();
void restoreImport();
