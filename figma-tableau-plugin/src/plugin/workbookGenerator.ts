// ---------------------------------------------------------------------------
// workbookGenerator.ts — generates the .twb XML from the editable WorkbookSpec.
//
// This supersedes the simple tableauGenerator for the editor path. It keeps the
// PROVEN load-safe base (CSV textscan datasource, <windows>, layout zones) and
// adds the patterns CONFIRMED from real reference workbooks
// (Template.twbx / LGBTQ VOTD.twbx):
//   - calculated fields            <column ...><calculation .../></column>
//   - conditional/categorical color  datasource <style><style-rule element='mark'>
//                                     <encoding attr='color'><map to><bucket>
//   - solid mark color + labels    worksheet <style> mark-color / mark-labels-show
//   - parameters                   separate inline 'Parameters' datasource
//   - pane color encoding          <pane><encodings><color column=.../>
//
// EXPERIMENTAL (no reference yet — emitted only behind toggles so a bad one
// can't kill the whole workbook): dual axis (falls back to stacked measures),
// dashboard actions, navigation buttons (rendered as styled text zones).
// ---------------------------------------------------------------------------

import type {
  WorkbookSpec,
  WorksheetSpec,
  DashboardSpec,
  SpecField,
  MeasurePill,
  ZoneSpec,
  ContainerSpec,
  LayoutNode,
} from "../shared/spec";
import { aggPrefix, aggDerivation, isContainer } from "../shared/spec";
import { TABLEAU, MANIFEST_ENTRIES, RT2026, AGG2026 } from "../shared/constants";
import type { FieldType } from "../shared/types";

// --- helpers -----------------------------------------------------------------

function uid(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw =
    g && typeof g.randomUUID === "function"
      ? g.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
  return `{${raw.toUpperCase()}}`;
}

function hex32(): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += ((Math.random() * 16) | 0).toString(16);
  return s.toUpperCase();
}

function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");
}

/**
 * The document-format-change-manifest. Imported worksheets/datasources can need
 * format-feature entries ours doesn't emit (e.g. an Excel/hyper connection), so
 * we UNION any entries the import carries into our base set — a missing entry
 * can break the imported datasource's object graph on load.
 */
function manifestXml(spec: WorkbookSpec): string {
  const entries = new Set<string>(MANIFEST_ENTRIES);
  if (spec.imports) for (const e of spec.imports.manifestEntries) entries.add(e);
  return (
    "  <document-format-change-manifest>\n" +
    [...entries].map((e) => `    <${e} />\n`).join("") +
    "  </document-format-change-manifest>\n"
  );
}

/** Resolved field used during generation. */
interface GenField {
  display: string; // user-facing name
  local: string; // bracketed Tableau name, e.g. "[Value]" or "[Calculation_1]"
  base: string; // unbracketed, for instance names
  type: FieldType;
  role: "dimension" | "measure";
  isCalc: boolean;
}

function buildRegistry(spec: WorkbookSpec): Map<string, GenField> {
  const reg = new Map<string, GenField>();
  for (const f of spec.data.fields) {
    reg.set(f.name, {
      display: f.name,
      local: `[${f.name}]`,
      base: f.name,
      type: f.type,
      role: f.role,
      isCalc: false,
    });
  }
  for (const c of spec.data.calcs) {
    reg.set(c.name, {
      display: c.name,
      local: `[${c.localName}]`,
      base: c.localName,
      type: c.type,
      role: c.role,
      isCalc: true,
    });
  }
  return reg;
}

function dimInstance(base: string): string {
  return `[none:${base}:nk]`;
}
function measInstance(base: string, aggPfx: string): string {
  return `[${aggPfx}:${base}:qk]`;
}

// --- datasource (CSV textscan) ----------------------------------------------

function relationColumns(indent: string, cols: SpecField[]): string {
  const o: string[] = [
    `${indent}<columns character-set='UTF-8' header='yes' locale='en_US' separator=','>\n`,
  ];
  cols.forEach((c, i) => {
    o.push(`${indent}  <column datatype='${c.type}' name='${esc(c.name)}' ordinal='${i}' />\n`);
  });
  o.push(`${indent}</columns>\n`);
  return o.join("");
}

/** datasource-level conditional color: one <encoding> per field that has rules. */
function colorStyleBlock(spec: WorkbookSpec): string {
  // collect rules per field name (dedupe by value, last wins)
  const byField = new Map<string, Map<string, string>>();
  for (const ws of spec.worksheets) {
    if (ws.colorField && ws.colorRules && ws.colorRules.length) {
      const m = byField.get(ws.colorField) ?? new Map<string, string>();
      for (const r of ws.colorRules) m.set(r.value, r.hex);
      byField.set(ws.colorField, m);
    }
  }
  if (byField.size === 0) return "";
  const reg = buildRegistry(spec);
  const out: string[] = ["      <style>\n"];
  for (const [fieldName, rules] of byField) {
    const f = reg.get(fieldName);
    if (!f) continue;
    out.push("        <style-rule element='mark'>\n");
    out.push(`          <encoding attr='color' field='${dimInstance(f.base)}' type='palette'>\n`);
    for (const [value, color] of rules) {
      out.push(`            <map to='${color}'>\n`);
      out.push(`              <bucket>&quot;${esc(value)}&quot;</bucket>\n`);
      out.push("            </map>\n");
    }
    out.push("          </encoding>\n");
    out.push("        </style-rule>\n");
  }
  out.push("      </style>\n");
  return out.join("");
}

