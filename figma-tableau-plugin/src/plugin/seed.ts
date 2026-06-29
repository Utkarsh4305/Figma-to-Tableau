// ---------------------------------------------------------------------------
// seed.ts — converts a parsed Figma DashboardModel into an editable
// WorkbookSpec (the editor's starting point). Users then refine everything.
// Also provides a blank spec for building from scratch (no Figma).
// ---------------------------------------------------------------------------

import type { DashboardModel, FaithfulModel } from "../shared/types";
import type {
  WorkbookSpec,
  WorksheetSpec,
  DashboardSpec,
  ZoneSpec,
  SpecField,
  MarkType,
  ContainerSpec,
  LayoutNode,
  ActionSpec,
} from "../shared/spec";
import { nextId, isContainer } from "../shared/spec";
import { DOMAIN_KEYWORDS, DOMAIN_FIELDS } from "../shared/constants";
import { generateSampleRows } from "./csv";

function detectDomain(model: DashboardModel): string {
  const hay = (model.title + " " + model.elements.map((e) => e.name).join(" ")).toLowerCase();
  for (const { domain, words } of DOMAIN_KEYWORDS) if (words.some((w) => hay.includes(w))) return domain;
  return "generic";
}

function markFor(kind?: string): MarkType {
  switch (kind) {
    case "line":
      return "Line";
    case "area":
      return "Area";
    case "pie":
      return "Pie";
    case "scatter":
      return "Circle";
    default:
      return "Bar";
  }
}

function slugFile(s: string): string {
  return (
    s
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "image"
  );
}

// --- geometric layout engine (recursive guillotine partitioning) ------------
//
// This is how LaDataViz-grade tiled output is reconstructed from a flat set of
// placed zones, INDEPENDENT of how messy the Figma nesting was. We recursively
// cut the set of rectangles along clean horizontal/vertical gutters:
//   - a vertical gutter (no rect spans across it) splits into COLUMNS -> horz
//   - a horizontal gutter splits into ROWS -> vert
// Each side recurses. The result is a nested layout-flow tree that mirrors the
// visual structure (sidebar | (header / kpi-row / charts)) with no overlap and
// no truncation, because the flow — not absolute coords — drives sizing.

interface LRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Treat near-touching / slightly-overlapping edges (sloppy designs) as a clean
// cut; only a real overlap (one rect well inside another's span) merges them.
const GUTTER_TOL = 8;

/** Split items into bands separated by clean gutters along one axis. */
function bands(items: LRect[], axis: "x" | "y"): LRect[][] {
  const start = (i: LRect) => (axis === "x" ? i.x : i.y);
  const end = (i: LRect) => (axis === "x" ? i.x + i.w : i.y + i.h);
  const sorted = [...items].sort((a, b) => start(a) - start(b));
  const groups: LRect[][] = [];
  let cur: LRect[] = [sorted[0]];
  let curEnd = end(sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    if (start(it) >= curEnd - GUTTER_TOL) {
      groups.push(cur);
      cur = [it];
      curEnd = end(it);
    } else {
      cur.push(it);
      curEnd = Math.max(curEnd, end(it));
    }
  }
  groups.push(cur);
  return groups;
}

/** Recursively partition a set of rects into a layout-flow node tree. */
function partition(items: LRect[]): LayoutNode {
  if (items.length === 1) return { zone: items[0].id };
  const cols = bands(items, "x"); // vertical gutters -> columns (horz flow)
  const rows = bands(items, "y"); // horizontal gutters -> rows (vert flow)

  // Pick the axis that actually splits and yields the finer top-level cut. Ties
  // favour rows (dashboards stack vertically); a sidebar (cols=2, rows=1) still
  // wins horz because it has strictly more groups.
  let dir: "horz" | "vert" | null = null;
  if (cols.length > 1 && cols.length >= rows.length) dir = "horz";
  else if (rows.length > 1) dir = "vert";
  else if (cols.length > 1) dir = "horz";

  if (!dir) {
    // No clean gutter on either axis (rects overlap) — stack in reading order.
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    return { id: nextId("c"), direction: "vert", children: sorted.map((i) => ({ zone: i.id })) };
  }
  const groups = dir === "horz" ? cols : rows;
  return { id: nextId("c"), direction: dir, children: groups.map(partition) };
}

