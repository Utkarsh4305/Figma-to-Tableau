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

const MANIFEST =
  "  <document-format-change-manifest>\n" +
  MANIFEST_ENTRIES.map((e) => `    <${e} />\n`).join("") +
  "  </document-format-change-manifest>\n";

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

  // quick filters (CONFIRMED) + slices, before aggregation
  for (const p of filterPairs) x.push(filterBlock(dsName, p.f, p.members));
  if (filterPairs.length) {
    x.push("          <slices>\n");
    for (const p of filterPairs) x.push(`            <column>[${dsName}].${dimInstance(p.f.base)}</column>\n`);
    x.push("          </slices>\n");
  }

  x.push("          <aggregation value='true' />\n");
  x.push("        </view>\n");

  // worksheet style: solid mark color + labels (CONFIRMED pattern)
  x.push(styleBlock(ws));

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
    if (colorInstance) {
      x.push("            <encodings>\n");
      x.push(`              <color column='${colorInstance}' />\n`);
      x.push("            </encodings>\n");
    }
    x.push("          </pane>\n");
  }
  x.push("        </panes>\n");

  const rowsPills = measFields
    .map((mf) => `[${dsName}].${measInstance(mf.f.base, mf.pfx)}`)
    .join(" ");
  const colsPills = dim ? `[${dsName}].${dimInstance(dim.base)}` : "";
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

function styleBlock(ws: WorksheetSpec): string {
  const rules: string[] = [];
  if (ws.markColor && !ws.colorField) {
    rules.push(`          <format attr='mark-color' value='${ws.markColor}' />\n`);
  }
  if (ws.showLabels) {
    rules.push("          <format attr='mark-labels-show' value='true' />\n");
    rules.push("          <format attr='mark-labels-mode' value='all' />\n");
  }
  if (!rules.length) return "        <style />\n";
  return (
    "        <style>\n          <style-rule element='mark'>\n" +
    rules.join("") +
    "          </style-rule>\n        </style>\n"
  );
}

// --- dashboard ---------------------------------------------------------------

function zoneStyle(bg: string | undefined, bc: string, bs: string, bw: string, margin: string, padding?: string): string {
  const s: string[] = ["          <zone-style>\n"];
  s.push(`            <format attr='border-color' value='${bc}' />\n`);
  s.push(`            <format attr='border-style' value='${bs}' />\n`);
  s.push(`            <format attr='border-width' value='${bw}' />\n`);
  s.push(`            <format attr='margin' value='${margin}' />\n`);
  if (padding) s.push(`            <format attr='padding' value='${padding}' />\n`);
  if (bg) s.push(`            <format attr='background-color' value='${bg}' />\n`);
  s.push("          </zone-style>\n");
  return s.join("");
}