function datasourceXml(spec: WorkbookSpec, dataDirectory: string): { xml: string; dsName: string } {
  const dsName = "federated.fig";
  const connName = "textscan.fig";
  const caption = spec.workbookName + " Data";
  const csvFile = spec.data.fileName;
  const base = csvFile.toLowerCase().endsWith(".csv") ? csvFile.slice(0, -4) : csvFile;
  const parent = `[${csvFile}]`;
  const table = `[${base}#csv]`;
  const objid = `${csvFile}_${hex32()}`;
  const objidB = `[${objid}]`;
  const fields = spec.data.fields;

  const x: string[] = [];
  x.push(
    `    <datasource caption='${esc(caption)}' inline='true' name='${dsName}' version='${TABLEAU.version}'>\n`
  );
  x.push("      <connection class='federated'>\n");
  x.push("        <named-connections>\n");
  x.push(`          <named-connection caption='${esc(base)}' name='${connName}'>\n`);
  x.push(
    `            <connection class='textscan' directory='${esc(dataDirectory)}' filename='${esc(
      csvFile
    )}' password='' server='' />\n`
  );
  x.push("          </named-connection>\n");
  x.push("        </named-connections>\n");
  x.push(`        <relation connection='${connName}' name='${esc(csvFile)}' table='${table}' type='table'>\n`);
  x.push(relationColumns("          ", fields));
  x.push("        </relation>\n");
  x.push("        <metadata-records>\n");
  x.push("          <metadata-record class='capability'>\n");
  x.push("            <remote-name />\n            <remote-type>0</remote-type>\n");
  x.push(`            <parent-name>${parent}</parent-name>\n`);
  x.push(
    "            <remote-alias />\n            <aggregation>Count</aggregation>\n            <contains-null>true</contains-null>\n"
  );
  x.push("            <attributes>\n");
  x.push("              <attribute datatype='string' name='character-set'>&quot;UTF-8&quot;</attribute>\n");
  x.push("              <attribute datatype='string' name='collation'>&quot;en_US&quot;</attribute>\n");
  x.push("              <attribute datatype='string' name='field-delimiter'>&quot;,&quot;</attribute>\n");
  x.push("              <attribute datatype='string' name='header-row'>&quot;true&quot;</attribute>\n");
  x.push("              <attribute datatype='string' name='locale'>&quot;en_US&quot;</attribute>\n");
  x.push("              <attribute datatype='string' name='single-char'>&quot;&quot;</attribute>\n");
  x.push("            </attributes>\n");
  x.push("          </metadata-record>\n");
  fields.forEach((c, i) => {
    x.push("          <metadata-record class='column'>\n");
    x.push(`            <remote-name>${esc(c.name)}</remote-name>\n`);
    x.push(`            <remote-type>${RT2026[c.type]}</remote-type>\n`);
    x.push(`            <local-name>[${esc(c.name)}]</local-name>\n`);
    x.push(`            <parent-name>${parent}</parent-name>\n`);
    x.push(`            <remote-alias>${esc(c.name)}</remote-alias>\n`);
    x.push(`            <ordinal>${i}</ordinal>\n`);
    x.push(`            <local-type>${c.type}</local-type>\n`);
    x.push(`            <aggregation>${AGG2026[c.type]}</aggregation>\n`);
    if (c.type === "string") x.push("            <scale>1</scale>\n            <width>1073741823</width>\n");
    x.push("            <contains-null>true</contains-null>\n");
    if (c.type === "string") x.push("            <collation flag='0' name='LEN_RGB' />\n");
    x.push(`            <object-id>${objidB}</object-id>\n`);
    x.push("          </metadata-record>\n");
  });
  x.push("        </metadata-records>\n");
  x.push("      </connection>\n");
  x.push("      <aliases enabled='yes' />\n");

  // physical role columns
  for (const c of fields) {
    if (c.type === "integer" || c.type === "real") {
      x.push(
        `      <column caption='${esc(c.name)}' datatype='${c.type}' name='[${esc(
          c.name
        )}]' role='measure' type='quantitative' />\n`
      );
    } else if (c.type === "date") {
      x.push(`      <column caption='${esc(c.name)}' datatype='date' name='[${esc(c.name)}]' role='dimension' type='ordinal' />\n`);
    } else {
      x.push(`      <column caption='${esc(c.name)}' datatype='string' name='[${esc(c.name)}]' role='dimension' type='nominal' />\n`);
    }
  }

  // calculated fields (CONFIRMED pattern)
  for (const calc of spec.data.calcs) {
    const t = calc.role === "measure" ? "quantitative" : tableauType(calc.type);
    x.push(
      `      <column caption='${esc(calc.name)}' datatype='${calc.type}' name='[${esc(
        calc.localName
      )}]' role='${calc.role}' type='${t}'>\n`
    );
    x.push(`        <calculation class='tableau' formula='${esc(calc.formula)}' />\n`);
    x.push("      </column>\n");
  }

  // hidden sheet_link groups for filter actions (CONFIRMED pattern)
  x.push(actionGroupsXml(spec));

  x.push(
    `      <column caption='${esc(csvFile)}' datatype='table' name='[__tableau_internal_object_id__].${objidB}' role='measure' type='quantitative' />\n`
  );
  x.push("      <layout dim-ordering='alphabetic' measure-ordering='alphabetic' show-structure='true' />\n");

  // conditional color (datasource <style>) — CONFIRMED pattern
  x.push(colorStyleBlock(spec));

  x.push("      <object-graph>\n        <objects>\n");
  x.push(`          <object caption='${esc(csvFile)}' id='${objid}'>\n`);
  x.push("            <properties context=''>\n");
  x.push(`              <relation connection='${connName}' name='${esc(csvFile)}' table='${table}' type='table'>\n`);
  x.push(relationColumns("                ", fields));
  x.push("              </relation>\n");
  x.push("            </properties>\n          </object>\n");
  x.push("        </objects>\n      </object-graph>\n");
  x.push("    </datasource>\n");
  return { xml: x.join(""), dsName };
}

function tableauType(t: FieldType): string {
  return t === "string" ? "nominal" : t === "date" ? "ordinal" : "quantitative";
}

// --- parameters (separate inline datasource) — CONFIRMED pattern -------------
// (Reserved for future UI; emitted only if spec carries parameters.)

// --- worksheet ---------------------------------------------------------------