/** Build the root flow container from the placed zones' geometry. */
function inferLayoutTree(zones: ZoneSpec[]): ContainerSpec | undefined {
  const items: LRect[] = zones.map((z) => ({ id: z.id, x: z.x, y: z.y, w: z.w, h: z.h }));
  if (!items.length) return undefined;
  if (items.length === 1) {
    return { id: nextId("c"), direction: "vert", children: [{ zone: items[0].id }], name: "Body" };
  }
  const node = partition(items);
  if (!isContainer(node)) return { id: nextId("c"), direction: "vert", children: [node], name: "Body" };
  node.name = "Body";
  return node;
}

function fieldsForDomain(domain: string): SpecField[] {
  const def = DOMAIN_FIELDS[domain] ?? DOMAIN_FIELDS.generic;
  return [
    ...def.dims.map(([name, type]) => ({ name, type, role: "dimension" as const })),
    ...def.meas.map(([name, type]) => ({ name, type, role: "measure" as const })),
  ];
}

export function blankSpec(name = "Workbook"): WorkbookSpec {
  const fields = fieldsForDomain("generic");
  const dims = fields.filter((f) => f.role === "dimension");
  const meas = fields.filter((f) => f.role === "measure");
  const ws: WorksheetSpec = {
    id: nextId("ws"),
    name: "Sheet 1",
    mark: "Bar",
    dimension: dims[0]?.name,
    measures: [{ field: meas[0]?.name ?? "Value", agg: "Sum" }],
    dualAxis: false,
    showLabels: false,
  };
  const dash: DashboardSpec = {
    id: nextId("db"),
    name: "Dashboard",
    widthPx: 1280,
    heightPx: 800,
    bg: "#F4F5FB",
    zones: [
      { id: nextId("z"), kind: "text", x: 40, y: 24, w: 1200, h: 44, text: name, fontSize: 22, bold: true, fg: "#101828" },
      { id: nextId("z"), kind: "sheet", x: 40, y: 90, w: 1200, h: 660, worksheet: "Sheet 1", bg: "#FFFFFF" },
    ],
  };
  return {
    workbookName: name,
    tableauVersion: "2026.2",
    data: { fileName: "data.csv", fields, calcs: [], rows: generateSampleRows(fields) },
    worksheets: [ws],
    dashboards: [dash],
    actions: [],
    includeActions: false,
  };
}

/**
 * Sample dataset the SHEET/-tagged worksheets bind to — Superstore-style, the
 * shape LaDataViz used in multi.twbx. A `Region` CATEGORY dimension (so bars sum
 * to big realistic numbers like 739,814) AND a `Period` TIME dimension of
 * lexically-sortable quarters "2021 Q1".."2023 Q4" (so line/area charts read as
 * real upward trends, not flat blobs over 6 nominal categories). 4 regions × 12
 * quarters = 48 rows. Integer measures so labels are clean ("549,600", no ".00").
 */
function sampleData(): { fields: SpecField[]; rows: string[][] } {
  const fields: SpecField[] = [
    { name: "Region", type: "string", role: "dimension" },
    { name: "Period", type: "string", role: "dimension" },
    { name: "Sales", type: "integer", role: "measure" },
    { name: "Profit", type: "integer", role: "measure" },
  ];
  // Region weight (West highest → South lowest) and a per-quarter trend that
  // rises across the 3 years with seasonal dips — gives differentiated bar
  // totals and an interesting trend line.
  const regions: [string, number][] = [["West", 1.0], ["East", 0.92], ["Central", 0.66], ["South", 0.5]];
  const periodVal = [9, 14, 20, 11, 17, 23, 15, 21, 27, 18, 24, 30];
  const years = [2021, 2022, 2023];
  const rows: string[][] = [];
  for (const [rname, rmul] of regions) {
    let pi = 0;
    for (const y of years) {
      for (let q = 1; q <= 4; q++) {
        const pv = periodVal[pi++];
        const sales = Math.round(rmul * pv * 2400);
        const profit = Math.round(sales * (0.18 + 0.04 * rmul));
        rows.push([rname, `${y} Q${q}`, String(sales), String(profit)]);
      }
    }
  }
  return { fields, rows };
}

/** Coerce a faithful zone's mark tag to a valid MarkType (default Bar). */
function markTypeOf(chart: string | undefined): MarkType {
  const ok: MarkType[] = ["Bar", "Line", "Area", "Pie", "Circle"];
  return (ok.find((m) => m === chart) as MarkType) || "Bar";
}

