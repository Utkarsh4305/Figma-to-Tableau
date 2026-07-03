// ---------------------------------------------------------------------------
// datasourceXml.ts — datasource XML generation (primary + extra datasets).
// ---------------------------------------------------------------------------

import type { WorkbookSpec, SpecField, CalcField } from "../shared/spec";
import { TABLEAU, RT2026, AGG2026 } from "../shared/constants";
import { esc, hex32, dimInstance, tableauType, relationColumns, GenField } from "./xmlUtils";

export interface DsCtx {
  dsName: string;
  caption: string;
  reg: Map<string, GenField>;
  fields: SpecField[];
  rows: string[][];
}

export const PRIMARY_DS = "federated.fig";

export function buildRegistryFields(fields: SpecField[], calcs: CalcField[]): Map<string, GenField> {
  const reg = new Map<string, GenField>();
  for (const f of fields) {
    reg.set(f.name, {
      display: f.name,
      local: `[${f.name}]`,
      base: f.name,
      type: f.type,
      role: f.role,
      isCalc: false,
    });
  }
  for (const c of calcs) {
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

export function buildRegistry(spec: WorkbookSpec): Map<string, GenField> {
  return buildRegistryFields(spec.data.fields, spec.data.calcs);
}

export function buildDsContexts(spec: WorkbookSpec): { primary: DsCtx; byName: Map<string, DsCtx>; wsToDs: Map<string, DsCtx> } {
  const primary: DsCtx = {
    dsName: PRIMARY_DS,
    caption: spec.workbookName + " Data",
    reg: buildRegistry(spec),
    fields: spec.data.fields,
    rows: spec.data.rows,
  };
  const byName = new Map<string, DsCtx>([[PRIMARY_DS, primary]]);
  for (const ed of spec.extraData ?? []) {
    byName.set(ed.dsName, {
      dsName: ed.dsName,
      caption: ed.caption,
      reg: buildRegistryFields(ed.fields, []),
      fields: ed.fields,
      rows: ed.rows,
    });
  }
  const wsToDs = new Map<string, DsCtx>();
  for (const ws of spec.worksheets) wsToDs.set(ws.name, (ws.dsName && byName.get(ws.dsName)) || primary);
  return { primary, byName, wsToDs };
}

export function colorStyleBlock(spec: WorkbookSpec): string {
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

export function actionGroupsXml(spec: WorkbookSpec): string {
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

export function datasourceXml(
  ds: { dsName: string; connName: string; caption: string; fileName: string; fields: SpecField[]; calcs: CalcField[] },
  dataDirectory: string,
  extras: { colorStyle: string; actionGroups: string },
): string {
  const dsName = ds.dsName;
  const connName = ds.connName;
  const caption = ds.caption;
  const csvFile = ds.fileName;
  const base = csvFile.toLowerCase().endsWith(".csv") ? csvFile.slice(0, -4) : csvFile;
  const parent = `[${csvFile}]`;
  const table = `[${base}#csv]`;
  const objid = `${csvFile}_${hex32()}`;
  const objidB = `[${objid}]`;
  const fields = ds.fields;

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

  for (const calc of ds.calcs) {
    const t = calc.role === "measure" ? "quantitative" : tableauType(calc.type);
    x.push(
      `      <column caption='${esc(calc.name)}' datatype='${calc.type}' name='[${esc(
        calc.localName
      )}]' role='${calc.role}' type='${t}'>\n`
    );
    x.push(`        <calculation class='tableau' formula='${esc(calc.formula)}' />\n`);
    x.push("      </column>\n");
  }

  x.push(extras.actionGroups);

  x.push(
    `      <column caption='${esc(csvFile)}' datatype='table' name='[__tableau_internal_object_id__].${objidB}' role='measure' type='quantitative' />\n`
  );
  x.push("      <layout dim-ordering='alphabetic' measure-ordering='alphabetic' show-structure='true' />\n");

  x.push(extras.colorStyle);

  x.push("      <object-graph>\n        <objects>\n");
  x.push(`          <object caption='${esc(csvFile)}' id='${objid}'>\n`);
  x.push("            <properties context=''>\n");
  x.push(`              <relation connection='${connName}' name='${esc(csvFile)}' table='${table}' type='table'>\n`);
  x.push(relationColumns("                ", fields));
  x.push("              </relation>\n");
  x.push("            </properties>\n          </object>\n");
  x.push("        </objects>\n      </object-graph>\n");
  x.push("    </datasource>\n");
  return x.join("");
}
