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
import { nextId, isContainer, DEFAULT_EXPORT_OPTIONS } from "../shared/spec";
import { DOMAIN_KEYWORDS, DOMAIN_FIELDS, DOMAIN_ACCENTS } from "../shared/constants";
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
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
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

/**
 * A domain-flavored placeholder dataset. `catDim` is the category dimension
 * (bars/pies/scatter compare it), `trendDim` the time dimension (line/area trend
 * over it), and `meas` the two measures. So a Clinical template exports charts of
 * Admissions by Department / over Month — not the generic Sales-by-Region data.
 */
interface DomainDataset {
  fields: SpecField[];
  rows: string[][];
  catDim: string;
  trendDim: string;
  meas: [string, string];
  accent?: string; // domain accent (#hex) — default chart mark color
}

/** Per-domain placeholder data: realistic category members, time periods and two
 * measures, so a template's sample charts read as that domain (see DomainDataset). */
const DOMAIN_DATASETS: Record<
  string,
  {
    catDim: string;
    cats: [string, number][]; // [member, relative weight]
    trendDim: string;
    periods: string[];
    meas: [string, string];
    scale: number; // magnitude of the first measure
    ratio: number; // second measure ≈ first × ratio
  }
> = {
  clinical: {
    catDim: "Department",
    cats: [["Cardiology", 1.0], ["Oncology", 0.82], ["Neurology", 0.7], ["Emergency", 0.95], ["Pediatrics", 0.6]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Admissions", "Readmissions"],
    scale: 220,
    ratio: 0.08,
  },
  sales: {
    catDim: "Region",
    cats: [["North", 1.0], ["South", 0.72], ["East", 0.9], ["West", 0.63]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Revenue", "Orders"],
    scale: 48000,
    ratio: 0.015,
  },
  finance: {
    catDim: "Category",
    cats: [["Operations", 1.0], ["Marketing", 0.55], ["R&D", 0.78], ["Sales", 0.92], ["Admin", 0.4]],
    trendDim: "Quarter",
    periods: ["2022 Q1", "2022 Q2", "2022 Q3", "2022 Q4", "2023 Q1", "2023 Q2", "2023 Q3", "2023 Q4"],
    meas: ["Revenue", "Expense"],
    scale: 120000,
    ratio: 0.62,
  },
  ops: {
    catDim: "Department",
    cats: [["Assembly", 1.0], ["Packaging", 0.85], ["Molding", 0.7], ["Finishing", 0.6]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Output", "Downtime"],
    scale: 1500,
    ratio: 0.05,
  },
  executive: {
    catDim: "Channel",
    cats: [["Direct", 1.0], ["Online", 0.9], ["Partner", 0.62], ["Retail", 0.75]],
    trendDim: "Quarter",
    periods: ["2022 Q1", "2022 Q2", "2022 Q3", "2022 Q4", "2023 Q1", "2023 Q2", "2023 Q3", "2023 Q4"],
    meas: ["Revenue", "Growth"],
    scale: 90000,
    ratio: 0.04,
  },
  marketing: {
    catDim: "Channel",
    cats: [["Email", 1.0], ["Social", 0.85], ["Search", 0.95], ["Display", 0.55], ["Referral", 0.45]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Leads", "Conversions"],
    scale: 820,
    ratio: 0.14,
  },
  hr: {
    catDim: "Department",
    cats: [["Engineering", 1.0], ["Sales", 0.8], ["Marketing", 0.5], ["Support", 0.65], ["Operations", 0.72]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Headcount", "Attrition"],
    scale: 140,
    ratio: 0.07,
  },
  supplychain: {
    catDim: "Warehouse",
    cats: [["North DC", 1.0], ["South DC", 0.8], ["East DC", 0.9], ["West DC", 0.68]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Shipments", "Backorders"],
    scale: 1300,
    ratio: 0.06,
  },
  support: {
    catDim: "Channel",
    cats: [["Email", 1.0], ["Chat", 0.9], ["Phone", 0.72], ["Social", 0.48]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Tickets", "Resolved"],
    scale: 640,
    ratio: 0.88,
  },
  product: {
    catDim: "Feature",
    cats: [["Dashboards", 1.0], ["Reports", 0.82], ["Search", 0.7], ["Mobile", 0.6], ["API", 0.5]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Active Users", "Sessions"],
    scale: 5200,
    ratio: 2.4,
  },
  itops: {
    catDim: "Service",
    cats: [["API", 1.0], ["Web", 0.9], ["Database", 0.72], ["Auth", 0.6], ["CDN", 0.82]],
    trendDim: "Day",
    periods: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    meas: ["Requests", "Errors"],
    scale: 9200,
    ratio: 0.02,
  },
  manufacturing: {
    catDim: "Line",
    cats: [["Line 1", 1.0], ["Line 2", 0.86], ["Line 3", 0.7], ["Line 4", 0.6]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Units", "Defects"],
    scale: 2100,
    ratio: 0.03,
  },
  retail: {
    catDim: "Category",
    cats: [["Apparel", 1.0], ["Electronics", 0.92], ["Home", 0.72], ["Beauty", 0.6], ["Grocery", 0.85]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Revenue", "Units"],
    scale: 52000,
    ratio: 0.02,
  },
  project: {
    catDim: "Team",
    cats: [["Alpha", 1.0], ["Beta", 0.82], ["Gamma", 0.7], ["Delta", 0.6]],
    trendDim: "Sprint",
    periods: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
    meas: ["Completed", "Open"],
    scale: 48,
    ratio: 0.42,
  },
  esg: {
    catDim: "Facility",
    cats: [["Plant A", 1.0], ["Plant B", 0.8], ["Plant C", 0.62], ["HQ Office", 0.4]],
    trendDim: "Quarter",
    periods: ["2022 Q1", "2022 Q2", "2022 Q3", "2022 Q4", "2023 Q1", "2023 Q2", "2023 Q3", "2023 Q4"],
    meas: ["Emissions", "Renewable"],
    scale: 900,
    ratio: 0.55,
  },
};

/** Build a domain dataset from its config — a rising trend with a gentle seasonal
 * wobble across the periods, weighted per category, mirroring sampleData's shape. */
function buildDomainDataset(cfg: (typeof DOMAIN_DATASETS)[string]): DomainDataset {
  const fields: SpecField[] = [
    { name: cfg.catDim, type: "string", role: "dimension" },
    { name: cfg.trendDim, type: "string", role: "dimension" },
    { name: cfg.meas[0], type: "integer", role: "measure" },
    { name: cfg.meas[1], type: "integer", role: "measure" },
  ];
  const n = cfg.periods.length;
  const rows: string[][] = [];
  for (const [cname, cmul] of cfg.cats) {
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const trend = 0.6 + 0.8 * t + 0.15 * Math.sin(i * 1.7); // rises with a wobble
      const m0 = Math.max(1, Math.round(cmul * trend * cfg.scale));
      const m1 = Math.max(1, Math.round(m0 * cfg.ratio * (0.9 + 0.2 * cmul)));
      rows.push([cname, cfg.periods[i], String(m0), String(m1)]);
    }
  }
  return { fields, rows, catDim: cfg.catDim, trendDim: cfg.trendDim, meas: cfg.meas };
}

/** The primary datasource name (matches workbookGenerator's PRIMARY_DS). */
const PRIMARY_DS = "federated.fig";

/** Human label for a domain, used as a datasource caption ("Sales Data"). */
function domainLabel(domain: string): string {
  const map: Record<string, string> = {
    clinical: "Clinical", sales: "Sales", finance: "Finance", ops: "Operations",
    executive: "Executive", marketing: "Marketing", hr: "HR", supplychain: "Supply Chain",
    support: "Customer Support", product: "Product Analytics", itops: "IT Operations",
    manufacturing: "Manufacturing", retail: "Retail", project: "Project Management",
    esg: "ESG", generic: "Sample",
  };
  return map[domain] ?? "Sample";
}

/** Resolve a domain name to its dataset; unknown/"generic" reuses sampleData so
 * ordinary (non-template) designs keep the original Region/Period/Sales/Profit. */
function domainDatasetFor(domain: string): DomainDataset {
  const cfg = DOMAIN_DATASETS[domain];
  if (!cfg) {
    const { fields, rows } = sampleData();
    return { fields, rows, catDim: "Region", trendDim: "Period", meas: ["Sales", "Profit"] };
  }
  const ds = buildDomainDataset(cfg);
  ds.accent = DOMAIN_ACCENTS[domain];
  return ds;
}

/** Detect the dashboard domain from the frame title + layer/sheet/text names, so
 * templates ("Clinical Dashboard", "Sales Dashboard"…) get domain-matched data. */
function detectFaithfulDomain(models: FaithfulModel[]): string {
  const hay = models
    .map((m) => (m.title || "") + " " + m.zones.map((z) => `${z.name || ""} ${z.sheetName || ""} ${z.text || ""}`).join(" "))
    .join(" ")
    .toLowerCase();
  for (const { domain, words } of DOMAIN_KEYWORDS) if (words.some((w) => hay.includes(w))) return domain;
  return "generic";
}

/** Coerce a faithful zone's mark tag to a valid MarkType (default Bar). Includes
 * Square (heatmap) and Text (text table) — both confirmed-loadable mark classes
 * (Text is what KPI/nav button-worksheets already use). */
function markTypeOf(chart: string | undefined): MarkType {
  const ok: MarkType[] = ["Bar", "Line", "Area", "Pie", "Circle", "Square", "Text"];
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
/** Map a FILTER/<field> tag to a real string dimension in the dataset: bind to a
 * data dimension the label names outright, else to the time or category dim. */
function filterDimFor(label: string | undefined, data: DomainDataset): string {
  const l = (label || "").toLowerCase();
  const named = data.fields.find((f) => f.role === "dimension" && f.name.toLowerCase() === l);
  if (named) return named.name;
  if (/period|time|date|quarter|month|year|week|day/.test(l)) return data.trendDim;
  return data.catDim;
}

/**
 * Shared mutable state while assembling a faithful workbook. Worksheet names and
 * image filenames are WORKBOOK-global (Tableau maps windows/viewpoints + packaged
 * Image/ files by name), so when several frames each become a dashboard their
 * sheets/images must stay unique across ALL of them — this carries the running
 * dedupe set + counters across every dashboard.
 */
interface FaithfulCtx {
  data: DomainDataset; // domain-matched placeholder fields/rows the sheets bind to
  worksheets: WorksheetSpec[];
  actions: ActionSpec[];
  used: Set<string>; // assigned worksheet names so far (dedupe across dashboards)
  imgN: number; // running image counter → unique Image/<name>_<n>.png
  sheetN: number; // running sheet counter → alternates the sample measure
  sheetIdToWs: Map<string, string>; // figma sheet-layer node id → worksheet name
  // Navigation buttons (rendered as button-worksheets) awaiting target resolution
  // once every dashboard/worksheet exists → each becomes a <nav-action>.
  navButtons: Array<{
    buttonWs: string; // the button-worksheet's name (the nav-action source)
    sourceDash: string; // the dashboard the button sits on
    isNav?: boolean; // true = Nav/ (interaction-driven); false = BUTTON/ (name)
    nameTarget?: string; // BUTTON/ "> Target" name
    targetId?: string; // Nav/ reaction destination node id
    targetFrameId?: string; // Nav/ destination's enclosing frame
    isSheet?: boolean; // Nav/ destination is a SHEET node
  }>;
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
function buildFaithfulDashboard(
  model: FaithfulModel,
  ctx: FaithfulCtx,
  dashName: string,
  data: DomainDataset,
  dsName: string,
): DashboardSpec {

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
      // Line/area read as a TIME TREND over the time dim; bars/pies/etc. compare
      // the category dim. A scatter needs TWO measures (X vs Y) so it renders as a
      // real point cloud instead of the same dot-row a pie would — every other
      // mark alternates the single measure so adjacent sample charts differ.
      const isTrend = mark === "Line" || mark === "Area";
      const dimension = isTrend ? data.trendDim : data.catDim;
      const measures =
        mark === "Circle"
          ? [{ field: data.meas[0], agg: "Sum" as const }, { field: data.meas[1], agg: "Sum" as const }]
          : [{ field: ctx.sheetN++ % 2 === 0 ? data.meas[0] : data.meas[1], agg: "Sum" as const }];
      ctx.worksheets.push({
        id: nextId("ws"),
        name: wsName,
        mark,
        dimension,
        measures,
        dualAxis: false,
        // Mark color: prefer the DESIGN's own chart color (sampled from the most
        // vivid fill inside the SHEET/ layer) so a blue mock exports a blue chart;
        // then the detected domain's accent (a clinical dashboard gets cyan charts,
        // sales gets green…); finally the LaDataViz neutral gray (#898989, used for
        // every sheet in multi.twbx). Value labels are on for all marks; the pane
        // chooses "all" for bars and "line-ends" for line/area.
        markColor: z.markColor || data.accent || "#898989",
        showLabels: true,
        // Bind to this dashboard's own datasource so each domain's charts show
        // their own data (primary domain leaves dsName undefined = federated.fig).
        dsName: dsName === PRIMARY_DS ? undefined : dsName,
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
      // Show the worksheet's title by default (the "Show Title" checkbox stays
      // CHECKED) so every chart is labelled by its own Tableau title bar.
      // baseSheetName carries the PRE-dedupe name so a worksheet-swap can repoint
      // every "X"/"X 2" copy of the same SHEET/ at the one imported sheet.
      return { id: nextId("z"), kind: "sheet" as const, ...base, worksheet: wsName, baseSheetName: z.sheetName || z.name || wsName, bg: "#FFFFFF", cornerRadius: z.cornerRadius, showTitle: true };
    }
    if (z.kind === "filter") {
      // Real Tableau quick-filter card. Bound to a worksheet (set in the
      // post-pass below) on a string dimension from the sample data.
      return {
        id: nextId("z"),
        kind: "filter" as const,
        ...base,
        field: filterDimFor(z.filterField, data),
        bg: "#FFFFFF",
        fg: "#D7DAEC",
      };
    }
    if (z.kind === "web") {
      // Real Tableau web page object (type-v2='web').
      return { id: nextId("z"), kind: "web" as const, ...base, url: z.url };
    }
    if (z.kind === "button") {
      // A navigation button becomes a BUTTON-WORKSHEET (a Text-mark sheet showing
      // the caption on a colored background) placed as a sheet zone; a <nav-action>
      // sourced from it (built in assembleFaithfulWorkbook) does the navigation.
      // This is the only nav mechanism the user's Tableau accepts — the native
      // <button> dashboard-object is rejected (D2E8DA72) in a floating dashboard.
      const caption = z.label || z.name || "Button";
      const btnWs = uniqNameIn(ctx, (caption || "Button").slice(0, 40));
      ctx.worksheets.push({
        id: nextId("ws"),
        name: btnWs,
        mark: "Text",
        measures: [],
        dualAxis: false,
        showLabels: true,
        navButton: {
          caption,
          bg: z.fill || "#2563EB",
          fg: z.fontColor || "#FFFFFF",
          fontSize: z.fontSize ? Math.round(z.fontSize) : 13,
        },
      });
      ctx.navButtons.push({
        buttonWs: btnWs,
        sourceDash: dashName,
        isNav: z.isNav,
        nameTarget: z.target,
        targetId: z.navTargetId,
        targetFrameId: z.navTargetFrameId,
        isSheet: z.navTargetIsSheet,
      });
      // showTitle:false so dropFigmaTitles (which only touches titled chart sheets)
      // leaves this button alone; the worksheet itself draws the caption.
      // pinned:true so tiled mode keeps the button at its Figma size instead of
      // flexing it to a chart-sized tile (only real chart sheets flex).
      return { id: nextId("z"), kind: "sheet" as const, ...base, worksheet: btnWs, bg: z.fill || "#2563EB", cornerRadius: z.cornerRadius, showTitle: false, pinned: true };
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

  // Move all FILTER/ zones to a right-side sidebar so they don't interfere with
  // the chart/table layout. Filters are stacked vertically from the top, right-
  // aligned. Each keeps its original height; width is the max filter width.
  const filterZones = zones.filter((z) => z.kind === "filter");
  if (filterZones.length > 0) {
    const gap = 8;
    const sideW = Math.max(...filterZones.map((z) => z.w), 180);
    const sideX = Math.round(model.width) - sideW - 12;
    let accY = 12;
    for (const fz of filterZones) {
      fz.x = sideX;
      fz.y = accY;
      fz.w = sideW;
      accY += fz.h + gap;
    }
  }

  return {
    id: nextId("db"),
    name: dashName,
    widthPx: Math.round(model.width),
    heightPx: Math.round(model.height),
    bg: model.background || "#FFFFFF",
    zones: dropFigmaTitles(zones),
    layoutMode: "floating",
  };
}

/**
 * Drop each chart's redundant Figma heading text. Every SHEET zone now shows its
 * own Tableau title bar (the worksheet name), so a text layer the designer drew as
 * that chart's title — at the top INSIDE the card or JUST ABOVE it — would just
 * duplicate it. For each sheet we remove the single best-matching heading: a SHORT
 * text zone whose width fits within the sheet's (so a wide dashboard/section title
 * spanning several charts is never removed) and that sits in the sheet's title
 * band (from ~60px above its top down into its top quarter). Body text, value
 * labels, and text not tied to a chart are left untouched. Conservative by design:
 * at most one heading per sheet, and only a confidently chart-scoped one.
 */
function dropFigmaTitles(zones: ZoneSpec[]): ZoneSpec[] {
  // Only titled CHART sheets duplicate a heading; button-worksheet sheets (and any
  // other show-title='false' sheet) are skipped so their nearby text is kept.
  const sheets = zones.filter((z) => z.kind === "sheet" && z.showTitle === true);
  if (!sheets.length) return zones;
  const remove = new Set<string>();
  const ABOVE = 60; // px a heading may sit above the sheet's top
  for (const s of sheets) {
    let best: ZoneSpec | undefined;
    let bestDist = Infinity;
    for (const t of zones) {
      if (t.kind !== "text" || remove.has(t.id) || !t.text) continue;
      // Width fits within the sheet (+ small slack): excludes wide section/page
      // titles that span multiple charts, and overlaps this sheet horizontally.
      const hOK = t.x >= s.x - 16 && t.x + t.w <= s.x + s.w + 16 && t.x < s.x + s.w && t.x + t.w > s.x;
      // In the title band: a little above the sheet, down into its top quarter.
      const vOK = t.y >= s.y - ABOVE && t.y <= s.y + s.h * 0.25;
      if (!hOK || !vOK) continue;
      // A heading is short (a line or two, not a paragraph).
      if (t.text.trim().length > 60 || t.text.split("\n").length > 2) continue;
      const dist = Math.abs(t.y - s.y);
      if (dist < bestDist) {
        best = t;
        bestDist = dist;
      }
    }
    if (best) remove.add(best.id);
  }
  return remove.size ? zones.filter((z) => !remove.has(z.id)) : zones;
}

/** A content zone (vs. a purely decorative rect / background). Used for card
 *  color propagation: a panel rect propagates its color onto the content zones
 *  it encloses. Text is included so text labels inside a panel card get the
 *  card's tint before being excluded from the layout tree (they float on top). */
function isContentZone(z: ZoneSpec): boolean {
  return z.kind === "sheet" || z.kind === "text" || z.kind === "image" || z.kind === "filter" || z.kind === "web";
}

/** A structural zone that should participate in the tiled flow layout tree.
 *  All content zones participate — sheets, images, filters, web, buttons, AND
 *  all text zones regardless of height. Previously text <40px was floated to
 *  avoid micro-rows, but floating text at absolute positions overlaps flow
 *  containers (whose sequential layout ignores y), causing both visual clutter
 *  and Tableau re-calc loops. Putting every text zone in the tree, pinned to
 *  its native fixed-size, eliminates overlap entirely. Rects handled separately
 *  (card propagation / dropped). */
function isStructuralZone(z: ZoneSpec): boolean {
  return z.kind === "sheet" || z.kind === "image" || z.kind === "filter" || z.kind === "web" || z.kind === "button" || z.kind === "text";
}

/**
 * Convert a FLOATING faithful dashboard into a RESPONSIVE one built from nested
 * Tableau `layout-flow` containers (the LaDataViz structure — its multi.twbx
 * nests 31 flow containers). We reuse the proven guillotine engine
 * (`inferLayoutTree`) + the generator's tiled path, both already shipping on the
 * heuristic path.
 *
 * ALL content zones (sheets, images, filters, web, buttons, text) participate
 * in the flow container tree — no floating text. Putting every text zone in the
 * tree with fixed-size eliminates the overlap between floating labels and flow
 * containers that caused visual clutter and continuous re-calc loops.
 *
 * Faithful-specific cleanups first, because flow containers TILE (they can't
 * overlap) and — confirmed from every reference — a `layout-flow` zone may NOT
 * carry a background:
 *   1. Card colors are PROPAGATED to the content tiles an enclosing card rect
 *      covers, so the panel's tint visually survives the card's removal.
 *   2. ALL rect zones are then dropped — a tiled dashboard resizes/reflows, so
 *      any absolutely-positioned decorative rect (page background, card, divider)
 *      would end up floating OVER the flow tree and misaligned the moment the
 *      layout reflows (floating-over-flow overlap is also what caused the visual
 *      clutter + Tableau re-calc loops this module's history records). The page
 *      colour still comes from the dashboard's own outer zone-style; each chart
 *      keeps its white rounded card via the tiled sheet zone-style.
 *   3. A KPI card enclosing several text layers becomes a vert group container:
 *      the member text tiles keep the card's tint and tinted SPACER tiles (empty
 *      zones with the card bg) fill the card's uncovered bands — the whole card
 *      area reads as one tinted card, fully inside the flow tree (no floating
 *      background rect that would detach on resize).
 *   4. FILTER/ cards (relocated to an absolute right strip by the dashboard
 *      builder, where they may overlap charts) are excluded from the guillotine
 *      and re-attached as a HEIGHT-PINNED filter bar row across the top (a
 *      fixed-width sidebar is impossible: distribute-evenly ignores width pins,
 *      so a sidebar always equalized to ~half the dashboard).
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
  // Track which text zones each card encloses, plus the card's own visual props
  // and geometry, so text siblings can be grouped AND a background rect can be
  // recreated at the card's exact position/size (not the text union bounds).
  const cardToTextInfo = new Map<string, { textIds: string[]; bg: string; x: number; y: number; w: number; h: number; cornerRadius?: number }>();
  for (const card of enclosingCards) {
    if (!card.bg || card.w * card.h >= dashArea * 0.8) continue; // skip the page bg
    const textIds: string[] = [];
    for (const o of dash.zones) {
      if (o === card || !isContentZone(o) || o.kind === "image" || !encloses(card, o)) continue;
      // Only fill a tile that has no distinct colour of its own (default white).
      if (!o.bg || o.bg === "#FFFFFF" || o.bg === "#FFFFFFFF") o.bg = card.bg;
      if (o.cornerRadius == null) o.cornerRadius = card.cornerRadius;
      if (o.kind === "text") textIds.push(o.id);
    }
    if (textIds.length > 1) cardToTextInfo.set(card.id, { textIds, bg: card.bg, x: card.x, y: card.y, w: card.w, h: card.h, cornerRadius: card.cornerRadius });
  }
  // Drop EVERY rect (enclosing cards AND loose decorative rects/dividers): a
  // tiled dashboard reflows, so an absolutely-positioned rect would float over
  // the flow tree and detach from it on resize. Colors were propagated above.
  const kept = dash.zones.filter((z) => z.kind !== "rect");
  const structural = kept.filter(isStructuralZone);
  // FILTER/ cards were relocated to an absolute right strip (possibly on top of
  // charts) — keep them OUT of the guillotine and re-attach them as a dedicated
  // right sidebar container after the tree is built.
  const filterTiles = structural.filter((z) => z.kind === "filter");
  const bodyTiles = structural.filter((z) => z.kind !== "filter");
  if (bodyTiles.length < 2) return;

  // Group text zones so sibling labels inside the same card stay as one tile.
  // Without this, each separate text layer of a KPI (label/value/delta) becomes
  // its own structural element and gets split into separate tiles — the
  // guillotine sees the gap between adjacent text zones (they touch but don't
  // overlap) and treats the boundary as a gutter.
  //
  // Two sources of sibling text zones:
  //   1. #L zones — a single multi-line text node split per line in faithful.ts
  //      (ids end with "#L0", "#L1", etc.)
  //   2. Separate text layers inside the same card — three distinct Figma text
  //      layers grouped by their enclosing card rect.
  interface TextGroupInfo {
    textIds: string[];
    bg: string;
    x: number;
    y: number;
    w: number;
    h: number;
    cornerRadius?: number;
  }
  const cardTextGroups = new Map<string, TextGroupInfo>(); // gid -> info
  const lineGroups = new Map<string, ZoneSpec[]>();        // #L base id -> members
  const groupRepIds = new Set<string>();

  // First pass: detect #L groups (multi-line text splits)
  for (const z of bodyTiles) {
    const m = /^(.*)#L(\d+)$/.exec(z.id || "");
    if (m) {
      const g = lineGroups.get(m[1]);
      if (g) g.push(z);
      else lineGroups.set(m[1], [z]);
    }
  }
  // Second pass: detect card-based text groups (separate layers).
  // Build a set of zone ids already claimed by #L groups so we don't double-group.
  const lineGroupIds = new Set<string>();
  for (const members of lineGroups.values()) for (const m of members) lineGroupIds.add(m.id);
  const usedInCardGroup = new Set<string>();
  for (const [cardId, info] of cardToTextInfo) {
    const available = info.textIds.filter((id) => !lineGroupIds.has(id));
    if (available.length > 1) {
      const gid = `@cardtext:${cardId}`;
      cardTextGroups.set(gid, { textIds: available, bg: info.bg, x: info.x, y: info.y, w: info.w, h: info.h, cornerRadius: info.cornerRadius });
      for (const id of available) usedInCardGroup.add(id);
    }
  }

  // Build the structural set: standalone zones + #L group reps + card text group reps
  const structuralList: ZoneSpec[] = bodyTiles.filter((z) => {
    if (lineGroupIds.has(z.id)) return false;
    if (usedInCardGroup.has(z.id)) return false;
    return true;
  });

  // Add #L group representatives
  for (const [baseId, members] of lineGroups) {
    members.sort((a, b) => a.y - b.y);
    const repId = `@group:${baseId}`;
    structuralList.push({
      id: repId,
      kind: "text",
      x: Math.min(...members.map((z) => z.x)),
      y: Math.min(...members.map((z) => z.y)),
      w: Math.max(...members.map((z) => z.x + z.w)) - Math.min(...members.map((z) => z.x)),
      h: Math.max(...members.map((z) => z.y + z.h)) - Math.min(...members.map((z) => z.y)),
    });
    groupRepIds.add(repId);
  }

  // Add card text group representatives — use the CARD's own rect so the flow
  // container is positioned at the card's bounds, aligning with the background
  // rect and keeping text inside the card.
  for (const [gid, info] of cardTextGroups) {
    const members = info.textIds.map((id) => bodyTiles.find((z) => z.id === id)).filter((z): z is ZoneSpec => !!z);
    if (members.length < 2) continue;
    structuralList.push({
      id: gid,
      kind: "text",
      x: info.x,
      y: info.y,
      w: info.w,
      h: info.h,
    });
    groupRepIds.add(gid);
  }

  let root: ContainerSpec | undefined;
  try {
    root = inferLayoutTree(structuralList);
  } catch {
    root = undefined;
  }
  if (!root) return;

  // Walk the tree and replace each group-rep leaf with a vert container that
  // holds the individual text zones, so the generator emits them together.
  //
  // A CARD group's members keep the card tint propagated onto them earlier, and
  // tinted SPACER tiles (empty zones with the card bg, pinned to the gap height)
  // fill the card's uncovered bands (above/between/below the text layers) — so
  // the whole card area renders as ONE tinted card, entirely inside the flow
  // tree. (The previous approach — a floating background rect behind the tiles —
  // overlapped the flow containers and detached from them on resize.)
  const spacerZones: ZoneSpec[] = [];
  const expandTextGroups = (node: LayoutNode): void => {
    if (!isContainer(node)) return;
    for (let i = 0; i < node.children.length; i++) {
      const ch = node.children[i];
      if (!isContainer(ch) && groupRepIds.has(ch.zone)) {
        let memberZones: ZoneSpec[] | undefined;
        let card: TextGroupInfo | undefined;

        // #L group (multi-line text split — no card, just stack the lines)
        if (ch.zone.startsWith("@group:")) {
          const ms = lineGroups.get(ch.zone.replace(/^@group:/, ""));
          if (ms && ms.length > 0) memberZones = [...ms].sort((a, b) => a.y - b.y);
        }
        // Card text group (separate text layers inside one card rect)
        else if (ch.zone.startsWith("@cardtext:")) {
          const info = cardTextGroups.get(ch.zone);
          if (info) {
            card = info;
            memberZones = info.textIds
              .map((id) => bodyTiles.find((z) => z.id === id))
              .filter((z): z is ZoneSpec => !!z)
              .sort((a, b) => a.y - b.y);
          }
        }

        if (memberZones && memberZones.length > 0) {
          const children: LayoutNode[] = [];
          if (card) {
            const spacer = (y: number, h: number): void => {
              const z: ZoneSpec = {
                id: nextId("z"),
                kind: "rect",
                friendlyName: "Card Fill",
                x: card!.x,
                y,
                w: card!.w,
                h,
                bg: card!.bg,
              };
              spacerZones.push(z);
              children.push({ zone: z.id });
            };
            let cursor = card.y;
            for (const m of memberZones) {
              const gap = m.y - cursor;
              if (gap > 2) spacer(cursor, gap);
              children.push({ zone: m.id });
              cursor = Math.max(cursor, m.y + m.h);
            }
            const tail = card.y + card.h - cursor;
            if (tail > 2) spacer(cursor, tail);
          } else {
            for (const m of memberZones) children.push({ zone: m.id });
          }
          node.children[i] = {
            id: nextId("c"),
            direction: "vert",
            children,
            name: card ? "KPI Card" : undefined,
          };
        }
      } else {
        expandTextGroups(ch);
      }
    }
  };
  expandTextGroups(root);

  // Re-attach the FILTER/ cards as a HEIGHT-PINNED filter bar row across the
  // TOP of the dashboard (they were excluded from the guillotine because their
  // relocated strip coordinates may overlap charts).
  //
  // NOT a fixed-width sidebar: a Tableau-confirmed lesson (builds 83–85) is
  // that `distribute-evenly` IGNORES a child's width pin — a sidebar in a horz
  // split always equalized to ~50% of the dashboard, wasting a huge empty
  // column and congesting the charts. A height-pinned row in a vert stack is
  // the one mechanism the references prove reliable, and a top filter bar of
  // equal-width cards is standard dashboard furniture anyway.
  if (filterTiles.length > 0) {
    filterTiles.sort((a, b) => a.y - b.y || a.x - b.x);
    // Quick-filter cards have a natural height (~title + dropdown). Clamp so a
    // FILTER/ layer drawn as a big panel can't become a giant card; width is
    // an equal share of the row (distribute-evenly sizes the cards).
    const rowH = Math.max(70, Math.min(110, Math.round(Math.max(...filterTiles.map((f) => f.h)))));
    const n = filterTiles.length;
    filterTiles.forEach((f, i) => {
      f.x = Math.round((i * dash.widthPx) / n);
      f.y = 0;
      f.w = Math.round(dash.widthPx / n);
      f.h = rowH;
    });
    const filterRow: ContainerSpec = {
      id: nextId("c"),
      direction: "horz",
      children: filterTiles.map((f) => ({ zone: f.id })),
      name: "Filters",
    };
    if (root.direction === "vert") root.children.unshift(filterRow);
    else root = { id: nextId("c"), direction: "vert", children: [filterRow, root], name: "Body" };
  }

  dash.zones = [...kept, ...spacerZones];
  dash.layoutMode = "tiled";
  dash.root = root;
}

/**
 * Materialize a sheet-only model's worksheets into `ctx` WITHOUT a dashboard.
 * Used for a Nav/ button whose SHEET destination wasn't selected: we need the
 * worksheet to exist (so the nav-action has a target) but the user asked for only
 * the sheet — not its whole enclosing dashboard — to be added. sheetIdToWs is
 * populated so the nav target resolves to this worksheet by the destination's id.
 */
function materializeSheetOnly(model: FaithfulModel, ctx: FaithfulCtx, data: DomainDataset, dsName: string): void {
  for (const z of model.zones) {
    if (z.kind !== "sheet") continue;
    const wsName = uniqNameIn(ctx, z.sheetName || z.name || "Sheet");
    ctx.sheetIdToWs.set(z.id, wsName);
    const mark = markTypeOf(z.chart);
    const isTrend = mark === "Line" || mark === "Area";
    const measures =
      mark === "Circle"
        ? [{ field: data.meas[0], agg: "Sum" as const }, { field: data.meas[1], agg: "Sum" as const }]
        : [{ field: ctx.sheetN++ % 2 === 0 ? data.meas[0] : data.meas[1], agg: "Sum" as const }];
    ctx.worksheets.push({
      id: nextId("ws"),
      name: wsName,
      mark,
      dimension: isTrend ? data.trendDim : data.catDim,
      measures,
      dualAxis: false,
      markColor: z.markColor || data.accent || "#898989",
      showLabels: true,
      dsName: dsName === PRIMARY_DS ? undefined : dsName,
    });
  }
}

/** Assemble a faithful workbook from one OR MORE models (one dashboard each). */
function assembleFaithfulWorkbook(
  models: FaithfulModel[],
  opts?: { layout?: "flow" | "floating" }
): WorkbookSpec {
  // Sheet-only models (Nav/ sheet targets that weren't selected) become bare
  // worksheets, not dashboards — split them out so only real frames make dashboards.
  const dashModels = models.filter((m) => !m.sheetOnly);
  const sheetOnlyModels = models.filter((m) => m.sheetOnly);

  // Detect the domain of EACH dashboard INDEPENDENTLY, so a multi-frame export
  // that mixes (e.g.) a Clinical and a Sales dashboard gives each its OWN data —
  // a sales chart shows Revenue by Region, not clinical Admissions. Each distinct
  // domain becomes a datasource: the first is primary (federated.fig), the rest
  // are ExtraDatasets (federated.fig2…) that their worksheets bind to.
  const domainOf = (m: FaithfulModel) => detectFaithfulDomain([m]);
  const distinctDomains = [...new Set([...dashModels, ...sheetOnlyModels].map(domainOf))];
  if (distinctDomains.length === 0) distinctDomains.push("generic");
  const domainInfo = new Map<
    string,
    { data: DomainDataset; dsName: string; connName: string; caption: string; fileName: string }
  >();
  distinctDomains.forEach((dom, i) => {
    domainInfo.set(dom, {
      data: domainDatasetFor(dom),
      dsName: i === 0 ? PRIMARY_DS : `${PRIMARY_DS}${i + 1}`,
      connName: i === 0 ? "textscan.fig" : `textscan.fig${i + 1}`,
      caption: `${domainLabel(dom)} Data`,
      fileName: i === 0 ? "data.csv" : `data_${dom}.csv`,
    });
  });
  const primary = domainInfo.get(distinctDomains[0])!;
  const data = primary.data; // primary dataset (drives the dummy fallback + spec.data)
  const { fields, rows } = data;
  const ctx: FaithfulCtx = { data, worksheets: [], actions: [], used: new Set(), imgN: 0, sheetN: 0, sheetIdToWs: new Map(), navButtons: [] };

  // Dashboard names must be UNIQUE across the workbook: Tableau's <windows>
  // section enforces a unique-name (and unique simple-id) identity constraint, so
  // two frames named the same (e.g. several "Data Metrics") would otherwise fail
  // to load with D2E8DA72 "duplicate identity constraint". Resolve to unique names
  // up front so dashName flows consistently into the spec, actions, nav targets,
  // and the per-dashboard window uuid.
  const resolvedDashNames = uniqueDashNames(dashModels.map((m) => m.title || "Dashboard"));
  const dashboards = dashModels.map((m, i) => {
    const info = domainInfo.get(domainOf(m))!;
    return buildFaithfulDashboard(m, ctx, resolvedDashNames[i], info.data, info.dsName);
  });
  if (opts?.layout === "flow") for (const d of dashboards) applyFlowLayout(d);
  // Now the sheet-only worksheets (after dashboards, so sheetIdToWs already has
  // every placed sheet; these add the extra nav-target worksheets on top).
  for (const m of sheetOnlyModels) {
    const info = domainInfo.get(domainOf(m))!;
    materializeSheetOnly(m, ctx, info.data, info.dsName);
  }
  // Non-primary domains become extra inline datasources (each with its own CSV).
  const extraData = distinctDomains.slice(1).map((dom) => {
    const info = domainInfo.get(dom)!;
    return { dsName: info.dsName, connName: info.connName, caption: info.caption, fileName: info.fileName, fields: info.data.fields, rows: info.data.rows };
  });

  // A workbook needs >=1 worksheet. If NO design had a SHEET/-tagged layer, keep
  // one unplaced dummy so the faithful (text/shape) export still opens.
  if (ctx.worksheets.length === 0) {
    ctx.worksheets.push({
      id: nextId("ws"),
      name: "Sheet 1",
      mark: "Bar",
      dimension: data.catDim,
      measures: [{ field: data.meas[0], agg: "Sum" }],
      dualAxis: false,
      showLabels: false,
    });
  }

  // Bind every FILTER/ card to a host CHART worksheet (a quick-filter card needs
  // one). Prefer the first real chart sheet ON THE CARD'S OWN DASHBOARD (never a
  // nav button-worksheet); fall back to the first chart worksheet overall.
  const buttonWsNames = new Set(ctx.worksheets.filter((w) => w.navButton).map((w) => w.name));
  const firstChart = ctx.worksheets.find((w) => !w.navButton)?.name;
  for (const dash of dashboards) {
    const localHost = dash.zones.find(
      (z) => z.kind === "sheet" && z.worksheet && !buttonWsNames.has(z.worksheet)
    )?.worksheet;
    const host = localHost ?? firstChart;
    if (host) for (const zn of dash.zones) if (zn.kind === "filter" && !zn.worksheet) zn.worksheet = host;
  }

  // Resolve every navigation button to a target and emit a <nav-action> (the only
  // nav mechanism the user's Tableau accepts — the native <button> object is
  // rejected in floating dashboards). A Nav/ button's target comes from its Figma
  // interaction: a SHEET destination → that worksheet, any other → its dashboard.
  // A BUTTON/ button's target comes from its name (">"/"->"), else the A↔B toggle
  // (2 dashboards) or next-with-wrap (>2). An unresolved button just doesn't get
  // an action (its worksheet still renders as a static styled label — load-safe).
  const frameIdToDash = new Map<string, string>();
  dashModels.forEach((m, i) => {
    if (m.id) frameIdToDash.set(m.id, resolvedDashNames[i]);
  });
  const dashNames = dashboards.map((d) => d.name);
  const findDash = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const t = raw.trim().toLowerCase();
    return dashNames.find((n) => n.toLowerCase() === t) ?? dashNames.find((n) => n.toLowerCase().includes(t));
  };
  for (const nb of ctx.navButtons) {
    let target: string | undefined;
    if (nb.isNav) {
      if (nb.isSheet && nb.targetId && ctx.sheetIdToWs.has(nb.targetId)) target = ctx.sheetIdToWs.get(nb.targetId);
      else if (nb.targetFrameId && frameIdToDash.has(nb.targetFrameId)) target = frameIdToDash.get(nb.targetFrameId);
    } else if (nb.nameTarget) {
      target = findDash(nb.nameTarget);
    } else if (dashNames.length === 2) {
      target = dashNames[(dashNames.indexOf(nb.sourceDash) + 1) % 2];
    } else if (dashNames.length > 2) {
      target = dashNames[(dashNames.indexOf(nb.sourceDash) + 1) % dashNames.length];
    }
    if (target && target !== nb.sourceDash && target !== nb.buttonWs) {
      ctx.actions.push({ id: nextId("act"), name: `Go to ${target}`, kind: "navigate", sourceSheet: nb.buttonWs, target, runOn: "select" });
    }
  }

  const first = models[0];
  return {
    workbookName: (first?.title || "Workbook").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Workbook",
    tableauVersion: "2026.2",
    data: { fileName: primary.fileName, fields, calcs: [], rows },
    extraData: extraData.length ? extraData : undefined,
    worksheets: ctx.worksheets,
    dashboards,
    actions: ctx.actions,
    // tsc filter/highlight actions stay opt-in; navigate actions emit regardless.
    includeActions: ctx.actions.some((a) => a.kind !== "navigate"),
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
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
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
  };
}