function worksheetXml(
  ws: WorksheetSpec,
  spec: WorkbookSpec,
  dsName: string,
  dsCaption: string,
  filterFieldNames: string[] = []
): string {
  const reg = buildRegistry(spec);

  // resolve fields
  const dim = ws.dimension ? reg.get(ws.dimension) : undefined;
  const measFields: { f: GenField; pill: MeasurePill; pfx: string }[] = [];
  for (const m of ws.measures) {
    const f = reg.get(m.field);
    if (f) measFields.push({ f, pill: m, pfx: aggPrefix(m.agg) });
  }
  const colorF = ws.colorField ? reg.get(ws.colorField) : undefined;

  // attached quick filters: only physical STRING dimensions with real members
  // (keeps the confirmed `:nk` + quoted-member form load-safe)
  const filterPairs = filterFieldNames
    .map((n) => reg.get(n))
    .filter((f): f is GenField => !!f && f.type === "string" && !f.isCalc)
    .map((f) => ({ f, members: distinctMembers(spec, f.display) }))
    .filter((p) => p.members.length > 0);

  // build dependency lists (ALL <column> first, THEN all <column-instance>)
  const depCols = new Map<string, GenField>();
  const addDep = (f?: GenField) => {
    if (f) depCols.set(f.local, f);
  };
  addDep(dim);
  for (const mf of measFields) addDep(mf.f);
  addDep(colorF);
  for (const p of filterPairs) addDep(p.f);

  const x: string[] = [];
  x.push(`    <worksheet name='${esc(ws.name)}'>\n`);
  x.push("      <table>\n");
  x.push("        <view>\n");
  x.push("          <datasources>\n");
  x.push(`            <datasource caption='${esc(dsCaption)}' name='${dsName}' />\n`);
  x.push("          </datasources>\n");
  x.push(`          <datasource-dependencies datasource='${dsName}'>\n`);
  for (const f of depCols.values()) {
    x.push(
      `            <column datatype='${f.type}' name='${f.local}' role='${f.role}' type='${tableauType(
        f.type
      )}' />\n`
    );
  }
  // column-instances (dedup by instance name)
  const emitted = new Set<string>();
  const inst = (f: GenField, derivation: string, name: string) => {
    if (emitted.has(name)) return;
    emitted.add(name);
    x.push(instanceLine(f, derivation, name));
  };
  if (dim) inst(dim, "None", dimInstance(dim.base));
  for (const mf of measFields) inst(mf.f, aggDerivation(mf.pill.agg), measInstance(mf.f.base, mf.pfx));
  if (colorF) {
    if (colorF.role === "measure") inst(colorF, "Sum", measInstance(colorF.base, "sum"));
    else inst(colorF, "None", dimInstance(colorF.base));
  }
  for (const p of filterPairs) inst(p.f, "None", dimInstance(p.f.base));
  x.push("          </datasource-dependencies>\n");

  // Orientation: a Bar chart reads best HORIZONTALLY — category down the rows,
  // measure across the cols (so long text labels list cleanly on the left
  // instead of truncating to "B.." under cramped vertical bars). Line/Area keep
  // the category on the cols (a left-to-right time axis). Mirrors LaDataViz /
  // Template.twb, where the bar worksheet put [Region] on rows, [Sales] on cols.
  // Only a single-measure bar flips horizontal — a multi-measure (stacked) bar
  // keeps measures on rows / dimension on cols (the established layout).
  const horizontalBar = ws.mark === "Bar" && measFields.length <= 1;
  const dimPill = dim ? `[${dsName}].${dimInstance(dim.base)}` : "";
  const measPills = measFields
    .map((mf) => `[${dsName}].${measInstance(mf.f.base, mf.pfx)}`)
    .join(" ");
  const meas0Inst = measFields[0]
    ? `[${dsName}].${measInstance(measFields[0].f.base, measFields[0].pfx)}`
    : "";

  // NOTE: no <shelf-sorts> here — that element is not in the 2026.2 <view>
  // content model (datasources?, datasource-dependencies*, filter, sort,
  // perspectives, slices?, aggregation) and triggers load error D2E8DA72.
  // Bars render in natural data order, which is fine for the sample data.

  // quick filters (CONFIRMED) + slices, before aggregation
  for (const p of filterPairs) x.push(filterBlock(dsName, p.f, p.members));
  if (filterPairs.length) {
    x.push("          <slices>\n");
    for (const p of filterPairs) x.push(`            <column>[${dsName}].${dimInstance(p.f.base)}</column>\n`);
    x.push("          </slices>\n");
  }

  x.push("          <aggregation value='true' />\n");
  x.push("        </view>\n");

  // worksheet style: clean LaDataViz look (hidden axes/gridlines/field labels)
  // plus solid mark color + data labels. For a bar chart the measure axis (the
  // numbers) is hidden since the value labels carry the magnitude.
  x.push(
    worksheetStyleXml(horizontalBar && meas0Inst ? { measAxisField: meas0Inst, measAxisScope: "cols" } : {})
  );

  // panes — one per measure (stacked); dual axis falls back to stacked safely
  const colorInstance =
    colorF && colorF.role !== "measure" ? `[${dsName}].${dimInstance(colorF.base)}` : undefined;
  x.push("        <panes>\n");
  const paneCount = Math.max(1, measFields.length);
  for (let i = 0; i < paneCount; i++) {
    const idAttr = i === 0 ? "" : ` id='${i}'`;
    x.push(`          <pane${idAttr} selection-relaxation-option='selection-relaxation-allow'>\n`);
    x.push("            <view>\n              <breakdown value='auto' />\n            </view>\n");
    x.push(`            <mark class='${ws.mark}' />\n`);
    // marks-scaling-off + a large mark size = fat marks that FILL the plot area
    // (the LaDataViz look) instead of thin default bars floating in whitespace.
    x.push("            <mark-sizing mark-sizing-setting='marks-scaling-off' />\n");
    if (colorInstance) {
      x.push("            <encodings>\n");
      x.push(`              <color column='${colorInstance}' />\n`);
      x.push("            </encodings>\n");
    }
    x.push(markPaneStyle(ws));
    x.push("          </pane>\n");
  }
  x.push("        </panes>\n");

  const rowsPills = horizontalBar ? dimPill : measPills;
  const colsPills = horizontalBar ? measPills : dimPill;
  x.push(`        <rows>${rowsPills}</rows>\n`);
  x.push(`        <cols>${colsPills}</cols>\n`);
  x.push("      </table>\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </worksheet>\n");
  return x.join("");
}

function instanceLine(f: GenField, derivation: string, instName: string): string {
  const pivotType = f.role === "measure" ? "quantitative" : "nominal";
  return `            <column-instance column='${f.local}' derivation='${derivation}' name='${instName}' pivot='key' type='${pivotType}' />\n`;
}

