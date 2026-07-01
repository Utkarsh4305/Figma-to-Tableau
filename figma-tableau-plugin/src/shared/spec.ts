// ---------------------------------------------------------------------------
// spec.ts — the EDITABLE workbook document. This is the UI's source of truth:
// users add/configure data fields, calculated fields, worksheets (mark type,
// dimension, measures, dual axis, conditional color, labels), dashboard zones,
// and actions.
//
// Risk policy (we have no Tableau reference for the new constructs yet): the
// base workbook is always emitted; dual axis and actions are opt-in per item /
// per export so a single bad advanced construct can be turned off without
// losing the whole workbook.
// ---------------------------------------------------------------------------

import type { FaithfulTextRun, FieldType } from "./types";

export type MarkType =
  | "Automatic"
  | "Bar"
  | "Line"
  | "Area"
  | "Pie"
  | "Circle"
  | "Square"
  | "Shape"
  | "Text";

export type Aggregation = "Sum" | "Average" | "Count" | "Median" | "Min" | "Max";

/** A physical column in the data source (maps to a CSV column). */
export interface SpecField {
  name: string;
  type: FieldType;
  role: "dimension" | "measure";
}

/** A calculated field — the basis for conditional coloring. */
export interface CalcField {
  id: string; // stable UI id
  localName: string; // Tableau internal name, e.g. "Calculation_1"
  name: string; // caption shown to user
  formula: string; // Tableau formula, references [Field] names
  type: FieldType; // result type
  role: "dimension" | "measure";
}

/** A measure pill placed on the rows shelf. */
export interface MeasurePill {
  field: string; // SpecField/CalcField name
  agg: Aggregation;
}

export interface ColorRule {
  value: string; // a dimension value, e.g. "Furniture"
  hex: string; // "#5c6068"
}

export interface WorksheetSpec {
  id: string;
  name: string;
  mark: MarkType;
  dimension?: string; // category field on columns
  measures: MeasurePill[]; // on rows; >=2 + dualAxis => dual axis
  dualAxis: boolean; // overlay the first two measures on two synced axes
  colorField?: string; // field/calc name driving the color encoding
  colorRules?: ColorRule[]; // pin specific values to colors (conditional color)
  markColor?: string; // solid mark color (#hex) when not coloring by a field
  showLabels: boolean;
  kpi?: boolean; // UI-only: a "big number" sheet (Text mark, one measure, no dim).
  // The generator ignores this flag — a KPI lowers to a normal Text-mark
  // worksheet, so KPIs are real sheets you can drag onto the dashboard.
  // A NAVIGATION button rendered as a worksheet (the only nav mechanism the
  // user's Tableau accepts — the native <button> dashboard-object is rejected in
  // floating dashboards). It's a Text-mark sheet showing `caption` on a colored
  // background; a <nav-action> sourced from it navigates on click. When set, the
  // generator emits a dedicated button-worksheet and ignores mark/dimension/measures.
  navButton?: { caption: string; bg: string; fg: string; fontSize: number };
}

// Confirmed action kinds (Tableau 2026.2 references): highlight = tsc:brush
// (no link group, safest), filter = tsc:tsl-filter (also emits a hidden
// sheet_link group). URL/navigation actions are NOT in any reference workbook,
// so they are intentionally not offered.
// navigate = a <nav-action> (manifest flag NavigationAction): clicking the source
// button-worksheet jumps to another dashboard or worksheet. Confirmed schema from
// examples/Navigation Menu Example.twb. Always emitted (not gated by includeActions),
// since navigation is a core feature; the native <button> object is NOT used (the
// user's Tableau rejects element 'button' — D2E8DA72 — in floating dashboards).
export type ActionKind = "highlight" | "filter" | "navigate";
export type ActionRunOn = "select" | "hover" | "menu";

export interface ActionSpec {
  id: string;
  name: string;
  kind: ActionKind;
  sourceSheet: string; // worksheet the action runs FROM
  target: string; // sheet OR dashboard name the action applies TO
  field?: string; // highlight: dimension to brush on; filter: link dimension
  runOn: ActionRunOn;
}

export type ZoneKind = "sheet" | "text" | "button" | "filter" | "image" | "rect" | "web";

export interface ZoneSpec {
  id: string;
  kind: ZoneKind;
  // Original Figma layer name, emitted as the zone's `friendly-name` (LaDataViz
  // convention) so the dashboard tree reads like the source design.
  friendlyName?: string;
  // px coordinates relative to the dashboard; normalized at generation time
  x: number;
  y: number;
  w: number;
  h: number;
  // sheet / filter (bound worksheet)
  worksheet?: string;
  // sheet: the ORIGINAL (pre-dedupe) sheet name from the SHEET/ layer. Two of the
  // same SHEET/ across dashboards dedupe to "X"/"X 2" in `worksheet`; this keeps
  // the shared base "X" so the worksheet-swap can repoint EVERY copy at the one
  // imported sheet (otherwise only the first copy swaps to the user's real data).
  baseSheetName?: string;
  // sheet: render the worksheet's title inside its zone (LaDataViz ":showTitle").
  // Default false (the design supplies its own heading text).
  showTitle?: boolean;
  // A KPI "big number" sheet. In tiled mode KPIs are pinned (fixed-size) like
  // text/headers so a KPI row stays short instead of flexing like a chart.
  isKpi?: boolean;
  // filter card: the (string) dimension the quick filter is on
  field?: string;
  // filter card bound to an IMPORTED worksheet: the verbatim
  // `[datasource].[field-instance]` column reference lifted from the imported
  // sheet's own <slices>, so the card filters its REAL data (not our sample
  // datasource). When set, the generator uses it as the zone `param` directly.
  filterParam?: string;
  // text / button
  text?: string;
  bg?: string;
  fg?: string;
  fontSize?: number;
  fontFamily?: string; // faithful transpile: the design's font
  bold?: boolean;
  align?: number; // 0 left 1 center 2 right
  // Per-style runs (faithful transpile of a multi-size/color text layer). When
  // present, each is emitted as its own <run>; otherwise the flat text/fontSize
  // above is used as a single run.
  runs?: FaithfulTextRun[];
  // rect (faithful transpile of a Figma shape -> a colored `empty` zone)
  cornerRadius?: number;
  strokeColor?: string;
  strokeWidth?: number;
  // button: navigation target — a dashboard window (targetDashboard) OR, for a
  // Nav/ button whose Figma interaction points at a SHEET/ destination, a
  // worksheet window (targetWorksheet). At most one is set; the generator points
  // the button's goto-sheet window-id at the matching window's simple-id.
  targetDashboard?: string;
  targetWorksheet?: string;
  // web object (URL/ layer): the page URL loaded by the type-v2='web' zone
  url?: string;
  // image zone: base64 PNG payload + the in-package filename it's stored under
  image?: string; // base64 (no data: prefix)
  imageFile?: string; // e.g. "logo.png" (packaged under Image/ in the .twbx)
  scaled?: boolean; // image: fit-to-zone (true) vs center
}

