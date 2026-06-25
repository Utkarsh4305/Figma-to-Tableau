import type { FieldType, ChartKind, ElementRole } from "./types";

// ---------------------------------------------------------------------------
// Tableau 2026.2 construction constants — ported VERBATIM from the proven
// Python generator (generate_image_twb.py) that is confirmed to OPEN in
// Tableau 2026.2. Do not change these without a reference export to compare
// against; getting them wrong yields the opaque "Internal Error 501CF476".
// ---------------------------------------------------------------------------

/** Workbook XML version + source build string for Tableau 2026.2. */
export const TABLEAU = {
  version: "18.1",
  originalVersion: "18.1",
  sourceBuild: "2026.2.0 (20262.26.0603.1643)",
  sourcePlatform: "win",
} as const;

/**
 * The <document-format-change-manifest> entries the 2026 object model needs.
 * Missing entries here break the data-source object graph on load.
 */
export const MANIFEST_ENTRIES = [
  "AnimationOnByDefault",
  "MarkAnimation",
  "ObjectModelEncapsulateLegacy",
  "ObjectModelTableType",
  "SchemaViewerObjectModel",
  "SheetIdentifierTracking",
  "WindowsPersistSimpleIdentifiers",
] as const;

/** Native Tableau 2026.2 remote-type codes (verified against reference.twb). */
export const RT2026: Record<FieldType, number> = {
  string: 129,
  date: 133,
  integer: 20,
  real: 5,
};

/** Default aggregation per data type. */
export const AGG2026: Record<FieldType, string> = {
  string: "Count",
  date: "Year",
  integer: "Sum",
  real: "Sum",
};

// --- LaDataViz-style layer-name prefixes (authoritative, beat heuristics) ----
// A Figma node named "SHEET/Sales by Region" maps explicitly to a Tableau
// worksheet called "Sales by Region". This mirrors the LaDataViz convention:
// the prefix decides the Tableau object, the remainder is the object's name.
// Matched case-insensitively; surrounding spaces around the slash are allowed.
export const LAYER_PREFIXES: Array<{ re: RegExp; role: ElementRole }> = [
  { re: /^\s*sheet\s*\/\s*/i, role: "worksheet" },
  { re: /^\s*kpi\s*\/\s*/i, role: "kpi" },
  { re: /^\s*(?:image|img|logo)\s*\/\s*/i, role: "image" },
  { re: /^\s*button\s*\/\s*/i, role: "button" },
  { re: /^\s*filter\s*\/\s*/i, role: "filter" },
  { re: /^\s*text\s*\/\s*/i, role: "text" },
  { re: /^\s*(?:container|group)\s*\/\s*/i, role: "container" },
];

/** If `name` carries a known layer prefix, return its role + the clean name. */
export function matchLayerPrefix(
  name: string
): { role: ElementRole; clean: string } | undefined {
  for (const { re, role } of LAYER_PREFIXES) {
    if (re.test(name)) return { role, clean: name.replace(re, "").trim() || name };
  }
  return undefined;
}

// --- Heuristic keyword tables for dashboard-element detection ----------------

/** Layer-name keywords that hint a chart kind. Checked case-insensitively. */
export const CHART_KEYWORDS: Array<{ kind: ChartKind; words: string[] }> = [
  { kind: "kpi", words: ["kpi", "metric", "stat", "score", "total ", "card"] },
  { kind: "bar", words: ["bar", "column", "histogram", "ranking", "enrollment"] },
  { kind: "line", words: ["line", "trend", "time series", "timeseries", "over time"] },
  { kind: "pie", words: ["pie", "donut", "doughnut", "share", "split"] },
  { kind: "area", words: ["area", "stacked area", "cumulative"] },
  { kind: "scatter", words: ["scatter", "bubble", "correlation"] },
  { kind: "heatmap", words: ["heat", "heatmap", "matrix"] },
  { kind: "table", words: ["table", "grid", "list", "summary", "detail", "log"] },
];

/** Layer-name keywords that mark filter / navigation / chrome elements. */
export const FILTER_KEYWORDS = ["filter", "slicer", "dropdown", "select", "search"];
export const NAV_KEYWORDS = ["nav", "sidebar", "menu", "rail", "tab"];
export const HEADER_KEYWORDS = ["header", "topbar", "title bar", "appbar"];
export const FOOTER_KEYWORDS = ["footer", "legend"];

/** Dashboard domain detection — drives nicer placeholder field sets. */
export const DOMAIN_KEYWORDS: Array<{ domain: string; words: string[] }> = [
  { domain: "clinical", words: ["clinical", "trial", "patient", "subject", "adverse", "enrollment", "site", "visit"] },
  { domain: "finance", words: ["finance", "revenue", "profit", "expense", "budget", "cash", "p&l"] },
  { domain: "sales", words: ["sales", "pipeline", "deal", "lead", "quota", "conversion"] },
  { domain: "ops", words: ["operation", "ops", "sla", "incident", "ticket", "uptime", "throughput"] },
];

/** Per-domain placeholder data fields (dimension + measures). */
export const DOMAIN_FIELDS: Record<string, { dims: [string, FieldType][]; meas: [string, FieldType][] }> = {
  clinical: {
    dims: [["Site", "string"], ["Visit", "string"]],
    meas: [["Randomized", "integer"], ["Screened", "integer"]],
  },
  finance: {
    dims: [["Region", "string"], ["Quarter", "string"]],
    meas: [["Revenue", "integer"], ["Expense", "integer"]],
  },
  sales: {
    dims: [["Stage", "string"], ["Rep", "string"]],
    meas: [["Deals", "integer"], ["Amount", "integer"]],
  },
  ops: {
    dims: [["Service", "string"], ["Day", "string"]],
    meas: [["Incidents", "integer"], ["Uptime", "integer"]],
  },
  generic: {
    dims: [["Category", "string"], ["Segment", "string"]],
    meas: [["Value", "integer"], ["Amount", "integer"]],
  },
};

/** Default dashboard pixel size when a frame size can't be read. */
export const DEFAULT_SIZE = { width: 1280, height: 800 };

/** UI iframe size. */
export const UI_SIZE = { width: 460, height: 640 };
