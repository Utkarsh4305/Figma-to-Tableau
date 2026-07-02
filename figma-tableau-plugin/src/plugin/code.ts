// ---------------------------------------------------------------------------
// code.ts — the Figma plugin main thread (sandbox). Has the `figma` global,
// no DOM. Opens the UI, parses the selection into a DashboardModel, and posts
// it to the UI. All Tableau generation / zipping / downloading happens in the
// UI iframe (which has Blob + JSZip + FileSaver).
// ---------------------------------------------------------------------------

import { parseSelection, attachImages, applyAutoTags } from "./parser";
import { parseFaithfulAll, attachFaithfulImages, expandNavTargets } from "./faithful";
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

// Per-category dashboard background (dark, distinctly hued) so each template
// reads as its own category at a glance \u2014 e.g. deep blue for clinical, green for
// sales. Light cards (T_SH / T_KPI) keep their contrast on every one.
const T_BG_CLINICAL: RGB = { r: 0.04, g: 0.09, b: 0.16 };
const T_BG_SALES: RGB = { r: 0.04, g: 0.12, b: 0.08 };
const T_BG_FINANCE: RGB = { r: 0.05, g: 0.07, b: 0.13 };
const T_BG_EXEC: RGB = { r: 0.08, g: 0.07, b: 0.12 };
const T_BG_OPS: RGB = { r: 0.12, g: 0.08, b: 0.03 };
const T_BG_MARKETING: RGB = { r: 0.13, g: 0.05, b: 0.10 };
const T_BG_HR: RGB = { r: 0.09, g: 0.05, b: 0.13 };
const T_BG_SUPPLY: RGB = { r: 0.03, g: 0.11, b: 0.11 };
const T_BG_SUPPORT: RGB = { r: 0.03, g: 0.10, b: 0.14 };
const T_BG_PRODUCT: RGB = { r: 0.07, g: 0.05, b: 0.14 };
const T_BG_ITOPS: RGB = { r: 0.05, g: 0.08, b: 0.12 };
const T_BG_MFG: RGB = { r: 0.09, g: 0.09, b: 0.10 };
const T_BG_RETAIL: RGB = { r: 0.14, g: 0.05, b: 0.05 };
const T_BG_PROJECT: RGB = { r: 0.06, g: 0.06, b: 0.14 };
const T_BG_ESG: RGB = { r: 0.03, g: 0.10, b: 0.06 };