// Tableau dashboards are laid out either with absolute-positioned objects
// ("floating", our default — pixel-perfect to the Figma frame) or with nested
// flow containers ("tiled", derived from Figma Auto Layout frames).
export type LayoutMode = "floating" | "tiled";

/** A flow container (Tableau layout-flow) — used only in tiled mode. */
export interface ContainerSpec {
  id: string;
  direction: "horz" | "vert";
  children: LayoutNode[];
  // Original Figma frame name, emitted as `friendly-name` on the container.
  name?: string;
}

/** A tiled-layout node: either a reference to a ZoneSpec, or a sub-container. */
export type LayoutNode = { zone: string } | ContainerSpec;

export function isContainer(n: LayoutNode): n is ContainerSpec {
  return (n as ContainerSpec).direction !== undefined;
}

export interface DashboardSpec {
  id: string;
  name: string;
  widthPx: number;
  heightPx: number;
  bg: string;
  zones: ZoneSpec[];
  // "floating" (default) emits absolute zones; "tiled" wraps zones in the
  // `root` container tree (layout-flow). When tiled but `root` is absent the
  // generator falls back to floating so a workbook is always produced.
  layoutMode?: LayoutMode;
  root?: ContainerSpec;
}

export interface DataSpec {
  fileName: string; // e.g. "data.csv"
  fields: SpecField[];
  calcs: CalcField[];
  rows: string[][]; // values aligned to fields order
}

/**
 * A quick-filter found inside an imported worksheet (lifted from its <slices>).
 * Placed on the dashboard as a real filter card bound to that worksheet's own
 * data when the sheet is swapped in.
 */
export interface ImportedFilter {
  worksheet: string; // the imported worksheet the quick filter belongs to
  field: string; // human label parsed from the column instance (e.g. "Region")
  param: string; // verbatim [datasource].[field-instance] reference
}

/** A binary asset (data extract / image) lifted from an imported .twbx. */
export interface ImportAsset {
  path: string; // package-relative path, e.g. "Data/DM/file.xlsx" — preserved verbatim
  bytes: Uint8Array;
}

/**
 * Worksheets the user already built in Tableau, lifted whole from an uploaded
 * .twbx and spliced into our export so a SHEET/ placeholder renders THEIR real
 * sheet on THEIR real data instead of a demo sample-data chart. The XML blocks
 * are carried byte-for-byte (never regenerated) — only positioned/referenced.
 */
export interface ImportPayload {
  // worksheet name -> its full <worksheet>…</worksheet> XML (verbatim)
  worksheetXml: Map<string, string>;
  // datasource name -> its full <datasource>…</datasource> XML (verbatim, deduped)
  datasourceXml: Map<string, string>;
  // document-format-change-manifest child element names the imports need
  manifestEntries: string[];
  // Data/ + Image/ files to repackage (paths preserved so connections resolve)
  assets: ImportAsset[];
}

export type FilterShelfPosition = "left" | "right" | "hidden";

export interface ExportOptions {
  showFilters: boolean;
  showLegends: boolean;
  showTitles: boolean;
  showTooltips: boolean;
  filterShelfPosition: FilterShelfPosition;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  showFilters: true,
  showLegends: false,
  showTitles: true,
  showTooltips: true,
  filterShelfPosition: "right",
};

export interface WorkbookSpec {
  workbookName: string;
  tableauVersion: string;
  data: DataSpec;
  worksheets: WorksheetSpec[];
  dashboards: DashboardSpec[];
  actions: ActionSpec[];
  includeActions: boolean; // export toggle (actions are experimental)
  // Imported real worksheets (the "swap" feature). Their names appear as zone
  // `worksheet` refs and in the windows section; their XML is spliced verbatim.
  imports?: ImportPayload;
  exportOptions?: ExportOptions;
}

// --- small helpers shared by UI + generator ---------------------------------

let _seq = 1;
export function nextId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
}

export function aggPrefix(a: Aggregation): string {
  switch (a) {
    case "Sum":
      return "sum";
    case "Average":
      return "avg";
    case "Count":
      return "cnt";
    case "Median":
      return "med";
    case "Min":
      return "min";
    case "Max":
      return "max";
  }
}

export function aggDerivation(a: Aggregation): string {
  return a === "Average" ? "Avg" : a; // Tableau uses "Avg"
}