/** Distinct non-empty values of a physical field, from the sample/uploaded rows. */
function distinctMembers(spec: WorkbookSpec, fieldName: string): string[] {
  const idx = spec.data.fields.findIndex((f) => f.name === fieldName);
  if (idx < 0) return [];
  const set = new Set<string>();
  for (const r of spec.data.rows) {
    const v = r[idx];
    if (v != null && v !== "") set.add(v);
    if (set.size >= 50) break;
  }
  return [...set];
}

/** Categorical quick-filter on a string dimension (CONFIRMED pattern). */
function filterBlock(dsName: string, f: GenField, members: string[]): string {
  const inst = dimInstance(f.base);
  const o: string[] = [];
  o.push(`          <filter class='categorical' column='[${dsName}].${inst}'>\n`);
  o.push(
    "            <groupfilter function='union' user:ui-domain='database' user:ui-enumeration='inclusive' user:ui-marker='enumerate'>\n"
  );
  for (const m of members)
    o.push(`              <groupfilter function='member' level='${inst}' member='&quot;${esc(m)}&quot;' />\n`);
  o.push("            </groupfilter>\n");
  o.push("          </filter>\n");
  return o.join("");
}

/** Hidden sheet_link groups that filter actions require (CONFIRMED pattern). */
function actionGroupsXml(spec: WorkbookSpec): string {
  if (!spec.includeActions) return "";
  const reg = buildRegistry(spec);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of spec.actions) {
    if (a.kind !== "filter" || !a.field) continue;
    const f = reg.get(a.field);
    if (!f || seen.has(f.local)) continue;
    seen.add(f.local);
    out.push(
      `      <group caption='Action (${esc(a.field)})' hidden='true' name='[Action (${esc(
        a.field
      )})]' name-style='unqualified' user:auto-column='sheet_link'>\n`
    );
    out.push("        <groupfilter function='crossjoin'>\n");
    out.push(`          <groupfilter function='level-members' level='${f.local}' />\n`);
    out.push("        </groupfilter>\n");
    out.push("      </group>\n");
  }
  return out.join("");
}

/**
 * Worksheet <style> — the clean LaDataViz look, ported from the confirmed-
 * opening Template.twb: transparent table background, hidden axis lines,
 * gridlines and zero lines, hidden shelf field labels (so a stray "Region"
 * title doesn't sit over the chart), plus the optional solid mark color and
 * data labels. `measAxisField` (when given) hides the measure axis header — the
 * value labels carry the magnitude instead, as in the reference bar charts.
 */
function worksheetStyleXml(
  opts: { measAxisField?: string; measAxisScope?: "rows" | "cols" }
): string {
  const o: string[] = ["        <style>\n"];

  // axis: no line; optionally hide the measure axis numbers entirely
  o.push("          <style-rule element='axis'>\n");
  o.push("            <format attr='stroke-size' value='0' />\n");
  o.push("            <format attr='line-visibility' value='off' />\n");
  if (opts.measAxisField)
    o.push(
      `            <format attr='display' class='0' field='${opts.measAxisField}' scope='${
        opts.measAxisScope ?? "cols"
      }' value='false' />\n`
    );
  o.push("          </style-rule>\n");

  // transparent worksheet background (the dashboard card supplies the white fill)
  o.push("          <style-rule element='table'>\n");
  o.push("            <format attr='background-color' value='#00000000' />\n");
  o.push("          </style-rule>\n");

  // hide the shelf field labels ("Region" / measure name) on both axes
  o.push("          <style-rule element='worksheet'>\n");
  o.push("            <format attr='display-field-labels' scope='rows' value='false' />\n");
  o.push("            <format attr='display-field-labels' scope='cols' value='false' />\n");
  o.push("          </style-rule>\n");

  // hide gridlines and zero lines
  o.push("          <style-rule element='gridline'>\n");
  o.push("            <format attr='line-visibility' value='off' />\n");
  o.push("            <format attr='stroke-size' value='0' />\n");
  o.push("          </style-rule>\n");
  o.push("          <style-rule element='zeroline'>\n");
  o.push("            <format attr='line-visibility' value='off' />\n");
  o.push("            <format attr='stroke-size' value='0' />\n");
  o.push("          </style-rule>\n");

  // NOTE: mark color / size / labels live in the PANE style (markPaneStyle),
  // exactly like the LaDataViz reference — not here in the worksheet style.
  o.push("        </style>\n");
  return o.join("");
}

/**
 * Pane <style> — the mark appearance, ported from the LaDataViz reference:
 *   - a large `size` so marks fill the plot area (fat bars / thick areas)
 *   - solid neutral `mark-color` (unless a categorical color field is used)
 *   - bold, color-matched data labels; bars label every mark, line/area only
 *     the line ends (the single end-of-series value in the reference)
 *   - line/area get point markers; area gets a translucent fill
 */
function markPaneStyle(ws: WorksheetSpec): string {
  const isBar = ws.mark === "Bar";
  const isLine = ws.mark === "Line";
  const isArea = ws.mark === "Area";
  const size = isBar ? "0.9" : isLine || isArea ? "0.5" : "0.7";
  const labelMode = isBar ? "all" : "line-ends";

  const o: string[] = ["            <style>\n"];
  o.push("              <style-rule element='datalabel'>\n");
  o.push("                <format attr='color-mode' value='match' />\n");
  o.push("                <format attr='font-weight' value='bold' />\n");
  o.push("              </style-rule>\n");
  o.push("              <style-rule element='mark'>\n");
  o.push(`                <format attr='size' value='${size}' />\n`);
  if (ws.markColor && !ws.colorField)
    o.push(`                <format attr='mark-color' value='${ws.markColor}' />\n`);
  if (ws.showLabels) {
    o.push("                <format attr='mark-labels-show' value='true' />\n");
    o.push(`                <format attr='mark-labels-mode' value='${labelMode}' />\n`);
    o.push("                <format attr='mark-labels-cull' value='false' />\n");
  }
  if (isLine || isArea) o.push("                <format attr='mark-markers-mode' value='all' />\n");
  // Standalone area (no opaque line layered on top like the reference) needs a
  // higher opacity than the reference's 27 or it washes out to near-white.
  if (isArea) o.push("                <format attr='mark-transparency' value='65' />\n");
  o.push("              </style-rule>\n");
  o.push("            </style>\n");
  return o.join("");
}

// --- dashboard ---------------------------------------------------------------

