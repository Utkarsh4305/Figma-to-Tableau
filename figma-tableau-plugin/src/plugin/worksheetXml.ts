// ---------------------------------------------------------------------------
// worksheetXml.ts — worksheet XML generation (data worksheets + nav buttons).
// ---------------------------------------------------------------------------

import type { WorksheetSpec, WorkbookSpec, SpecField, MeasurePill } from "../shared/spec";
import { aggPrefix, aggDerivation } from "../shared/spec";
import type { GenField } from "./xmlUtils";
import type { DsCtx } from "./datasourceXml";
import { esc, uid, tableauType, dimInstance, measInstance, instanceLine, filterBlock } from "./xmlUtils";

export function buttonWorksheetXml(ws: WorksheetSpec, dsName: string, dsCaption: string): string {
  if (!ws.navButton) throw new Error(`Worksheet "${ws.name}" has no navButton data`);
  const b = ws.navButton;
  const cn = `Calculation_BTN_${ws.name.replace(/[^A-Za-z0-9]/g, "") || "x"}`;
  const colName = `[${cn}]`;
  const instName = `[none:${cn}:nk]`;
  const ref = `[${dsName}].${instName}`;
  const size = Math.max(7, Math.round(b.fontSize || 12));
  const x: string[] = [];
  x.push(`    <worksheet name='${esc(ws.name)}'>\n`);
  x.push("      <table>\n        <view>\n          <datasources>\n");
  x.push(`            <datasource caption='${esc(dsCaption)}' name='${dsName}' />\n`);
  x.push("          </datasources>\n");
  x.push(`          <datasource-dependencies datasource='${dsName}'>\n`);
  x.push(`            <column caption='${esc(b.caption)}' datatype='string' name='${colName}' role='dimension' type='nominal'>\n`);
  x.push(`              <calculation class='tableau' formula='&quot;${esc(b.caption)}&quot;' />\n`);
  x.push("            </column>\n");
  x.push(`            <column-instance column='${colName}' derivation='None' name='${instName}' pivot='key' type='nominal' />\n`);
  x.push("          </datasource-dependencies>\n");
  x.push("          <aggregation value='true' />\n        </view>\n");
  x.push("        <style>\n");
  x.push("          <style-rule element='cell'>\n            <format attr='text-align' value='center' />\n          </style-rule>\n");
  x.push(`          <style-rule element='table'>\n            <format attr='background-color' value='${b.bg}' />\n          </style-rule>\n`);
  x.push("        </style>\n");
  x.push("        <panes>\n          <pane selection-relaxation-option='selection-relaxation-allow'>\n");
  x.push("            <view>\n              <breakdown value='auto' />\n            </view>\n");
  x.push("            <mark class='Automatic' />\n");
  x.push(`            <encodings>\n              <text column='${ref}' />\n            </encodings>\n`);
  x.push("            <customized-label>\n              <formatted-text>\n");
  x.push(`                <run bold='true' fontcolor='${b.fg}' fontsize='${size}'>&lt;</run>\n`);
  x.push(`                <run bold='true' fontcolor='${b.fg}' fontsize='${size}'>${ref}</run>\n`);
  x.push(`                <run bold='true' fontcolor='${b.fg}' fontsize='${size}'>&gt;</run>\n`);
  x.push("              </formatted-text>\n            </customized-label>\n");
  x.push("            <style>\n              <style-rule element='mark'>\n                <format attr='mark-labels-show' value='true' />\n                <format attr='mark-labels-cull' value='true' />\n              </style-rule>\n            </style>\n");
  x.push("          </pane>\n        </panes>\n");
  x.push("        <rows />\n        <cols />\n      </table>\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </worksheet>\n");
  return x.join("");
}

/** Distinct non-empty values of a physical field, from the given rows. */
function distinctMembersIn(fields: SpecField[], rows: string[][], fieldName: string): string[] {
  const idx = fields.findIndex((f) => f.name === fieldName);
  if (idx < 0) return [];
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[idx];
    if (v != null && v !== "") set.add(v);
    if (set.size >= 50) break;
  }
  return [...set];
}

/**
 * Worksheet <style> — the clean LaDataViz look.
 */
function worksheetStyleXml(
  opts: { measAxisField?: string; measAxisScope?: "rows" | "cols" }
): string {
  const o: string[] = ["        <style>\n"];
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
  o.push("          <style-rule element='table'>\n");
  o.push("            <format attr='background-color' value='#00000000' />\n");
  o.push("          </style-rule>\n");
  o.push("          <style-rule element='worksheet'>\n");
  o.push("            <format attr='display-field-labels' scope='rows' value='false' />\n");
  o.push("            <format attr='display-field-labels' scope='cols' value='false' />\n");
  o.push("          </style-rule>\n");
  o.push("          <style-rule element='gridline'>\n");
  o.push("            <format attr='line-visibility' value='off' />\n");
  o.push("            <format attr='stroke-size' value='0' />\n");
  o.push("          </style-rule>\n");
  o.push("          <style-rule element='zeroline'>\n");
  o.push("            <format attr='line-visibility' value='off' />\n");
  o.push("            <format attr='stroke-size' value='0' />\n");
  o.push("          </style-rule>\n");
  o.push("        </style>\n");
  return o.join("");
}