/**
 * Build a WorkbookSpec that FAITHFULLY reproduces the Figma design as native
 * Tableau dashboard zones (LaDataViz style): text -> text zones, shapes ->
 * colored `empty` zones, icons -> bitmaps. EXCEPTION: any layer the designer
 * named "SHEET/Name[type]" becomes a REAL Tableau worksheet bound to the sample
 * data (mark class from the [type] tag) and placed at that layer's position —
 * exactly how LaDataViz built the live charts in Template.twbx. Text stays
 * faithful; only the SHEET/-tagged things become interactive sheets.
 */
/** Map a FILTER/<field> tag to a real string dimension in the sample data. */
function filterDimFor(label: string | undefined): string {
  const l = (label || "").toLowerCase();
  if (/period|time|date|quarter|month|year/.test(l)) return "Period";
  return "Region";
}

/**
 * Shared mutable state while assembling a faithful workbook. Worksheet names and
 * image filenames are WORKBOOK-global (Tableau maps windows/viewpoints + packaged
 * Image/ files by name), so when several frames each become a dashboard their
 * sheets/images must stay unique across ALL of them — this carries the running
 * dedupe set + counters across every dashboard.
 */
interface FaithfulCtx {
  worksheets: WorksheetSpec[];
  actions: ActionSpec[];
  used: Set<string>; // assigned worksheet names so far (dedupe across dashboards)
  imgN: number; // running image counter → unique Image/<name>_<n>.png
  sheetN: number; // running sheet counter → alternates the sample measure
  sheetIdToWs: Map<string, string>; // figma sheet-layer node id → worksheet name
  // Nav/ buttons awaiting target resolution once every dashboard/worksheet exists.
  navButtons: Array<{ zone: ZoneSpec; targetId?: string; targetFrameId?: string; isSheet?: boolean }>;
}

function uniqNameIn(ctx: FaithfulCtx, base: string): string {
  let n = (base || "Sheet").slice(0, 60);
  let i = 2;
  while (ctx.used.has(n)) n = `${(base || "Sheet").slice(0, 55)} ${i++}`;
  ctx.used.add(n);
  return n;
}

/** Resolve a list of dashboard titles to UNIQUE names ("X", "X 2", "X 3", …). */
function uniqueDashNames(titles: string[]): string[] {
  const seen = new Set<string>();
  return titles.map((raw) => {
    const base = (raw || "Dashboard").slice(0, 80) || "Dashboard";
    let n = base;
    let i = 2;
    while (seen.has(n)) n = `${base.slice(0, 76)} ${i++}`;
    seen.add(n);
    return n;
  });
}

/**
 * Build ONE dashboard from a faithful model, pushing its worksheets/actions into
 * the shared `ctx`. text -> text zones, shapes -> colored `empty` zones, icons ->
 * bitmaps; any "SHEET/Name[type]" layer becomes a REAL worksheet bound to the
 * sample data (mark from the [type] tag). FILTER/ cards are bound to a host sheet
 * by the caller (it needs the whole dashboard's sheets resolved first).
 */
