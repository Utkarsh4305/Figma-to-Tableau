// ---------------------------------------------------------------------------
// Shared type definitions — used by BOTH the Figma sandbox (plugin) and the
// React UI. Keep this file dependency-free so it imports cleanly in both
// contexts (the sandbox has no DOM; the UI has no `figma` global).
// ---------------------------------------------------------------------------

/** Tableau field data types we support. */
export type FieldType = "string" | "date" | "integer" | "real";

/** A column in the (placeholder) Tableau data source. */
export interface DataField {
  name: string;
  type: FieldType;
}

/** Chart kinds we can detect from a Figma mockup and emit as a worksheet. */
export type ChartKind =
  | "bar"
  | "line"
  | "pie"
  | "area"
  | "scatter"
  | "heatmap"
  | "table"
  | "kpi";

/** How a parsed Figma element is interpreted for Tableau. */
export type ElementRole =
  | "dashboard" // the dashboard frame itself
  | "worksheet" // a chart/table -> Tableau worksheet
  | "kpi" // KPI card -> text zone (or KPI worksheet)
  | "filter" // filter panel -> text zone placeholder
  | "text" // heading / label -> text zone
  | "button" // nav button -> styled button zone
  | "container" // auto-layout / rectangle -> layout container
  | "image" // raster / logo -> Tableau image (bitmap) zone
  | "ignore";

/** Normalized rectangle in Figma pixel space. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** RGB(A) color, components 0..1 (Figma native), plus a derived hex. */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
}

/** A single parsed node from the Figma tree. */
export interface ParsedElement {
  id: string;
  name: string;
  figmaType: string; // FRAME, TEXT, RECTANGLE, ...
  rect: Rect; // absolute, relative to the dashboard frame
  role: ElementRole; // heuristic guess (user can override)
  chartKind?: ChartKind; // when role === "worksheet" | "kpi"
  text?: string; // for TEXT nodes / KPI values
  fill?: Color;
  stroke?: Color;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  cornerRadius?: number;
  children?: ParsedElement[];
  // True when the role came from an explicit LaDataViz-style layer prefix
  // (e.g. "SHEET/Sales") rather than a heuristic guess. Authoritative.
  explicit?: boolean;
  // Auto Layout direction, when this node is an auto-layout frame. Used to
  // build Tableau "tiled" containers (layout-flow) faithfully.
  autoLayout?: "horz" | "vert";
  // Base64-encoded PNG of this node's render (logos/images), when role==="image"
  // or when a background-image export rasterizes the whole frame.
  imagePng?: string;
}

/** The full structured representation of one Figma dashboard frame. */
export interface DashboardModel {
  id?: string; // the source frame's node id (used to detect selection changes)
  title: string;
  width: number; // frame width in px
  height: number; // frame height in px
  background?: Color;
  elements: ParsedElement[]; // flattened, dashboard-relative
  tree?: ParsedElement[]; // hierarchy preserved (for tiled-container export)
  palette: string[]; // distinct hex colors found, most-used first
  fonts: string[]; // distinct font families found
  debugTree?: string; // raw "depth|TYPE|name|wxh -> role" dump, for diagnostics
}

// --- faithful transpile (LaDataViz-style) ------------------------------------
// Instead of classifying charts and binding them to sample data, the faithful
// path recreates the WHOLE Figma design as native Tableau dashboard zones: text
// layers -> text zones (real content), shapes -> colored `empty` zones, icons/
// vectors -> bitmap images. The result LOOKS like the design (it carries no
// live data — exactly what LaDataViz's "Figma to Tableau" plugin produces).

/** One styled run within a text layer (a contiguous span of one style). */
export interface FaithfulTextRun {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  bold?: boolean;
}

/** One faithfully-transpiled Figma node, positioned in dashboard px. */
export interface FaithfulZone {
  id: string; // figma node id (used to rasterize image zones in the sandbox)
  name: string; // original layer name -> friendly-name
  // "sheet" is a layer the designer tagged "SHEET/Name[type]" — it becomes a
  // REAL Tableau worksheet bound to sample data (the LaDataViz convention seen
  // in Template.twbx), instead of being recreated as static text/rect/image.
  kind: "text" | "rect" | "image" | "sheet";
  x: number;
  y: number;
  w: number;
  h: number;
  // sheet (SHEET/-tagged layer)
  sheetName?: string; // clean worksheet name (prefix + [type] tag stripped)
  chart?: string; // Tableau mark class from the [type] tag: Bar/Line/Area/Pie/Circle
  // rect
  fill?: string; // hex background
  cornerRadius?: number;
  strokeColor?: string;
  strokeWidth?: number;
  // text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  bold?: boolean;
  align?: number; // 0 left 1 center 2 right
  // Per-style runs within one text layer (see FaithfulTextRun). Present when a
  // single Figma text node mixes sizes/colors (e.g. KPI label + big value).
  runs?: FaithfulTextRun[];
  // image
  imagePng?: string; // base64 (no data: prefix)
}

/** A whole Figma frame transpiled faithfully (z-ordered back-to-front). */
export interface FaithfulModel {
  id?: string;
  title: string;
  width: number;
  height: number;
  background?: string;
  zones: FaithfulZone[];
}

/** Export settings collected from the UI ExportPanel. */
export interface ExportSettings {
  workbookName: string;
  dashboardName: string;
  tableauVersion: string; // e.g. "2026.2"
  layoutWidth: number; // dashboard px width
  layoutHeight: number; // dashboard px height
  embedData: boolean; // bundle CSV into the .twbx
}

/** A user-editable mapping row shown in the MappingPanel. */
export interface MappingRow {
  elementId: string;
  elementName: string;
  figmaType: string;
  role: ElementRole;
  chartKind?: ChartKind;
}

// --- Messages between the Figma sandbox and the UI iframe ---------------------

export interface MsgModelReady {
  type: "model-ready";
  model: DashboardModel | null;
  error?: string;
}

export interface MsgRequestParse {
  type: "request-parse";
}

export interface MsgResize {
  type: "resize";
  width: number;
  height: number;
}

export interface MsgNotify {
  type: "notify";
  message: string;
}

/** Ask the sandbox to rename detected layers in Figma with SHEET//KPI/… prefixes. */
export interface MsgApplyTags {
  type: "apply-tags";
}

/** Ask the sandbox for a FAITHFUL transpile of the selected frame. */
export interface MsgRequestFaithful {
  type: "request-faithful";
}

export interface MsgFaithfulReady {
  type: "faithful-ready";
  model: FaithfulModel | null;
  error?: string;
}

export type PluginToUi = MsgModelReady | MsgFaithfulReady;
export type UiToPlugin =
  | MsgRequestParse
  | MsgResize
  | MsgNotify
  | MsgApplyTags
  | MsgRequestFaithful;
