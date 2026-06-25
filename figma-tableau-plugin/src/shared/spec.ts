// ---------------------------------------------------------------------------
// spec.ts — the EDITABLE workbook document. This is the UI's source of truth:
// users add/configure data fields, calculated fields, worksheets (mark type,
// dimension, measures, dual axis, conditional color, labels), dashboard zones,
// and actions. `specToTableauModel` (in mapper.ts) lowers this into the
// generator's TableauModel, which produces the proven load-safe .twb.
//
// Risk policy (we have no Tableau reference for the new constructs yet): the
// base workbook is always emitted; dual axis and actions are opt-in per item /
// per export so a single bad advanced construct can be turned off without
// losing the whole workbook.
// ---------------------------------------------------------------------------

import type { FieldType } from "./types";

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
}

// Confirmed action kinds (Tableau 2026.2 references): highlight = tsc:brush
// (no link group, safest), filter = tsc:tsl-filter (also emits a hidden
// sheet_link group). URL/navigation actions are NOT in any reference workbook,
// so they are intentionally not offered.
export type ActionKind = "highlight" | "filter";
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

export type ZoneKind = "sheet" | "text" | "button" | "filter" | "image" | "rect";

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
  // A KPI "big number" sheet. In tiled mode KPIs are pinned (fixed-size) like
  // text/headers so a KPI row stays short instead of flexing like a chart.
  isKpi?: boolean;
  // filter card: the (string) dimension the quick filter is on
  field?: string;
  // text / button
  text?: string;
  bg?: string;
  fg?: string;
  fontSize?: number;
  fontFamily?: string; // faithful transpile: the design's font
  bold?: boolean;
  align?: number; // 0 left 1 center 2 right
  // rect (faithful transpile of a Figma shape -> a colored `empty` zone)
  cornerRadius?: number;
  strokeColor?: string;
  strokeWidth?: number;
  // button
  targetDashboard?: string;
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
  // base64 PNG used as a full-dashboard background image (background-image mode)
  backgroundImage?: string;
  backgroundImageFile?: string; // its packaged filename, e.g. "Dashboard-bg.png"
}

export interface DataSpec {
  fileName: string; // e.g. "data.csv"
  fields: SpecField[];
  calcs: CalcField[];
  rows: string[][]; // values aligned to fields order
}

export interface WorkbookSpec {
  workbookName: string;
  tableauVersion: string;
  data: DataSpec;
  worksheets: WorksheetSpec[];
  dashboards: DashboardSpec[];
  actions: ActionSpec[];
  includeActions: boolean; // export toggle (actions are experimental)
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