function zoneStyle(
  bg: string | undefined,
  bc: string,
  bs: string,
  bw: string,
  margin: string,
  padding?: string,
  corner?: number
): string {
  const s: string[] = ["          <zone-style>\n"];
  s.push(`            <format attr='border-color' value='${bc}' />\n`);
  s.push(`            <format attr='border-style' value='${bs}' />\n`);
  s.push(`            <format attr='border-width' value='${bw}' />\n`);
  s.push(`            <format attr='margin' value='${margin}' />\n`);
  if (padding) s.push(`            <format attr='padding' value='${padding}' />\n`);
  if (bg) s.push(`            <format attr='background-color' value='${bg}' />\n`);
  s.push(cornerXml(corner));
  s.push("          </zone-style>\n");
  return s.join("");
}

/** Rounded-corner format lines (Figma cornerRadius → Tableau). Empty for 0. */
function cornerXml(radius: number | undefined): string {
  const r = radius == null ? 0 : Math.max(0, Math.round(radius));
  if (r <= 0) return "";
  const p = "            <_.fcp.DashboardRoundedCorners.true...format attr=";
  return (
    `${p}'corner-radius' value='${r}' />\n` +
    `${p}'corner-radius-top-right' value='${r}' />\n` +
    `${p}'corner-radius-bottom-left' value='${r}' />\n` +
    `${p}'corner-radius-bottom-right' value='${r}' />\n`
  );
}

function clampN(v: number, fw: number): number {
  // NaN/Infinity-proof: a Figma node with no resolvable bounding box would
  // otherwise emit a "NaN" attribute and break the workbook on load.
  if (!Number.isFinite(v) || !Number.isFinite(fw) || fw <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100000, (v / fw) * 100000)));
}

// Fonts that ship with Windows (so Tableau renders them at their true width
// instead of substituting a wider fallback that overflows / truncates the
// zone). A design font not in this set (Roboto/Inter/Poppins/etc.) is mapped to
// Segoe UI — the Windows system sans-serif, close in proportion to Inter/Roboto.
const WINDOWS_SAFE_FONTS = new Set([
  "segoe ui", "segoe ui semibold", "segoe ui light", "arial", "arial black",
  "calibri", "cambria", "candara", "consolas", "constantia", "corbel",
  "courier new", "franklin gothic medium", "gabriola", "georgia", "impact",
  "lucida console", "lucida sans unicode", "palatino linotype", "tahoma",
  "times new roman", "trebuchet ms", "verdana",
]);

function safeFont(family: string | undefined): string {
  if (!family) return "Segoe UI";
  return WINDOWS_SAFE_FONTS.has(family.trim().toLowerCase()) ? family : "Segoe UI";
}

// LaDataViz-style helpers (mirrors confirmed-opening Template.twb shapes) -------

/** Margin-only zone-style for flow containers (no border/bg, like LaDataViz). */
function containerStyle(margin = "8"): string {
  return (
    "          <zone-style>\n" +
    "            <format attr='border-style' value='none' />\n" +
    "            <format attr='border-width' value='0' />\n" +
    `            <format attr='margin' value='${margin}' />\n` +
    "          </zone-style>\n"
  );
}

/** Card zone-style for a worksheet wrapper: white bg, light border, padding. */
function cardStyle(bg = "#FFFFFF"): string {
  return (
    "          <zone-style>\n" +
    "            <format attr='border-color' value='#E3E6F0' />\n" +
    "            <format attr='border-style' value='solid' />\n" +
    "            <format attr='border-width' value='1' />\n" +
    "            <format attr='margin' value='6' />\n" +
    "            <format attr='padding' value='16' />\n" +
    `            <format attr='background-color' value='${bg}' />\n` +
    "          </zone-style>\n"
  );
}