function buildFaithfulDashboard(model: FaithfulModel, ctx: FaithfulCtx, dashName: string): DashboardSpec {

  // Make each chart cover the CONTAINER it sits in: if a rect (a Figma card
  // frame) snugly contains a SHEET zone, grow the sheet to that card's bounds,
  // inherit the card's corner radius, and DROP the card — the sheet's own
  // rounded white card then fills the container edge-to-edge instead of floating
  // inset with the card showing around it. Conservative: only a card-sized rect
  // (< 50% of the dashboard) that actually encloses the sheet qualifies.
  const dashArea = Math.max(1, model.width * model.height);
  const dropped = new Set<string>();
  for (const s of model.zones) {
    if (s.kind !== "sheet") continue;
    let best: (typeof model.zones)[number] | undefined;
    for (const r of model.zones) {
      if (r === s || r.kind !== "rect" || dropped.has(r.id)) continue;
      const encloses =
        r.x <= s.x + 2 && r.y <= s.y + 2 && r.x + r.w >= s.x + s.w - 2 && r.y + r.h >= s.y + s.h - 2;
      const cardLike = r.w * r.h <= dashArea * 0.5 && r.w * r.h > s.w * s.h;
      if (encloses && cardLike && (!best || r.w * r.h < best.w * best.h)) best = r;
    }
    if (best) {
      s.x = best.x;
      s.y = best.y;
      s.w = best.w;
      s.h = best.h;
      if (s.cornerRadius == null) s.cornerRadius = best.cornerRadius;
      dropped.add(best.id);
    }
  }
  const srcZones = model.zones.filter((z) => !dropped.has(z.id));

  const zones: ZoneSpec[] = srcZones.map((z) => {
    const base = { x: z.x, y: z.y, w: z.w, h: z.h, friendlyName: z.name };
    if (z.kind === "sheet") {
      const wsName = uniqNameIn(ctx, z.sheetName || z.name || "Sheet");
      ctx.sheetIdToWs.set(z.id, wsName); // so a Nav/ target can resolve to this sheet
      const mark = markTypeOf(z.chart);
      // Alternate the measure so adjacent sample charts aren't identical.
      const measure = ctx.sheetN++ % 2 === 0 ? "Sales" : "Profit";
      // Line/area read as a TIME TREND over Period; bars/others compare Regions.
      const isTrend = mark === "Line" || mark === "Area";
      const dimension = isTrend ? "Period" : "Region";
      ctx.worksheets.push({
        id: nextId("ws"),
        name: wsName,
        mark,
        dimension,
        measures: [{ field: measure, agg: "Sum" }],
        dualAxis: false,
        // Mark color: prefer the DESIGN's own chart color (sampled from the most
        // vivid fill inside the SHEET/ layer) so a blue mock exports a blue chart;
        // fall back to the LaDataViz neutral gray (#898989, used for every sheet
        // in multi.twbx) when the design had no confident colored fill. Value
        // labels are on for all marks; the pane chooses "all" for bars and
        // "line-ends" for line/area so only the end value shows.
        markColor: z.markColor || "#898989",
        showLabels: true,
      });
      // ":filter" / ":highlight" suffix -> a dashboard action sourced from this
      // sheet (confirmed XML: tsc:tsl-filter / tsc:brush, see Clinical Trials.twb).
      // The action targets THIS dashboard (its own name) so multi-dashboard
      // exports scope each action to the dashboard the source sheet lives on.
      if (z.actionKind === "filter") {
        ctx.actions.push({ id: nextId("act"), name: `Filter from ${wsName}`, kind: "filter", sourceSheet: wsName, target: dashName, runOn: "select" });
      } else if (z.actionKind === "highlight") {
        ctx.actions.push({ id: nextId("act"), name: `Highlight from ${wsName}`, kind: "highlight", sourceSheet: wsName, target: wsName, field: dimension, runOn: "select" });
      }
      return { id: nextId("z"), kind: "sheet" as const, ...base, worksheet: wsName, bg: "#FFFFFF", cornerRadius: z.cornerRadius, showTitle: z.showTitle || undefined };
    }
    if (z.kind === "filter") {
      // Real Tableau quick-filter card. Bound to a worksheet (set in the
      // post-pass below) on a string dimension from the sample data.
      return {
        id: nextId("z"),
        kind: "filter" as const,
        ...base,
        field: filterDimFor(z.filterField),
        bg: "#FFFFFF",
        fg: "#D7DAEC",
      };
    }
    if (z.kind === "web") {
      // Real Tableau web page object (type-v2='web').
      return { id: nextId("z"), kind: "web" as const, ...base, url: z.url };
    }
    if (z.kind === "button") {
      // Native Tableau navigation button. For a BUTTON/ layer, `targetDashboard`
      // holds the RAW target string parsed from the layer name. For a Nav/ layer,
      // the target comes from the Figma interaction (navTargetId/...) and is
      // resolved in assembleFaithfulWorkbook to a worksheet OR dashboard window.
      // Until then a target may be undefined (an unresolved button falls back to a
      // styled text zone in the generator — still load-safe).
      const zb: ZoneSpec = {
        id: nextId("z"),
        kind: "button" as const,
        ...base,
        text: z.label || z.name || "Button",
        targetDashboard: z.navTargetId ? undefined : z.target,
        bg: z.fill || "#2563EB",
        fg: z.fontColor || "#FFFFFF",
        fontSize: z.fontSize ? Math.round(z.fontSize) : 13,
        cornerRadius: z.cornerRadius,
        bold: true,
        align: 1,
      };
      if (z.navTargetId)
        ctx.navButtons.push({ zone: zb, targetId: z.navTargetId, targetFrameId: z.navTargetFrameId, isSheet: z.navTargetIsSheet });
      return zb;
    }
    if (z.kind === "text") {
      return {
        id: nextId("z"),
        kind: "text" as const,
        ...base,
        text: z.text,
        fontSize: z.fontSize ? Math.round(z.fontSize) : 14,
        fontFamily: z.fontFamily,
        fg: z.fontColor,
        bold: z.bold,
        align: z.align,
        runs: z.runs,
      };
    }
    if (z.kind === "image") {
      ctx.imgN++;
      return {
        id: nextId("z"),
        kind: "image" as const,
        ...base,
        image: z.imagePng,
        imageFile: `${slugFile(z.name || "img")}_${ctx.imgN}.png`,
        scaled: true,
      };
    }
    return {
      id: nextId("z"),
      kind: "rect" as const,
      ...base,
      bg: z.fill,
      cornerRadius: z.cornerRadius,
      strokeColor: z.strokeColor,
      strokeWidth: z.strokeWidth,
    };
  });

  return {
    id: nextId("db"),
    name: dashName,
    widthPx: Math.round(model.width),
    heightPx: Math.round(model.height),
    bg: model.background || "#FFFFFF",
    zones,
    layoutMode: "floating",
  };
}

