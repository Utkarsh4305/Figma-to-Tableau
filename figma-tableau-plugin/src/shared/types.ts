// ---------------------------------------------------------------------------
// Shared type definitions — used by BOTH the Figma sandbox (plugin) and the
// React UI. Keep this file dependency-free so it imports cleanly in both
// contexts (the sandbox has no DOM; the UI has no `figma` global).
// ---------------------------------------------------------------------------

/** Tableau field data types we support. */
export type FieldType = "string" | "date" | "integer" | "real";

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
  | "web" // URL/ layer -> Tableau web page object (type-v2='web')
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
  // "filter" is a layer tagged "FILTER/Field" — a real Tableau quick-filter card.
  // "button" is a layer tagged "BUTTON/Label[ > TargetDashboard]" — a native
  // Tableau navigation button (type-v2='dashboard-object'), the LaDataViz move
  // confirmed in multi.twbx.
  kind: "text" | "rect" | "image" | "sheet" | "filter" | "web" | "button";
  x: number;
  y: number;
  w: number;
  h: number;
  // sheet (SHEET/-tagged layer)
  sheetName?: string; // clean worksheet name (prefix + [type] tag stripped)
  chart?: string; // Tableau mark class from the [type] tag: Bar/Line/Area/Pie/Circle
  // LaDataViz-style `:option` suffixes on a SHEET/ layer name (e.g.
  // "SHEET/Trend[line]:showTitle:filter"). Confirmed-safe options only:
  showTitle?: boolean; // ":showTitle" — render the worksheet's title in its zone
  // The design's own chart color, sampled from the most vivid fill the designer
  // drew INSIDE the SHEET/ layer (bars / line / slice). Used as the worksheet's
  // mark color so a blue mock exports a blue chart, instead of LaDataViz's
  // uniform gray. Undefined when no confident colored fill is found (→ gray).
  markColor?: string;
  actionKind?: "filter" | "highlight"; // ":filter" / ":highlight" — clicking this
  // sheet filters / highlights the rest of the dashboard (confirmed action XML)
  // filter (FILTER/-tagged layer): the dimension the quick-filter card is on
  filterField?: string;
  // web (URL/-tagged layer): the page URL the web object loads
  url?: string;
  // button (BUTTON/-tagged layer): the caption shown on the navigation button
  // and the raw target name (the dashboard/frame to navigate to, parsed from the
  // part after ">"/"->"; resolved to a real dashboard name in seed.ts).
  label?: string;
  target?: string;
  // nav (Nav/-tagged layer): a navigation button whose destination comes from the
  // layer's Figma PROTOTYPE INTERACTION ("Navigate to" reaction), not the layer
  // name. `navTargetId` is the reaction's destination node id (set in the sandbox
  // walk); `navTargetFrameId` is that destination's enclosing frame (the dashboard
  // to auto-include) and `navTargetIsSheet` is true when the destination is itself
  // a SHEET/ node (→ navigate to that worksheet's window instead of a dashboard).
  // The latter two are filled in by the async expandNavTargets pass.
  // `isNav` marks the button as a Nav/ (interaction-driven) button so seed never
  // applies the BUTTON/ name-convention toggle to it — an unreadable interaction
  // leaves it a plain button, never a wrong A↔B dashboard jump.
  isNav?: boolean;
  navTargetId?: string;
  navTargetFrameId?: string;
  navTargetIsSheet?: boolean;
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
  // True for a model pulled in ONLY to materialize a worksheet a Nav/ button
  // navigates to (its SHEET/ destination wasn't selected for export). Its sheet
  // zones become real worksheets so the nav has somewhere to land, but it does
  // NOT produce a dashboard — the user asked for "only the sheet added, not its
  // whole dashboard". Set by expandNavTargets; honored by assembleFaithfulWorkbook.
  sheetOnly?: boolean;
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

/**
 * Ask the sandbox to drop `SHEET/<name>` placeholder frames into the selected
 * dashboard frame (one per imported worksheet the user checked), so they appear
 * in the Figma design and get swapped for the real sheet on export.
 */
export interface MsgAddSheets {
  type: "add-sheets";
  names: string[];
}

/** The ready-made tagged components the Defaults tab can drop onto the canvas. */
export type DefaultKind = "sheet" | "kpi" | "nav" | "button" | "filter" | "image" | "web" | "text";

/**
 * Ask the sandbox to insert a correctly-named starter component (a `SHEET/`,
 * `Nav/`, `FILTER/`, … layer) beside the dashboard, so the user can design with
 * the conventions without typing the prefix by hand.
 */
export interface MsgInsertDefault {
  type: "insert-default";
  kind: DefaultKind;
}

export interface MsgFaithfulReady {
  type: "faithful-ready";
  // One model per selected frame — each becomes its own Tableau dashboard in the
  // exported workbook (multi-dashboard export). Null on error.
  models: FaithfulModel[] | null;
  error?: string;
}

// --- Persisted import data (survives plugin close/reopen) --------------------

/**
 * Serializable form of an uploaded .twb/.twbx — everything needed to reconstruct
 * a ParsedImport on the next plugin session. Stored via figma.clientStorage.
 * Binary assets (images/extracts) are included best-effort; if too large for
 * storage, the user re-uploads.
 */
export interface ImportStoredData {
  worksheetNames: string[];
  worksheetXml: Record<string, string>;
  datasourceXml: Record<string, string>;
  manifestEntries: string[];
  assets: { path: string; bytes: Uint8Array }[];
}

export interface MsgSaveImport {
  type: "save-import";
  data: ImportStoredData;
}

export interface MsgImportRestored {
  type: "import-restored";
  data: ImportStoredData | null;
}

export type LibraryComponentId =
  | "worksheet" | "bar-chart" | "line-chart" | "area-chart" | "pie-chart"
  | "scatter-plot" | "heatmap" | "table" | "kpi-large" | "kpi-small"
  | "filter" | "nav-button" | "named-button" | "text-box" | "image-placeholder" | "web-object";

export interface MsgInsertLibraryComponent {
  type: "insert-library-component";
  componentId: LibraryComponentId;
}

export type TemplateId = "clinical" | "sales" | "finance" | "executive" | "operations";

export interface MsgApplyTemplate {
  type: "apply-template";
  templateId: TemplateId;
}

export interface MsgFixClipping {
  type: "fix-clipping";
}

export type PluginToUi = MsgModelReady | MsgFaithfulReady | MsgImportRestored;
export type UiToPlugin =
  | MsgRequestParse
  | MsgResize
  | MsgNotify
  | MsgApplyTags
  | MsgRequestFaithful
  | MsgAddSheets
  | MsgInsertDefault
  | MsgSaveImport
  | MsgInsertLibraryComponent
  | MsgApplyTemplate
  | MsgFixClipping;