function dashboardXml(
  dash: DashboardSpec,
  dsName: string,
  reg: Map<string, GenField>
): { xml: string; sheetNames: string[] } {
  const fw = dash.widthPx || 1280;
  const fh = dash.heightPx || 800;
  const sheetNames: string[] = [];
  let zid = 2;
  const nid = () => ++zid;
  const zoneById = new Map(dash.zones.map((z) => [z.id, z] as const));

  // A zone "flexes" (absorbs free space in its flow) only if it is a real chart
  // sheet. KPIs, text, buttons, filters and images are pinned to their Figma
  // size — this is exactly the Template.twb rule (chart areas flexible, headers
  // / labels fixed-size), and it's what keeps KPI/header rows short instead of
  // ballooning to an equal share of the height.
  const zoneFlexible = (z: ZoneSpec): boolean => z.kind === "sheet" && !z.isKpi;
  const nodeFlexible = (node: LayoutNode): boolean => {
    if (!isContainer(node)) {
      const z = zoneById.get(node.zone);
      return !!z && zoneFlexible(z);
    }
    return node.children.some(nodeFlexible);
  };

  // Emit one leaf zone (sheet / image / filter / text / button). In `tiled`
  // mode, sheets are card-wrapped and zones carry a `friendly-name` (the Figma
  // layer name) to mirror the LaDataViz reference output. `parentDir` lets a
  // non-flexible leaf pin its natural pixel size so it keeps its height in a
  // vert flow (width in a horz flow) instead of stretching.
  const emitZone = (z: ZoneSpec, tiled = false, parentDir?: "horz" | "vert"): string => {
    const X = clampN(z.x, fw);
    const Y = clampN(z.y, fh);
    const W = Math.max(1, clampN(z.w, fw));
    const H = Math.max(1, clampN(z.h, fh));
    const o: string[] = [];
    const fn = z.friendlyName ? ` friendly-name='${esc(z.friendlyName)}'` : "";
    // Chart sheets flex to fill; everything else is pinned to its Figma size.
    const fixedPx = zoneFlexible(z) ? 0 : Math.round(parentDir === "horz" ? z.w : z.h);
    const fix = tiled && parentDir && fixedPx > 0 ? ` fixed-size='${fixedPx}' is-fixed='true'` : "";

    if (z.kind === "sheet" && z.worksheet) {
      sheetNames.push(z.worksheet);
      // ":showTitle" (LaDataViz) -> render the worksheet's own title bar; default
      // hidden, since the design usually supplies its own heading text.
      const showTitle = z.showTitle ? "true" : "false";
      if (tiled) {
        o.push(`        <zone${fn}${fix} h='${H}' id='${nid()}' name='${esc(z.worksheet)}' show-title='${showTitle}' w='${W}' x='${X}' y='${Y}'>\n`);
        o.push("          <layout-cache cell-count-h='1' cell-count-w='1' type-h='cell' type-w='cell' />\n");
        o.push(cardStyle(z.bg || "#FFFFFF"));
        o.push("        </zone>\n");
      } else {
        // Floating worksheet zone — mirrors the LaDataViz Template.twbx SHEET/
        // zones: keep the Figma layer name as friendly-name, honor :showTitle,
        // and carry the layout-cache Tableau writes for a placed sheet.
        o.push(`        <zone${fn} h='${H}' id='${nid()}' name='${esc(z.worksheet)}' show-title='${showTitle}' w='${W}' x='${X}' y='${Y}'>\n`);
        o.push("          <layout-cache cell-count-h='1' cell-count-w='1' type-h='cell' type-w='cell' />\n");
        // White ROUNDED card, no border, small padding so the chart fills the box
        // (the LaDataViz card look). The fat marks (markPaneStyle) do the filling.
        // Corner radius comes from the Figma container (default 10 if unknown).
        o.push(zoneStyle(z.bg || "#FFFFFF", "#000000", "none", "0", "0", "8", z.cornerRadius ?? 10));
        o.push("        </zone>\n");
      }
    } else if (z.kind === "image" && z.imageFile) {
      // bitmap zone (CONFIRMED schema from VOTD.twbx): self-closing, param=path.
      // In a flow, pin it (a logo/sidebar must keep its size, not flex to 50%).
      const sc = z.scaled === false ? "is-centered='1' is-scaled='0'" : "is-centered='0' is-scaled='1'";
      o.push(
        `        <zone${fn}${fix} h='${H}' id='${nid()}' ${sc} param='Image/${esc(z.imageFile)}' type-v2='bitmap' w='${W}' x='${X}' y='${Y}' />\n`
      );
    } else if (z.kind === "filter" && z.worksheet && z.field) {
      // dashboard quick-filter card bound to a worksheet + dimension (CONFIRMED)
      const f = reg.get(z.field);
      const param = f ? `[${dsName}].${dimInstance(f.base)}` : `[${dsName}].[none:${z.field}:nk]`;
      o.push(
        `        <zone${fn}${fix} h='${H}' id='${nid()}' mode='checkdropdown' name='${esc(z.worksheet)}' param='${param}' type-v2='filter' w='${W}' x='${X}' y='${Y}'>\n`
      );
      o.push(zoneStyle(z.bg || "#FFFFFF", z.fg || "#D7DAEC", "solid", "1", "3", "6"));
      o.push("        </zone>\n");
    } else if (z.kind === "web" && z.url) {
      // Web page object — confirmed schema from "Using Web Page Object in
      // Tableau.twb": forceUpdate='' + param='<URL>' + type-v2='web', with a
      // borderless zone-style. The URL is XML-escaped (it can carry & and =).
      o.push(
        `        <zone${fn}${fix} forceUpdate='' h='${H}' id='${nid()}' param='${esc(z.url)}' type-v2='web' w='${W}' x='${X}' y='${Y}'>\n`
      );
      o.push(zoneStyle(undefined, "#000000", "none", "0", "4"));
      o.push("        </zone>\n");
    } else if (z.kind === "rect") {
      // Faithful transpile of a Figma shape/card/bar: a colored `empty` zone
      // (the LaDataViz pattern — every rectangle becomes a background-filled
      // empty zone). No worksheet, no data; purely visual.
      o.push(`        <zone${fn}${fix} h='${H}' id='${nid()}' type-v2='empty' w='${W}' x='${X}' y='${Y}'>\n`);
      const hasStroke = !!z.strokeColor && (z.strokeWidth ?? 0) > 0;
      o.push(
        zoneStyle(
          z.bg,
          z.strokeColor || "#000000",
          hasStroke ? "solid" : "none",
          hasStroke ? String(Math.max(1, Math.round(z.strokeWidth || 1))) : "0",
          "0",
          undefined,
          z.cornerRadius // rounded Figma rect/card → rounded zone
        )
      );
      o.push("        </zone>\n");
    } else {
      // text and button (button rendered as a styled text zone — load-safe)
      const isButton = z.kind === "button";
      o.push(`        <zone${fn}${fix} h='${H}' id='${nid()}' type-v2='text' w='${W}' x='${X}' y='${Y}'>\n`);
      o.push("          <formatted-text>\n");
      // Shared run-attribute builder (a multi-size text layer becomes one <run>
      // per style so a KPI value keeps its big font instead of collapsing).
      const runXml = (
        text: string,
        opt: { size?: number; family?: string; color?: string; bold?: boolean }
      ): string => {
        let attrs = "";
        if (opt.bold || isButton) attrs += " bold='true'";
        if (opt.family) attrs += ` fontname='${esc(safeFont(opt.family))}'`;
        attrs += ` fontsize='${opt.size || (isButton ? 13 : 14)}'`;
        attrs += ` fontcolor='${opt.color || (isButton ? "#FFFFFF" : "#101828")}'`;
        if (z.align != null) attrs += ` fontalignment='${z.align}'`;
        else if (isButton) attrs += " fontalignment='1'";
        return `            <run${attrs}>${esc(text)}</run>\n`;
      };
      if (z.runs && z.runs.length > 1) {
        for (const r of z.runs)
          if (r.text)
            o.push(
              runXml(r.text, {
                size: r.fontSize ? Math.round(r.fontSize) : z.fontSize,
                family: r.fontFamily || z.fontFamily,
                color: r.fontColor || z.fg,
                bold: r.bold ?? z.bold,
              })
            );
      } else {
        const label = z.text || (isButton ? z.targetDashboard || "Button" : "");
        if (label)
          o.push(runXml(label, { size: z.fontSize, family: z.fontFamily, color: z.fg, bold: z.bold }));
      }
      o.push("          </formatted-text>\n");
      const bg = z.bg || (isButton ? "#2563EB" : undefined);
      // Text zones: padding 0 + minimal margin (matches the LaDataViz reference).
      // Our old padding=6/margin=3 ate ~12px on each axis, which clipped glyph
      // tops and truncated values in the small KPI zones.
      o.push(
        zoneStyle(
          bg,
          isButton ? "#1E4FBF" : "#000000",
          isButton ? "solid" : "none",
          isButton ? "1" : "0",
          isButton ? "3" : "1",
          isButton ? "10" : "0"
        )
      );
      o.push("        </zone>\n");
    }
    return o.join("");
  };

  // Bounding box (px) of a tiled node = union of its descendant zones.
  const boundsOf = (node: LayoutNode): { x: number; y: number; w: number; h: number } | null => {
    if (!isContainer(node)) {
      const z = zoneById.get(node.zone);
      return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null;
    }
    const bs = node.children
      .map(boundsOf)
      .filter((b): b is { x: number; y: number; w: number; h: number } => !!b);
    if (!bs.length) return null;
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    const x2 = Math.max(...bs.map((b) => b.x + b.w));
    const y2 = Math.max(...bs.map((b) => b.y + b.h));
    return { x, y, w: x2 - x, h: y2 - y };
  };

  // Emit a layout-flow container. Mirrors LaDataViz Template.twb: friendly-name
  // = the Figma frame name, distribute-evenly strategy, margin-only zone-style.
  const emitContainer = (
    c: ContainerSpec,
    placed: Set<string>,
    parentDir?: "horz" | "vert"
  ): string => {
    const b = boundsOf(c);
    if (!b) return "";
    const X = clampN(b.x, fw);
    const Y = clampN(b.y, fh);
    const W = Math.max(1, clampN(b.w, fw));
    const H = Math.max(1, clampN(b.h, fh));
    const fn = c.name ? ` friendly-name='${esc(c.name)}'` : "";
    // A container that holds NO flexible chart (e.g. a header row or a KPI row)
    // is pinned to its Figma extent along the parent's flow axis — mirrors the
    // Template.twb `fixed-size='44' is-fixed='true'` on its header row. A
    // container that DOES hold a chart stays flexible to absorb free space.
    // NOTE: deliberately NO `layout-strategy-id='distribute-evenly'` — that
    // forces every child to an equal share and stretches titles/sidebars.
    const fixPx = parentDir && !nodeFlexible(c) ? Math.round(parentDir === "horz" ? b.w : b.h) : 0;
    const fix = fixPx > 0 ? ` fixed-size='${fixPx}' is-fixed='true'` : "";
    const o: string[] = [
      `        <zone${fn}${fix} h='${H}' id='${nid()}' param='${c.direction}' type-v2='layout-flow' w='${W}' x='${X}' y='${Y}'>\n`,
    ];
    for (const ch of c.children) {
      if (isContainer(ch)) o.push(emitContainer(ch, placed, c.direction));
      else {
        const z = zoneById.get(ch.zone);
        if (z) {
          placed.add(z.id);
          o.push(emitZone(z, true, c.direction));
        }
      }
    }
    o.push(containerStyle());
    o.push("        </zone>\n");
    return o.join("");
  };

  const x: string[] = [`    <dashboard name='${esc(dash.name)}'>\n`];
  x.push("      <style />\n");
  // Explicit `sizing-mode='fixed'` matches the proven LaDataViz reference
  // (Template.twb). A fixed-size dashboard is scaled-to-fit (aspect preserved)
  // by Tableau in presentation / slideshow mode; combined with the window's
  // `maximized='true'` (see windowsXml) it opens filling the screen instead of
  // sitting at actual pixel size with scrollbars.
  x.push(
    `      <size maxheight='${fh}' maxwidth='${fw}' minheight='${fh}' minwidth='${fw}' sizing-mode='fixed' />\n`
  );
  x.push("        <zones>\n");
  x.push(`          <zone h='100000' id='2' type-v2='layout-basic' w='100000' x='0' y='0'>\n`);

  // Full-frame background image sits behind everything (background-image mode).
  if (dash.backgroundImage && dash.backgroundImageFile) {
    x.push(
      `        <zone h='100000' id='${nid()}' is-centered='0' is-scaled='1' param='Image/${esc(
        dash.backgroundImageFile
      )}' type-v2='bitmap' w='100000' x='0' y='0' />\n`
    );
  }

  if (dash.layoutMode === "tiled" && dash.root) {
    const placed = new Set<string>();
    x.push(emitContainer(dash.root, placed));
    // any zones not referenced by the container tree fall back to floating
    for (const z of dash.zones) if (!placed.has(z.id)) x.push(emitZone(z));
  } else {
    for (const z of dash.zones) x.push(emitZone(z));
  }

  x.push(zoneStyle(dash.bg || "#F4F5FB", "#C8CCE4", "solid", "2", "8"));
  x.push("          </zone>\n        </zones>\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </dashboard>\n");
  return { xml: x.join(""), sheetNames };
}