/** A content zone (vs. a purely decorative rect / background). */
function isContentZone(z: ZoneSpec): boolean {
  return z.kind === "sheet" || z.kind === "text" || z.kind === "image" || z.kind === "filter" || z.kind === "web";
}

/**
 * Convert a FLOATING faithful dashboard into a RESPONSIVE one built from nested
 * Tableau `layout-flow` containers (the LaDataViz structure — its multi.twbx
 * nests 31 flow containers). We reuse the proven guillotine engine
 * (`inferLayoutTree`) + the generator's tiled path, both already shipping on the
 * heuristic path.
 *
 * Two faithful-specific cleanups first, because flow containers TILE (they can't
 * overlap) and — confirmed from every reference — a `layout-flow` zone may NOT
 * carry a background:
 *   1. Drop the full-frame background + any rect that ENCLOSES another content
 *      zone (a card/panel background). Otherwise it would overlap its contents in the
 *      flow, and we can't represent it as a container background. The page colour
 *      still comes from the dashboard's own outer zone-style; each chart keeps its
 *      white card via the tiled sheet `cardStyle`.
 *   2. Keep pure-leaf decorative rects (dividers / chips that enclose nothing) —
 *      they tile cleanly as `empty` zones.
 *
 * Mutates the dashboard in place. On any failure (or too few zones to tile) it
 * leaves the dashboard FLOATING — the Tableau-confirmed default — so flow mode
 * can never produce a worse result than exact mode.
 */
function applyFlowLayout(dash: DashboardSpec): void {
  const encloses = (r: ZoneSpec, o: ZoneSpec) =>
    r.x <= o.x + 2 && r.y <= o.y + 2 && r.x + r.w >= o.x + o.w - 2 && r.y + r.h >= o.y + o.h - 2;

  // A `layout-flow` container can't carry a background (confirmed: 0 references
  // do), so an enclosing card/panel rect is dropped. But rather than LOSE its
  // colour, PROPAGATE the card's background + corner onto the content tiles it
  // encloses — a leaf tile (sheet/text/kpi/filter) DOES render a background in
  // tiled mode, so the cards visually survive instead of going transparent. The
  // full-frame page background (a rect covering most of the dashboard) is skipped
  // (the page colour comes from the dashboard's own outer zone-style); only real
  // panel cards propagate. Smaller (inner) cards are applied last so they win.
  const dashArea = Math.max(1, dash.widthPx * dash.heightPx);
  const enclosingCards = dash.zones
    .filter((z) => z.kind === "rect" && dash.zones.some((o) => o !== z && isContentZone(o) && encloses(z, o)))
    .sort((a, b) => b.w * b.h - a.w * a.h); // largest first
  for (const card of enclosingCards) {
    if (!card.bg || card.w * card.h >= dashArea * 0.8) continue; // skip the page bg
    for (const o of dash.zones) {
      if (o === card || !isContentZone(o) || o.kind === "image" || !encloses(card, o)) continue;
      // Only fill a tile that has no distinct colour of its own (default white).
      if (!o.bg || o.bg === "#FFFFFF" || o.bg === "#FFFFFFFF") o.bg = card.bg;
      if (o.cornerRadius == null) o.cornerRadius = card.cornerRadius;
    }
  }
  const dropIds = new Set(enclosingCards.map((c) => c.id));
  const kept = dash.zones.filter((z) => !dropIds.has(z.id));
  // Need at least two tiles and at least one real content zone to bother tiling.
  if (kept.length < 2 || !kept.some(isContentZone)) return;
  let root: ContainerSpec | undefined;
  try {
    root = inferLayoutTree(kept);
  } catch {
    root = undefined;
  }
  if (!root) return;
  dash.zones = kept; // dropped rects must NOT linger (they'd float on top)
  dash.layoutMode = "tiled";
  dash.root = root;
}