function clampN(v: number, fw: number): number {
  return Math.round(Math.max(0, Math.min(100000, (v / fw) * 100000)));
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

  // Emit one leaf zone (sheet / image / filter / text / button).
  const emitZone = (z: ZoneSpec): string => {
    const X = clampN(z.x, fw);
    const Y = clampN(z.y, fh);
    const W = Math.max(1, clampN(z.w, fw));
    const H = Math.max(1, clampN(z.h, fh));
    const o: string[] = [];

    if (z.kind === "sheet" && z.worksheet) {
      sheetNames.push(z.worksheet);
      o.push(`        <zone h='${H}' id='${nid()}' name='${esc(z.worksheet)}' w='${W}' x='${X}' y='${Y}'>\n`);
      o.push(zoneStyle(z.bg || "#FFFFFF", "#D7DAEC", "solid", "1", "4", "6"));
      o.push("        </zone>\n");
    } else if (z.kind === "image" && z.imageFile) {
      // bitmap zone (CONFIRMED schema from VOTD.twbx): self-closing, param=path.
      const sc = z.scaled === false ? "is-centered='1' is-scaled='0'" : "is-centered='0' is-scaled='1'";
      o.push(
        `        <zone h='${H}' id='${nid()}' ${sc} param='Image/${esc(z.imageFile)}' type-v2='bitmap' w='${W}' x='${X}' y='${Y}' />\n`
      );
    } else if (z.kind === "filter" && z.worksheet && z.field) {
      // dashboard quick-filter card bound to a worksheet + dimension (CONFIRMED)
      const f = reg.get(z.field);
      const param = f ? `[${dsName}].${dimInstance(f.base)}` : `[${dsName}].[none:${z.field}:nk]`;
      o.push(
        `        <zone h='${H}' id='${nid()}' mode='checkdropdown' name='${esc(z.worksheet)}' param='${param}' type-v2='filter' w='${W}' x='${X}' y='${Y}'>\n`
      );
      o.push(zoneStyle(z.bg || "#FFFFFF", z.fg || "#D7DAEC", "solid", "1", "3", "6"));
      o.push("        </zone>\n");
    } else {
      // text and button (button rendered as a styled text zone — load-safe)
      const isButton = z.kind === "button";
      o.push(`        <zone h='${H}' id='${nid()}' type-v2='text' w='${W}' x='${X}' y='${Y}'>\n`);
      o.push("          <formatted-text>\n");
      const label = z.text || (isButton ? z.targetDashboard || "Button" : "");
      if (label) {
        let attrs = "";
        if (z.bold || isButton) attrs += " bold='true'";
        attrs += ` fontsize='${z.fontSize || (isButton ? 13 : 14)}'`;
        attrs += ` fontcolor='${z.fg || (isButton ? "#FFFFFF" : "#101828")}'`;
        if (z.align != null) attrs += ` fontalignment='${z.align}'`;
        else if (isButton) attrs += " fontalignment='1'";
        o.push(`            <run${attrs}>${esc(label)}</run>\n`);
      }
      o.push("          </formatted-text>\n");
      const bg = z.bg || (isButton ? "#2563EB" : undefined);
      o.push(zoneStyle(bg, isButton ? "#1E4FBF" : "#000000", isButton ? "solid" : "none", isButton ? "1" : "0", "3", isButton ? "10" : "6"));
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

  // Emit a layout-flow container (CONFIRMED schema: no zone-style on container).
  const emitContainer = (c: ContainerSpec, placed: Set<string>): string => {
    const b = boundsOf(c);
    if (!b) return "";
    const X = clampN(b.x, fw);
    const Y = clampN(b.y, fh);
    const W = Math.max(1, clampN(b.w, fw));
    const H = Math.max(1, clampN(b.h, fh));
    const o: string[] = [
      `        <zone h='${H}' id='${nid()}' param='${c.direction}' type-v2='layout-flow' w='${W}' x='${X}' y='${Y}'>\n`,
    ];
    for (const ch of c.children) {
      if (isContainer(ch)) o.push(emitContainer(ch, placed));
      else {
        const z = zoneById.get(ch.zone);
        if (z) {
          placed.add(z.id);
          o.push(emitZone(z));
        }
      }
    }
    o.push("        </zone>\n");
    return o.join("");
  };

  const x: string[] = [`    <dashboard name='${esc(dash.name)}'>\n`];
  x.push("      <style />\n");
  x.push(`      <size maxheight='${fh}' maxwidth='${fw}' minheight='${fh}' minwidth='${fw}' />\n`);
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
    x.push(`      <simple-id uuid='${uid()}' />\n`);
    x.push("    </window>\n");
  }
  for (const d of dashboards) {
    x.push(`    <window class='dashboard' name='${esc(d.name)}'>\n`);
    x.push("      <viewpoints>\n");
    for (const s of d.sheets) x.push(`        <viewpoint name='${esc(s)}' />\n`);
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

function actionsXml(spec: WorkbookSpec, dashboardName: string): string {
  if (!spec.includeActions || spec.actions.length === 0) return "";
  const runType = (a: { runOn: string }) =>
    a.runOn === "hover" ? "on-hover" : a.runOn === "menu" ? "on-menu" : "on-select";
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
      // filter
      x.push(`      <source dashboard='${esc(dashboardName)}' type='sheet' worksheet='${esc(a.sourceSheet)}' />\n`);
      x.push("      <command command='tsc:tsl-filter'>\n");
      x.push("        <param name='special-fields' value='all' />\n");
      x.push(`        <param name='target' value='${esc(a.target || dashboardName)}' />\n`);
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
  const wsNames = spec.worksheets.map((w) => w.name);

  const out: string[] = [];
  out.push("<?xml version='1.0' encoding='utf-8' ?>\n");
  out.push(
    `<workbook original-version='${TABLEAU.originalVersion}' source-build='${TABLEAU.sourceBuild}' ` +
      `source-platform='${TABLEAU.sourcePlatform}' version='${TABLEAU.version}' ` +
      `xmlns:user='http://www.tableausoftware.com/xml/user'>\n`
  );
  out.push(MANIFEST);
  out.push(
    "  <preferences>\n    <preference name='ui.encoding.shelf.height' value='24' />\n    <preference name='ui.shelf.height' value='26' />\n  </preferences>\n"
  );
  out.push("  <datasources>\n");
  out.push(ds.xml);
  out.push("  </datasources>\n");
  out.push("  <worksheets>\n");
  for (const ws of spec.worksheets)
    out.push(worksheetXml(ws, spec, ds.dsName, dsCaption, [...(filtersByWs.get(ws.name) ?? [])]));
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
  out.push(actionsXml(spec, spec.dashboards[0]?.name ?? "Dashboard"));
  out.push("</workbook>\n");
  return out.join("");
}