// --- windows -----------------------------------------------------------------

const WS_CARDS =
  "      <cards>\n        <edge name='left'>\n          <strip size='160'>\n            <card type='pages' />\n            <card type='filters' />\n            <card type='marks' />\n          </strip>\n        </edge>\n        <edge name='top'>\n          <strip size='2147483647'>\n            <card type='columns' />\n          </strip>\n          <strip size='2147483647'>\n            <card type='rows' />\n          </strip>\n          <strip size='30'>\n            <card type='title' />\n          </strip>\n        </edge>\n      </cards>\n";

function windowsXml(wsNames: string[], dashboards: { name: string; sheets: string[] }[]): string {
  const x: string[] = ["  <windows source-height='44'>\n"];
  for (const nm of wsNames) {
    x.push(`    <window class='worksheet' name='${esc(nm)}'>\n`);
    x.push(WS_CARDS);
    // The worksheet's own default fit = Entire View (the chart fills its pane
    // instead of sizing to content). Confirmed from DM_Dashboards.twb: a
    // <viewpoint> after <cards> carrying <zoom type='entire-view'/>.
    x.push("      <viewpoint>\n        <zoom type='entire-view' />\n      </viewpoint>\n");
    x.push(`      <simple-id uuid='${uid()}' />\n`);
    x.push("    </window>\n");
  }
  for (const d of dashboards) {
    // maximized='true' -> the workbook opens with the dashboard filling the
    // window (matches the LaDataViz reference); this is what makes it "adjust"
    // to the screen instead of opening at actual pixel size.
    x.push(`    <window class='dashboard' maximized='true' name='${esc(d.name)}'>\n`);
    x.push("      <viewpoints>\n");
    // Each sheet AS PLACED on the dashboard also defaults to Entire View so the
    // graph fills its zone/card (same <zoom> inside the named viewpoint).
    for (const s of d.sheets)
      x.push(
        `        <viewpoint name='${esc(s)}'>\n          <zoom type='entire-view' />\n        </viewpoint>\n`
      );
    x.push("      </viewpoints>\n");
    x.push("      <active id='-1' />\n");
    x.push(`      <simple-id uuid='${uid()}' />\n`);
    x.push("    </window>\n");
  }
  x.push("  </windows>\n");
  return x.join("");
}