/** Assemble a faithful workbook from one OR MORE models (one dashboard each). */
function assembleFaithfulWorkbook(
  models: FaithfulModel[],
  opts?: { layout?: "flow" | "floating" }
): WorkbookSpec {
  const { fields, rows } = sampleData();
  const ctx: FaithfulCtx = { worksheets: [], actions: [], used: new Set(), imgN: 0, sheetN: 0, sheetIdToWs: new Map(), navButtons: [] };
  // Dashboard names must be UNIQUE across the workbook: Tableau's <windows>
  // section enforces a unique-name (and unique simple-id) identity constraint, so
  // two frames named the same (e.g. several "Data Metrics") would otherwise fail
  // to load with D2E8DA72 "duplicate identity constraint". Resolve to unique names
  // up front so dashName flows consistently into the spec, actions, nav targets,
  // and the per-dashboard window uuid.
  const resolvedDashNames = uniqueDashNames(models.map((m) => m.title || "Dashboard"));
  const dashboards = models.map((m, i) => buildFaithfulDashboard(m, ctx, resolvedDashNames[i]));
  if (opts?.layout === "flow") for (const d of dashboards) applyFlowLayout(d);

  // A workbook needs >=1 worksheet. If NO design had a SHEET/-tagged layer, keep
  // one unplaced dummy so the faithful (text/shape) export still opens.
  if (ctx.worksheets.length === 0) {
    ctx.worksheets.push({
      id: nextId("ws"),
      name: "Sheet 1",
      mark: "Bar",
      dimension: "Region",
      measures: [{ field: "Sales", agg: "Sum" }],
      dualAxis: false,
      showLabels: false,
    });
  }

  // Bind every FILTER/ card to a host worksheet (a quick-filter card needs one).
  // Prefer the first real chart sheet ON THE CARD'S OWN DASHBOARD so the card
  // filters a view it sits beside; fall back to the first worksheet overall.
  for (const dash of dashboards) {
    const localHost = dash.zones.find((z) => z.kind === "sheet" && z.worksheet)?.worksheet;
    const host = localHost ?? ctx.worksheets[0].name;
    for (const zn of dash.zones) if (zn.kind === "filter" && !zn.worksheet) zn.worksheet = host;
  }

  // Nav/ buttons first: their target comes from the Figma interaction, resolved
  // here now that every dashboard/worksheet exists. A SHEET destination navigates
  // to that worksheet's window; any other destination navigates to its enclosing
  // dashboard. An unresolved destination leaves the button plain (load-safe). The
  // BUTTON/ name-convention loop below skips these (they're already resolved).
  const frameIdToDash = new Map<string, string>();
  models.forEach((m, i) => {
    if (m.id) frameIdToDash.set(m.id, resolvedDashNames[i]);
  });
  const navResolvedIds = new Set<string>();
  for (const nb of ctx.navButtons) {
    navResolvedIds.add(nb.zone.id);
    nb.zone.targetDashboard = undefined;
    nb.zone.targetWorksheet = undefined;
    if (nb.isSheet && nb.targetId && ctx.sheetIdToWs.has(nb.targetId)) {
      nb.zone.targetWorksheet = ctx.sheetIdToWs.get(nb.targetId);
    } else if (nb.targetFrameId && frameIdToDash.has(nb.targetFrameId)) {
      nb.zone.targetDashboard = frameIdToDash.get(nb.targetFrameId);
    }
  }

  // Resolve each navigation button's target to a REAL dashboard name now that all
  // dashboards exist. Match priority: (1) an explicit target (after ">"/"->" in
  // the layer name) that names another dashboard, case-insensitively; (2) when
  // there are exactly two dashboards, the OTHER one (the obvious A↔B toggle);
  // (3) the next dashboard in order (wrap-around). A button never targets its own
  // dashboard. If nothing resolves, targetDashboard is cleared and the generator
  // renders the button as a styled text zone (no navigation) — still load-safe.
  const dashNames = dashboards.map((d) => d.name);
  const findDash = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const t = raw.trim().toLowerCase();
    return dashNames.find((n) => n.toLowerCase() === t) ?? dashNames.find((n) => n.toLowerCase().includes(t));
  };
  for (let di = 0; di < dashboards.length; di++) {
    const dash = dashboards[di];
    for (const zn of dash.zones) {
      if (zn.kind !== "button") continue;
      if (navResolvedIds.has(zn.id)) continue; // Nav/ buttons resolved above
      const raw = zn.targetDashboard;
      let target: string | undefined;
      if (raw) {
        // Explicit "> Target": only honor a real dashboard match. A typo / a
        // target that doesn't exist is left UNresolved (plain button) rather than
        // silently navigating somewhere unexpected.
        target = findDash(raw);
      } else if (dashboards.length === 2) {
        target = dashNames[(di + 1) % 2]; // the obvious A↔B toggle
      } else if (dashboards.length > 2) {
        target = dashNames[(di + 1) % dashNames.length]; // next, wrap around
      }
      zn.targetDashboard = target && target !== dash.name ? target : undefined;
    }
  }

  const first = models[0];
  return {
    workbookName: (first?.title || "Workbook").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Workbook",
    tableauVersion: "2026.2",
    data: { fileName: "data.csv", fields, calcs: [], rows },
    worksheets: ctx.worksheets,
    dashboards,
    actions: ctx.actions,
    includeActions: ctx.actions.length > 0,
  };
}