/**
 * Pane <style> — the mark appearance.
 */
function markPaneStyle(ws: WorksheetSpec): string {
  const isBar = ws.mark === "Bar";
  const isLine = ws.mark === "Line";
  const isArea = ws.mark === "Area";
  const size = isBar ? "0.9" : isLine || isArea ? "0.5" : "0.7";
  const labelMode = isLine || isArea ? "line-ends" : "all";

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
  if (isArea) o.push("                <format attr='mark-transparency' value='65' />\n");
  o.push("              </style-rule>\n");
  o.push("            </style>\n");
  return o.join("");
}

export function worksheetXml(
  ws: WorksheetSpec,
  spec: WorkbookSpec,
  ds: DsCtx,
  filterFieldNames: string[] = []
): string {
  const dsName = ds.dsName;
  const dsCaption = ds.caption;
  if (ws.navButton) return buttonWorksheetXml(ws, dsName, dsCaption);
  const reg = ds.reg;

  const dim = ws.dimension ? reg.get(ws.dimension) : undefined;
  const measFields: { f: GenField; pill: MeasurePill; pfx: string }[] = [];
  for (const m of ws.measures) {
    const f = reg.get(m.field);
    if (f) measFields.push({ f, pill: m, pfx: aggPrefix(m.agg) });
  }
  const colorF = ws.colorField ? reg.get(ws.colorField) : undefined;

  const filterPairs = filterFieldNames
    .map((n) => reg.get(n))
    .filter((f): f is GenField => !!f && f.type === "string" && !f.isCalc)
    .map((f) => ({ f, members: distinctMembersIn(ds.fields, ds.rows, f.display) }))
    .filter((p) => p.members.length > 0);

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

  const horizontalBar = ws.mark === "Bar" && measFields.length <= 1;
  const isPie = ws.mark === "Pie";
  const isCircle = ws.mark === "Circle";
  const dimPill = dim ? `[${dsName}].${dimInstance(dim.base)}` : "";
  const measPills = measFields
    .map((mf) => `[${dsName}].${measInstance(mf.f.base, mf.pfx)}`)
    .join(" ");
  const meas0Inst = measFields[0]
    ? `[${dsName}].${measInstance(measFields[0].f.base, measFields[0].pfx)}`
    : "";

  for (const p of filterPairs) x.push(filterBlock(dsName, p.f, p.members));
  if (filterPairs.length) {
    x.push("          <slices>\n");
    for (const p of filterPairs) x.push(`            <column>[${dsName}].${dimInstance(p.f.base)}</column>\n`);
    x.push("          </slices>\n");
  }

  x.push("          <aggregation value='true' />\n");
  x.push("        </view>\n");

  x.push(
    worksheetStyleXml(horizontalBar && meas0Inst ? { measAxisField: meas0Inst, measAxisScope: "cols" } : {})
  );

  const colorInstance =
    colorF && colorF.role !== "measure" ? `[${dsName}].${dimInstance(colorF.base)}` : undefined;
  const paneColor = colorInstance ?? (isPie || isCircle ? (dimPill || undefined) : undefined);
  x.push("        <panes>\n");
  const paneCount = isCircle ? 1 : Math.max(1, measFields.length);
  for (let i = 0; i < paneCount; i++) {
    const idAttr = i === 0 ? "" : ` id='${i}'`;
    x.push(`          <pane${idAttr} selection-relaxation-option='selection-relaxation-allow'>\n`);
    x.push("            <view>\n              <breakdown value='auto' />\n            </view>\n");
    x.push(`            <mark class='${ws.mark}' />\n`);
    x.push("            <mark-sizing mark-sizing-setting='marks-scaling-off' />\n");
    const showLegend = spec.exportOptions?.showLegends ?? true;
    const emitColor = paneColor && (isPie || isCircle || showLegend);
    const wedgeInst = isPie ? meas0Inst : "";
    if (emitColor || wedgeInst) {
      x.push("            <encodings>\n");
      if (emitColor) x.push(`              <color column='${paneColor}' />\n`);
      if (wedgeInst) x.push(`              <wedge-size column='${wedgeInst}' />\n`);
      x.push("            </encodings>\n");
    }
    x.push(markPaneStyle(ws));
    x.push("          </pane>\n");
  }
  x.push("        </panes>\n");

  const meas1Inst = measFields[1]
    ? `[${dsName}].${measInstance(measFields[1].f.base, measFields[1].pfx)}`
    : "";
  let rowsPills: string, colsPills: string;
  if (isPie) {
    rowsPills = "";
    colsPills = "";
  } else if (isCircle) {
    colsPills = meas0Inst;
    rowsPills = meas1Inst || dimPill;
  } else if (horizontalBar) {
    rowsPills = dimPill;
    colsPills = measPills;
  } else {
    rowsPills = measPills;
    colsPills = dimPill;
  }
  x.push(`        <rows>${rowsPills}</rows>\n`);
  x.push(`        <cols>${colsPills}</cols>\n`);
  x.push("      </table>\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </worksheet>\n");
  return x.join("");
}