// --- actions (CONFIRMED patterns; emitted only if includeActions) ------------
// highlight = tsc:brush (no group, safest); filter = tsc:tsl-filter (its hidden
// sheet_link group is emitted in the datasource by actionGroupsXml).

function actionsXml(spec: WorkbookSpec): string {
  if (!spec.includeActions || spec.actions.length === 0) return "";
  const runType = (a: { runOn: string }) =>
    a.runOn === "hover" ? "on-hover" : a.runOn === "menu" ? "on-menu" : "on-select";
  // Map each worksheet to the dashboard it is placed on, so a filter action's
  // `<source dashboard=...>` names the dashboard its source sheet actually lives
  // on (critical once an export carries MULTIPLE dashboards). Falls back to the
  // first dashboard for any sheet not placed on one.
  const fallback = spec.dashboards[0]?.name ?? "Dashboard";
  const sheetDash = new Map<string, string>();
  for (const d of spec.dashboards)
    for (const z of d.zones)
      if (z.kind === "sheet" && z.worksheet && !sheetDash.has(z.worksheet)) sheetDash.set(z.worksheet, d.name);
  const dashOf = (sheet: string) => sheetDash.get(sheet) ?? fallback;
  const x: string[] = ["  <actions>\n"];
  let n = 0;
  for (const a of spec.actions) {
    n++;
    const name = `[Action${n}]`;
    x.push(`    <action caption='${esc(a.name)}' name='${name}'>\n`);
    x.push(`      <activation auto-clear='true' type='${runType(a)}' />\n`);
    if (a.kind === "highlight") {
      x.push(`      <source type='sheet' worksheet='${esc(a.sourceSheet)}' />\n`);
      x.push("      <command command='tsc:brush'>\n");
      if (a.field) x.push(`        <param name='field-captions' value='${esc(a.field)}' />\n`);
      x.push(`        <param name='target' value='${esc(a.target || a.sourceSheet)}' />\n`);
      x.push("      </command>\n");
    } else {
      // filter — sourced from the dashboard holding the source sheet
      const srcDash = dashOf(a.sourceSheet);
      x.push(`      <source dashboard='${esc(srcDash)}' type='sheet' worksheet='${esc(a.sourceSheet)}' />\n`);
      x.push("      <command command='tsc:tsl-filter'>\n");
      x.push("        <param name='special-fields' value='all' />\n");
      x.push(`        <param name='target' value='${esc(a.target || srcDash)}' />\n`);
      x.push("      </command>\n");
    }
    x.push("    </action>\n");
  }
  x.push("  </actions>\n");
  return x.join("");
}

// --- assemble ----------------------------------------------------------------

export function generateWorkbookXml(spec: WorkbookSpec, dataDirectory: string): string {
  const ds = datasourceXml(spec, dataDirectory);
  const dsCaption = spec.workbookName + " Data";
  const reg = buildRegistry(spec);

  // gather dashboard filter-card fields per bound worksheet
  const filtersByWs = new Map<string, Set<string>>();
  for (const d of spec.dashboards)
    for (const z of d.zones)
      if (z.kind === "filter" && z.worksheet && z.field) {
        const s = filtersByWs.get(z.worksheet) ?? new Set<string>();
        s.add(z.field);
        filtersByWs.set(z.worksheet, s);
      }

  const dashOut = spec.dashboards.map((d) => dashboardXml(d, ds.dsName, reg));
  // Imported (real) worksheets are spliced verbatim; their names join the window
  // list so each gets a standard worksheet <window> (load-safe) and shows up in
  // the dashboard viewpoints alongside our generated sheets.
  const importedWsNames = spec.imports ? [...spec.imports.worksheetXml.keys()] : [];
  const wsNames = [...spec.worksheets.map((w) => w.name), ...importedWsNames];

  const out: string[] = [];
  out.push("<?xml version='1.0' encoding='utf-8' ?>\n");
  out.push(
    `<workbook original-version='${TABLEAU.originalVersion}' source-build='${TABLEAU.sourceBuild}' ` +
      `source-platform='${TABLEAU.sourcePlatform}' version='${TABLEAU.version}' ` +
      `xmlns:user='http://www.tableausoftware.com/xml/user'>\n`
  );
  out.push(manifestXml(spec));
  out.push(
    "  <preferences>\n    <preference name='ui.encoding.shelf.height' value='24' />\n    <preference name='ui.shelf.height' value='26' />\n  </preferences>\n"
  );
  out.push("  <datasources>\n");
  out.push(ds.xml);
  // Splice the imported datasources verbatim (their connections point at the
  // repackaged Data/ files; their names are referenced by the imported sheets).
  if (spec.imports) for (const dx of spec.imports.datasourceXml.values()) out.push(dx + "\n");
  out.push("  </datasources>\n");
  out.push("  <worksheets>\n");
  for (const ws of spec.worksheets)
    out.push(worksheetXml(ws, spec, ds.dsName, dsCaption, [...(filtersByWs.get(ws.name) ?? [])]));
  // Splice the user's real worksheets verbatim (never regenerated).
  if (spec.imports) for (const wx of spec.imports.worksheetXml.values()) out.push(wx + "\n");
  out.push("  </worksheets>\n");
  out.push("  <dashboards>\n");
  for (const d of dashOut) out.push(d.xml);
  out.push("  </dashboards>\n");
  out.push(
    windowsXml(
      wsNames,
      spec.dashboards.map((d, i) => ({ name: d.name, sheets: dashOut[i].sheetNames }))
    )
  );
  out.push(actionsXml(spec));
  out.push("</workbook>\n");
  return out.join("");
}