/** Layout strategy for a faithful export. */
export type FaithfulLayout = "flow" | "floating";

/** Single-frame faithful workbook (one dashboard). */
export function faithfulSpec(model: FaithfulModel, layout: FaithfulLayout = "floating"): WorkbookSpec {
  return assembleFaithfulWorkbook([model], { layout });
}

/**
 * Multi-frame faithful workbook: each selected Figma frame becomes its own
 * Tableau dashboard, all sharing the one sample dataset, with worksheet names and
 * image filenames kept unique across every dashboard. `layout='flow'` builds
 * responsive nested layout-flow containers; the default `'floating'` keeps the
 * Tableau-confirmed pixel-exact absolute layout.
 */
export function faithfulSpecMulti(models: FaithfulModel[], layout: FaithfulLayout = "floating"): WorkbookSpec {
  return assembleFaithfulWorkbook(models, { layout });
}

export function seedSpecFromModel(model: DashboardModel): WorkbookSpec {
  const domain = detectDomain(model);
  const fields = fieldsForDomain(domain);
  const dims = fields.filter((f) => f.role === "dimension");
  const meas = fields.filter((f) => f.role === "measure");

  const worksheets: WorksheetSpec[] = [];
  const zones: ZoneSpec[] = [];
  const used = new Set<string>();
  const uniq = (base: string) => {
    let n = (base || "Sheet").slice(0, 60).trim() || "Sheet";
    let i = 2;
    while (used.has(n)) n = `${base} ${i++}`;
    used.add(n);
    return n;
  };

  let imgN = 0;

  let combo = 0;
  for (const e of model.elements) {
    if (e.role === "ignore") continue;
    const base = { x: e.rect.x, y: e.rect.y, w: e.rect.w, h: e.rect.h };
    const zoneId = nextId("z");
    const before = zones.length;
    if (e.role === "worksheet") {
      const name = uniq(e.name || "Sheet");
      const dim = dims[combo % dims.length];
      const m = meas[combo % meas.length];
      combo++;
      worksheets.push({
        id: nextId("ws"),
        name,
        mark: markFor(e.chartKind),
        dimension: dim?.name,
        measures: [{ field: m?.name ?? "Value", agg: "Sum" }],
        dualAxis: false,
        colorField: markFor(e.chartKind) === "Line" ? undefined : dim?.name,
        showLabels: false,
      });
      zones.push({ id: zoneId, kind: "sheet", ...base, worksheet: name, bg: e.fill?.hex || "#FFFFFF" });
    } else if (e.role === "image" && e.imagePng) {
      zones.push({
        id: zoneId,
        kind: "image",
        ...base,
        image: e.imagePng,
        imageFile: `${slugFile(e.name || `image_${++imgN}`)}.png`,
        scaled: true,
      });
    } else if (e.role === "kpi") {
      // Every KPI is a real Tableau worksheet (a "big number": Text mark, one
      // measure, no dimension) — so the dashboard is all sheets, no text tiles.
      const name = uniq(e.name || "KPI");
      const m = meas[combo % meas.length];
      combo++;
      worksheets.push({
        id: nextId("ws"),
        name,
        mark: "Text",
        measures: [{ field: m?.name ?? "Value", agg: "Sum" }],
        dualAxis: false,
        showLabels: true,
        kpi: true,
      });
      zones.push({ id: zoneId, kind: "sheet", ...base, worksheet: name, bg: e.fill?.hex || "#FFFFFF", isKpi: true });
    } else if (e.role === "button") {
      zones.push({
        id: zoneId,
        kind: "button",
        ...base,
        text: e.name || "Button",
        bg: e.fill?.hex || "#2563EB",
        fg: "#FFFFFF",
        fontSize: e.fontSize ? Math.round(e.fontSize) : 13,
        bold: true,
        align: 1,
      });
    } else if (e.role === "filter") {
      zones.push({ id: zoneId, kind: "text", ...base, text: e.name || "Filter", fontSize: 13, fg: "#101828", bg: e.fill?.hex || "#FFFFFF", align: 1 });
    } else if (e.role === "text") {
      const txt = (e.text || e.name || "").split("\n").slice(0, 3).join("\n");
      // Only real, non-trivial text becomes a zone — an EMPTY Tableau text
      // object renders as an ugly dashed placeholder box, so we skip those.
      if (txt.trim().length >= 2)
        zones.push({ id: zoneId, kind: "text", ...base, text: txt, fontSize: e.fontSize ? Math.round(e.fontSize) : 14, bold: e.bold, fg: e.fill?.hex || "#101828" });
    }
    // NOTE: pure `container` fills are intentionally dropped — they previously
    // became empty text zones (the dashed placeholder boxes the user saw).
    if (zones.length > before) {
      zones[zones.length - 1].friendlyName = e.name;
    }
  }

  if (worksheets.length === 0) {
    const name = uniq("Sheet 1");
    worksheets.push({ id: nextId("ws"), name, mark: "Bar", dimension: dims[0]?.name, measures: [{ field: meas[0]?.name ?? "Value", agg: "Sum" }], dualAxis: false, colorField: dims[0]?.name, showLabels: false });
    zones.push({ id: nextId("z"), kind: "sheet", x: 40, y: 90, w: model.width - 80, h: model.height - 130, worksheet: name, bg: "#FFFFFF" });
  }

  // Reconstruct a clean nested layout-flow tree from the placed zones' geometry
  // (recursive guillotine partitioning). This is independent of the Figma
  // nesting — it works on a flat pile of absolutely-positioned layers just as
  // well as on tidy Auto-Layout frames, so a real-world 2D design (sidebar +
  // header + content) tiles correctly instead of falling back to (truncating,
  // overlapping) floating. Guarded: a failure leaves root undefined -> floating.
  let root: ContainerSpec | undefined;
  try {
    root = inferLayoutTree(zones);
  } catch {
    root = undefined;
  }

  const dash: DashboardSpec = {
    id: nextId("db"),
    name: model.title || "Dashboard",
    widthPx: Math.round(model.width),
    heightPx: Math.round(model.height),
    bg: model.background?.hex || "#F4F5FB",
    zones,
    layoutMode: root ? "tiled" : "floating",
    root,
  };

  return {
    workbookName: (model.title || "Workbook").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Workbook",
    tableauVersion: "2026.2",
    data: { fileName: "data.csv", fields, calcs: [], rows: generateSampleRows(fields) },
    worksheets,
    dashboards: [dash],
    actions: [],
    includeActions: false,
  };
}