const TEMPLATES: Record<string, { name: string; w: number; h: number; bg?: RGB; children: TChild[] }> = {
  // \u2500\u2500 Clinical \u2014 LEFT SIDEBAR: KPI/filter rail on the left, charts fill the right.
  "clinical": {
    name: "Clinical Dashboard",
    w: 1300, h: 820, bg: T_BG_CLINICAL,
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
    w: 1280, h: 800, bg: T_BG_SALES,
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
    w: 1260, h: 860, bg: T_BG_FINANCE,
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
    w: 1280, h: 780, bg: T_BG_EXEC,
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
    w: 1320, h: 860, bg: T_BG_OPS,
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
  // ── Marketing — FUNNEL HERO: KPI row, big channel-performance hero + funnel rail,
  // then a 3-up of leads trend / conversions by channel / spend mix.
  "marketing": {
    name: "Marketing Dashboard",
    w: 1300, h: 820, bg: T_BG_MARKETING,
    children: [
      tTitle("TEXT/Title", 24, 20, 480, "Marketing Campaign Performance"),
      tFilter("FILTER/Channel", 980, 22, 150, 36, "Channel ▾"),
      tFilter("FILTER/Week", 1142, 22, 134, 36, "Week ▾"),
      tKpi("KPI/Leads", 24, 74, 296, 92, "18.2K", "Leads (MQLs)", "+14% WoW"),
      tKpi("KPI/CTR", 336, 74, 296, 92, "3.6%", "Click-Through", "+0.5 pts"),
      tKpi("KPI/CAC", 648, 74, 296, 92, "$42", "Cost per Lead", "-$6 WoW"),
      tKpi("KPI/ROAS", 960, 74, 296, 92, "4.8x", "Return on Ad Spend", "+0.4x"),
      tSheet("SHEET/Leads Trend[area]", 24, 182, 830, 300, "Leads Trend"),
      tSheet("SHEET/Conversion Funnel[bar]", 872, 182, 404, 300, "Conversion Funnel"),
      tSheet("SHEET/Leads by Channel[bar]", 24, 500, 400, 300, "Leads by Channel"),
      tSheet("SHEET/Channel Mix[pie]", 448, 500, 400, 300, "Channel Mix"),
      tSheet("SHEET/Conversions vs Leads[scatter]", 872, 500, 404, 300, "Conversions vs Leads"),
    ],
  },
  // ── HR — PEOPLE OVERVIEW: KPI strip, headcount trend + attrition, then a
  // department bar and diversity pie.
  "hr": {
    name: "HR Dashboard",
    w: 1260, h: 820, bg: T_BG_HR,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "People & Workforce Analytics"),
      tFilter("FILTER/Department", 980, 22, 130, 36, "Department ▾"),
      tFilter("FILTER/Month", 1122, 22, 114, 36, "Month ▾"),
      tKpi("KPI/Headcount", 24, 74, 232, 90, "1,204", "Headcount", "+38 MoM"),
      tKpi("KPI/Attrition", 268, 74, 232, 90, "7.2%", "Attrition Rate", "-0.8% MoM"),
      tKpi("KPI/Time to Hire", 512, 74, 232, 90, "28 d", "Time to Hire", "-3 d"),
      tKpi("KPI/eNPS", 756, 74, 232, 90, "41", "Employee NPS", "+6 pts"),
      tKpi("KPI/Offer Rate", 1000, 74, 236, 90, "82%", "Offer Accept", "+3 pts"),
      tSheet("SHEET/Headcount Trend[line]", 24, 176, 720, 300, "Headcount Trend"),
      tSheet("SHEET/Attrition by Department[bar]", 764, 176, 472, 300, "Attrition by Department"),
      tSheet("SHEET/Headcount by Department[bar]", 24, 492, 590, 308, "Headcount by Department"),
      tSheet("SHEET/Workforce Mix[pie]", 646, 492, 590, 308, "Workforce Mix"),
    ],
  },
  // ── Supply Chain — FLOW: KPI strip, shipments trend hero + on-time rail, then
  // warehouse bar, backorders and a fulfillment scatter.
  "supplychain": {
    name: "Supply Chain Dashboard",
    w: 1320, h: 840, bg: T_BG_SUPPLY,
    children: [
      tTitle("TEXT/Title", 24, 20, 480, "Supply Chain & Logistics"),
      tFilter("FILTER/Warehouse", 1044, 22, 140, 36, "Warehouse ▾"),
      tFilter("FILTER/Week", 1196, 22, 100, 36, "Week ▾"),
      tKpi("KPI/Shipments", 24, 74, 300, 90, "42.1K", "Shipments", "+5.2% WoW"),
      tKpi("KPI/On-Time", 336, 74, 300, 90, "94.6%", "On-Time Delivery", "+1.1%"),
      tKpi("KPI/Backorders", 648, 74, 300, 90, "312", "Backorders", "-48 WoW"),
      tKpi("KPI/Inventory Turns", 960, 74, 300, 90, "8.4", "Inventory Turns", "+0.3"),
      tSheet("SHEET/Shipments Trend[line]", 24, 178, 860, 300, "Shipments Trend"),
      tSheet("SHEET/On-Time by Warehouse[bar]", 900, 178, 396, 300, "On-Time by Warehouse"),
      tSheet("SHEET/Shipments by Warehouse[bar]", 24, 496, 400, 320, "Shipments by Warehouse"),
      tSheet("SHEET/Backorder Mix[pie]", 448, 496, 400, 320, "Backorder Mix"),
      tSheet("SHEET/Backorders vs Shipments[scatter]", 872, 496, 424, 320, "Backorders vs Shipments"),
    ],
  },
  // ── Customer Support — SERVICE DESK: KPI strip, tickets trend hero + CSAT rail,
  // then channel bar, backlog pie.
  "support": {
    name: "Customer Support Dashboard",
    w: 1260, h: 820, bg: T_BG_SUPPORT,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Customer Support Performance"),
      tFilter("FILTER/Channel", 980, 22, 130, 36, "Channel ▾"),
      tFilter("FILTER/Week", 1122, 22, 114, 36, "Week ▾"),
      tKpi("KPI/Tickets", 24, 74, 232, 90, "6,842", "Tickets", "+3.1% WoW"),
      tKpi("KPI/CSAT", 268, 74, 232, 90, "4.6", "CSAT (of 5)", "+0.2"),
      tKpi("KPI/First Response", 512, 74, 232, 90, "1.2 h", "First Response", "-0.3 h"),
      tKpi("KPI/Resolution", 756, 74, 232, 90, "8.4 h", "Resolution Time", "-1.1 h"),
      tKpi("KPI/SLA", 1000, 74, 236, 90, "97%", "SLA Met", "+2 pts"),
      tSheet("SHEET/Tickets Trend[line]", 24, 176, 720, 300, "Tickets Trend"),
      tSheet("SHEET/Tickets by Channel[bar]", 764, 176, 472, 300, "Tickets by Channel"),
      tSheet("SHEET/Resolved vs Open[bar]", 24, 492, 590, 308, "Resolved vs Open"),
      tSheet("SHEET/Channel Mix[pie]", 646, 492, 590, 308, "Channel Mix"),
    ],
  },
  // ── Product Analytics — GROWTH: hero DAU trend across the top, KPI row, then a
  // feature-adoption bar, retention pie and a usage scatter.
  "product": {
    name: "Product Analytics Dashboard",
    w: 1280, h: 800, bg: T_BG_PRODUCT,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Product Analytics"),
      tSheet("SHEET/Active Users Trend[area]", 24, 60, 1232, 250, "Active Users Trend"),
      tKpi("KPI/DAU", 24, 330, 296, 96, "42.5K", "Daily Active Users", "+8.3% WoW"),
      tKpi("KPI/Retention", 332, 330, 296, 96, "68%", "30-Day Retention", "+2 pts"),
      tKpi("KPI/Sessions", 640, 330, 296, 96, "128K", "Sessions", "+11%"),
      tKpi("KPI/Churn", 948, 330, 296, 96, "3.1%", "Churn Rate", "-0.4 pts"),
      tSheet("SHEET/Usage by Feature[bar]", 24, 446, 396, 314, "Usage by Feature"),
      tSheet("SHEET/Feature Adoption Mix[pie]", 436, 446, 396, 314, "Feature Adoption Mix"),
      tSheet("SHEET/Sessions vs Users[scatter]", 848, 446, 408, 314, "Sessions vs Users"),
    ],
  },
  // ── IT Operations — NOC: KPI strip, requests trend hero + error rail, then a
  // service heatmap, latency bar and an errors scatter.
  "itops": {
    name: "IT Operations Dashboard",
    w: 1320, h: 840, bg: T_BG_ITOPS,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "IT Operations & Reliability"),
      tFilter("FILTER/Service", 1044, 22, 140, 36, "Service ▾"),
      tFilter("FILTER/Day", 1196, 22, 100, 36, "Day ▾"),
      tKpi("KPI/Uptime", 24, 74, 300, 90, "99.95%", "Uptime", "+0.02%"),
      tKpi("KPI/Requests", 336, 74, 300, 90, "48.2M", "Requests / day", "+6.1%"),
      tKpi("KPI/Error Rate", 648, 74, 300, 90, "0.12%", "Error Rate", "-0.03 pts"),
      tKpi("KPI/Latency", 960, 74, 300, 90, "142 ms", "p95 Latency", "-8 ms"),
      tSheet("SHEET/Requests Trend[line]", 24, 178, 860, 300, "Requests Trend"),
      tSheet("SHEET/Errors by Service[bar]", 900, 178, 396, 300, "Errors by Service"),
      tSheet("SHEET/Service Health[heatmap]", 24, 496, 410, 320, "Service Health"),
      tSheet("SHEET/Requests by Service[bar]", 450, 496, 430, 320, "Requests by Service"),
      tSheet("SHEET/Errors vs Requests[scatter]", 896, 496, 400, 320, "Errors vs Requests"),
    ],
  },
  // ── Manufacturing — SHOP FLOOR: KPI strip, output trend hero + yield rail, then
  // a defect heatmap, units bar and a defects scatter.
  "manufacturing": {
    name: "Manufacturing Dashboard",
    w: 1320, h: 840, bg: T_BG_MFG,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Manufacturing & Production"),
      tFilter("FILTER/Line", 1044, 22, 140, 36, "Line ▾"),
      tFilter("FILTER/Week", 1196, 22, 100, 36, "Week ▾"),
      tKpi("KPI/OEE", 24, 74, 300, 90, "82.4%", "OEE", "+1.6%"),
      tKpi("KPI/Units", 336, 74, 300, 90, "94.2K", "Units Produced", "+4.1% WoW"),
      tKpi("KPI/Defect Rate", 648, 74, 300, 90, "1.8%", "Defect Rate", "-0.3 pts"),
      tKpi("KPI/Yield", 960, 74, 300, 90, "96.5%", "First-Pass Yield", "+0.7%"),
      tSheet("SHEET/Output Trend[line]", 24, 178, 860, 300, "Output Trend"),
      tSheet("SHEET/Units by Line[bar]", 900, 178, 396, 300, "Units by Line"),
      tSheet("SHEET/Defect Heatmap[heatmap]", 24, 496, 410, 320, "Defect Heatmap"),
      tSheet("SHEET/Yield by Line[bar]", 450, 496, 430, 320, "Yield by Line"),
      tSheet("SHEET/Defects vs Units[scatter]", 896, 496, 400, 320, "Defects vs Units"),
    ],
  },
  // ── Retail / E-commerce — STOREFRONT: KPI row, revenue trend hero + category rail,
  // then category mix pie, units bar and a basket scatter.
  "retail": {
    name: "Retail Dashboard",
    w: 1280, h: 820, bg: T_BG_RETAIL,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Retail & E-commerce Overview"),
      tFilter("FILTER/Category", 978, 22, 140, 36, "Category ▾"),
      tFilter("FILTER/Month", 1130, 22, 126, 36, "Month ▾"),
      tKpi("KPI/Revenue", 24, 74, 296, 92, "$4.8M", "Revenue", "+9.4% MoM"),
      tKpi("KPI/AOV", 336, 74, 296, 92, "$68", "Avg Order Value", "+$4"),
      tKpi("KPI/Conversion", 648, 74, 296, 92, "3.1%", "Checkout Conversion", "+0.3 pts"),
      tKpi("KPI/Returns", 960, 74, 296, 92, "4.2%", "Return Rate", "-0.5 pts"),
      tSheet("SHEET/Revenue Trend[area]", 24, 182, 830, 300, "Revenue Trend"),
      tSheet("SHEET/Revenue by Category[bar]", 872, 182, 404, 300, "Revenue by Category"),
      tSheet("SHEET/Category Mix[pie]", 24, 500, 400, 300, "Category Mix"),
      tSheet("SHEET/Units by Category[bar]", 448, 500, 400, 300, "Units by Category"),
      tSheet("SHEET/Units vs Revenue[scatter]", 872, 500, 404, 300, "Units vs Revenue"),
    ],
  },
  // ── Project Management — DELIVERY: KPI strip, burn-up (completed) trend hero +
  // open rail, then a team bar and a status pie.
  "project": {
    name: "Project Management Dashboard",
    w: 1260, h: 820, bg: T_BG_PROJECT,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Project Delivery & Velocity"),
      tFilter("FILTER/Team", 980, 22, 130, 36, "Team ▾"),
      tFilter("FILTER/Sprint", 1122, 22, 114, 36, "Sprint ▾"),
      tKpi("KPI/Velocity", 24, 74, 232, 90, "48", "Velocity (pts)", "+5 pts"),
      tKpi("KPI/Completed", 268, 74, 232, 90, "312", "Stories Done", "+18 sprint"),
      tKpi("KPI/Open", 512, 74, 232, 90, "74", "Open Items", "-11"),
      tKpi("KPI/On-Track", 756, 74, 232, 90, "86%", "On-Track", "+4 pts"),
      tKpi("KPI/Cycle Time", 1000, 74, 236, 90, "3.4 d", "Cycle Time", "-0.6 d"),
      tSheet("SHEET/Completed Trend[line]", 24, 176, 720, 300, "Completed by Sprint"),
      tSheet("SHEET/Open by Team[bar]", 764, 176, 472, 300, "Open Items by Team"),
      tSheet("SHEET/Throughput by Team[bar]", 24, 492, 590, 308, "Throughput by Team"),
      tSheet("SHEET/Status Mix[pie]", 646, 492, 590, 308, "Status Mix"),
    ],
  },
  // ── ESG / Sustainability — IMPACT: KPI strip, emissions trend hero + renewable
  // rail, then a facility bar and an energy-mix pie.
  "esg": {
    name: "ESG Dashboard",
    w: 1260, h: 820, bg: T_BG_ESG,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "ESG & Sustainability"),
      tFilter("FILTER/Facility", 980, 22, 130, 36, "Facility ▾"),
      tFilter("FILTER/Quarter", 1122, 22, 114, 36, "Quarter ▾"),
      tKpi("KPI/Emissions", 24, 74, 296, 92, "12.4K t", "CO₂ Emissions", "-6.2% YoY"),
      tKpi("KPI/Renewable", 336, 74, 296, 92, "58%", "Renewable Energy", "+7 pts"),
      tKpi("KPI/Water", 648, 74, 296, 92, "-9%", "Water Intensity", "vs baseline"),
      tKpi("KPI/Diversion", 960, 74, 296, 92, "74%", "Waste Diversion", "+5 pts"),
      tSheet("SHEET/Emissions Trend[line]", 24, 182, 720, 300, "Emissions Trend"),
      tSheet("SHEET/Emissions by Facility[bar]", 764, 182, 472, 300, "Emissions by Facility"),
      tSheet("SHEET/Renewable by Facility[bar]", 24, 498, 590, 302, "Renewable by Facility"),
      tSheet("SHEET/Energy Mix[pie]", 646, 498, 590, 302, "Energy Mix"),
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

async function applyTemplate(templateId: string): Promise<void> {
  const font = await loadLabelFont();
  const t = TEMPLATES[templateId];
  if (!t) return;
  // Field accent: colors the KPI values + SHEET/ captions so each template reads
  // as its own domain. The caption color also drives the EXPORT — the faithful
  // transpiler samples the most vivid fill inside a SHEET/ layer as the chart's
  // mark color, so a clinical template exports cyan charts, sales green, etc.
  const accent = templateAccent(templateId);

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
  dash.fills = [{ type: "SOLID", color: t.bg ?? T_BG }];

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
