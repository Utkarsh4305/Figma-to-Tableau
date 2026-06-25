// ---------------------------------------------------------------------------
// tableauGenerator.ts — builds the .twb XML for Tableau 2026.2.
//
// This is a faithful TypeScript port of the project's proven Python generator
// (generate_image_twb.py), which is CONFIRMED to open in Tableau 2026.2. The
// non-obvious requirements it encodes — the mandatory <windows> section, the
// object-graph datasource, RT2026 type codes, "all <column> then all
// <column-instance>" dependency ordering, pane-level color encoding — are the
// difference between a workbook that opens and the opaque "Internal Error
// 501CF476". Do not "tidy" these without a fresh Tableau reference to compare.
// ---------------------------------------------------------------------------

import type { TableauModel, TWorksheet, TField, Zone, TextZone, TRun } from "./mapper";
import { TABLEAU, MANIFEST_ENTRIES, RT2026, AGG2026 } from "../shared/constants";
import type { FieldType } from "../shared/types";

// --- low-level helpers -------------------------------------------------------

function uid(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw =
    g && typeof g.randomUUID === "function"
      ? g.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return `{${raw.toUpperCase()}}`;
}

function hex(): string {
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

function instName(field: string, role: "dimension" | "measure"): string {
  return role === "measure" ? `[sum:${field}:qk]` : `[none:${field}:nk]`;
}

const MANIFEST =
  "  <document-format-change-manifest>\n" +
  MANIFEST_ENTRIES.map((e) => `    <${e} />\n`).join("") +
  "  </document-format-change-manifest>\n";

// --- worksheet ---------------------------------------------------------------

interface DepField {
  name: string;
  type: FieldType;
  role: "dimension" | "measure";
}

function depBlock(ds: string, fields: DepField[]): string {
  // ALL <column> first, THEN all <column-instance> (2026.2 ordering).
  const out: string[] = [`        <datasource-dependencies datasource='${ds}'>\n`];
  for (const f of fields) {
    const ttype = f.role === "measure" ? "quantitative" : "nominal";
    out.push(
      `          <column datatype='${f.type}' name='[${f.name}]' role='${f.role}' type='${ttype}' />\n`
    );
  }
  for (const f of fields) {
    const ttype = f.role === "measure" ? "quantitative" : "nominal";
    const der = f.role === "measure" ? "Sum" : "None";
    out.push(
      `          <column-instance column='[${f.name}]' derivation='${der}' name='${instName(
        f.name,
        f.role
      )}' pivot='key' type='${ttype}' />\n`
    );
  }
  out.push("        </datasource-dependencies>\n");
  return out.join("");
}

function worksheetXml(ws: TWorksheet, dsName: string, dsCaption: string): string {
  const deps: DepField[] = [
    { name: ws.dim, type: ws.dimType, role: "dimension" },
    { name: ws.meas, type: "integer", role: "measure" },
  ];
  const cols = `[${dsName}].${instName(ws.dim, "dimension")}`;
  const rows = `[${dsName}].${instName(ws.meas, "measure")}`;
  const mark = ws.kind === "bar" ? "Bar" : "Line";
  const colorInst = ws.kind === "bar" ? cols : null; // never color a single line

  const x: string[] = [];
  x.push(`    <worksheet name='${esc(ws.name)}'>\n`);
  x.push("      <table>\n");
  x.push("        <view>\n");
  x.push("          <datasources>\n");
  x.push(`            <datasource caption='${esc(dsCaption)}' name='${dsName}' />\n`);
  x.push("          </datasources>\n");
  x.push(depBlock(dsName, deps));
  x.push("          <aggregation value='true' />\n");
  x.push("        </view>\n");
  x.push("        <style />\n");
  x.push("        <panes>\n");
  x.push("          <pane selection-relaxation-option='selection-relaxation-allow'>\n");
  x.push("            <view>\n              <breakdown value='auto' />\n            </view>\n");
  x.push(`            <mark class='${mark}' />\n`);
  if (colorInst) {
    x.push("            <encodings>\n");
    x.push(`              <color column='${colorInst}' />\n`);
    x.push("            </encodings>\n");
  }
  x.push("          </pane>\n");
  x.push("        </panes>\n");
  x.push(`        <rows>${rows}</rows>\n`);
  x.push(`        <cols>${cols}</cols>\n`);
  x.push("      </table>\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </worksheet>\n");
  return x.join("");
}

// --- dashboard zones ---------------------------------------------------------

function runXml(r: TRun): string {
  let a = "";
  if (r.bold) a += " bold='true'";
  if (r.size) a += ` fontsize='${r.size}'`;
  if (r.color) a += ` fontcolor='${r.color}'`;
  if (r.font) a += ` fontname='${esc(r.font)}'`;
  if (r.align != null) a += ` fontalignment='${r.align}'`;
  // line breaks use Tableau's &#10; entity, emitted AFTER escaping the text
  return `<run${a}>${esc(r.text)}${r.break ? "&#10;" : ""}</run>`;
}

function zoneStyle(
  bg: string | undefined,
  bc: string,
  bs: string,
  bw: string,
  margin: string,
  padding?: string
): string {
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

function textZoneXml(z: TextZone): string {
  const s: string[] = [
    `        <zone h='${z.h}' id='${z.id}' type-v2='text' w='${z.w}' x='${z.x}' y='${z.y}'>\n`,
  ];
  s.push("          <formatted-text>\n");
  for (const r of z.runs) s.push("            " + runXml(r) + "\n");
  s.push("          </formatted-text>\n");
  s.push(zoneStyle(z.bg, z.bc, z.bs, z.bw, "3", z.padding));
  s.push("        </zone>\n");
  return s.join("");
}

function sheetZoneXml(z: Extract<Zone, { kind: "sheet" }>): string {
  const s: string[] = [
    `        <zone h='${z.h}' id='${z.id}' name='${esc(z.name)}' w='${z.w}' x='${z.x}' y='${z.y}'>\n`,
  ];
  s.push(zoneStyle(z.bg, z.bc, "solid", "1", "4", "6"));
  s.push("        </zone>\n");
  return s.join("");
}

function dashboardXml(model: TableauModel): string {
  const d = model.dashboard;
  const x: string[] = [`    <dashboard name='${esc(d.name)}'>\n`];
  x.push("      <style />\n");
  x.push(
    `      <size maxheight='${d.heightPx}' maxwidth='${d.widthPx}' minheight='${d.heightPx}' minwidth='${d.widthPx}' />\n`
  );
  x.push("        <zones>\n");
  const root = 2;
  x.push(
    `          <zone h='100000' id='${root}' type-v2='layout-basic' w='100000' x='0' y='0'>\n`
  );
  for (const z of d.zones) {
    x.push(z.kind === "sheet" ? sheetZoneXml(z) : textZoneXml(z as TextZone));
  }
  x.push(zoneStyle(d.bg, d.bc, "solid", "2", "8"));
  x.push("          </zone>\n        </zones>\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </dashboard>\n");
  return x.join("");
}

// --- datasource (2026.2 object model) ----------------------------------------

function relationColumns(indent: string, cols: TField[]): string {
  const o: string[] = [
    `${indent}<columns character-set='UTF-8' header='yes' locale='en_US' separator=','>\n`,
  ];
  cols.forEach((c, i) => {
    o.push(`${indent}  <column datatype='${c.type}' name='${esc(c.name)}' ordinal='${i}' />\n`);
  });
  o.push(`${indent}</columns>\n`);
  return o.join("");
}

function datasourceXml(model: TableauModel, dataDirectory: string): string {
  const { dsCaption, dsName, connName, csvFile, fields } = model;
  const base = csvFile.toLowerCase().endsWith(".csv") ? csvFile.slice(0, -4) : csvFile;
  const relname = csvFile;
  const parent = `[${relname}]`;
  const table = `[${base}#csv]`;
  const objid = `${relname}_${hex()}`;
  const objidB = `[${objid}]`;

  const x: string[] = [];
  x.push(
    `    <datasource caption='${esc(dsCaption)}' inline='true' name='${dsName}' version='${TABLEAU.version}'>\n`
  );
  x.push("      <connection class='federated'>\n");
  x.push("        <named-connections>\n");
  x.push(`          <named-connection caption='${esc(base)}' name='${connName}'>\n`);
  x.push(
    `            <connection class='textscan' directory='${esc(
      dataDirectory
    )}' filename='${esc(csvFile)}' password='' server='' />\n`
  );
  x.push("          </named-connection>\n");
  x.push("        </named-connections>\n");
  x.push(
    `        <relation connection='${connName}' name='${esc(relname)}' table='${table}' type='table'>\n`
  );
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
      x.push(
        `      <column caption='${esc(c.name)}' datatype='date' name='[${esc(
          c.name
        )}]' role='dimension' type='ordinal' />\n`
      );
    } else {
      x.push(
        `      <column caption='${esc(c.name)}' datatype='string' name='[${esc(
          c.name
        )}]' role='dimension' type='nominal' />\n`
      );
    }
  }
  x.push(
    `      <column caption='${esc(
      relname
    )}' datatype='table' name='[__tableau_internal_object_id__].${objidB}' role='measure' type='quantitative' />\n`
  );
  x.push(
    "      <layout dim-ordering='alphabetic' measure-ordering='alphabetic' show-structure='true' />\n"
  );
  x.push("      <object-graph>\n        <objects>\n");
  x.push(`          <object caption='${esc(relname)}' id='${objid}'>\n`);
  x.push("            <properties context=''>\n");
  x.push(
    `              <relation connection='${connName}' name='${esc(relname)}' table='${table}' type='table'>\n`
  );
  x.push(relationColumns("                ", fields));
  x.push("              </relation>\n");
  x.push("            </properties>\n          </object>\n");
  x.push("        </objects>\n      </object-graph>\n");
  x.push("    </datasource>\n");
  return x.join("");
}

// --- windows (REQUIRED — its absence is the 501CF476 internal error) ---------

const WS_CARDS =
  "      <cards>\n" +
  "        <edge name='left'>\n" +
  "          <strip size='160'>\n" +
  "            <card type='pages' />\n" +
  "            <card type='filters' />\n" +
  "            <card type='marks' />\n" +
  "          </strip>\n" +
  "        </edge>\n" +
  "        <edge name='top'>\n" +
  "          <strip size='2147483647'>\n" +
  "            <card type='columns' />\n" +
  "          </strip>\n" +
  "          <strip size='2147483647'>\n" +
  "            <card type='rows' />\n" +
  "          </strip>\n" +
  "          <strip size='30'>\n" +
  "            <card type='title' />\n" +
  "          </strip>\n" +
  "        </edge>\n" +
  "      </cards>\n";

function windowsXml(wsNames: string[], dashName: string, sheets: string[]): string {
  const x: string[] = ["  <windows source-height='44'>\n"];
  for (const nm of wsNames) {
    x.push(`    <window class='worksheet' name='${esc(nm)}'>\n`);
    x.push(WS_CARDS);
    x.push(`      <simple-id uuid='${uid()}' />\n`);
    x.push("    </window>\n");
  }
  x.push(`    <window class='dashboard' name='${esc(dashName)}'>\n`);
  x.push("      <viewpoints>\n");
  for (const s of sheets) x.push(`        <viewpoint name='${esc(s)}' />\n`);
  x.push("      </viewpoints>\n");
  x.push("      <active id='-1' />\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </window>\n");
  x.push("  </windows>\n");
  return x.join("");
}

// --- assemble ----------------------------------------------------------------

/**
 * Generate the full .twb XML string.
 * @param dataDirectory  Folder the textscan connection points at. For a .twbx
 *   this is the package-relative folder where twbxBuilder stores the CSV.
 */
export function generateTwb(model: TableauModel, dataDirectory: string): string {
  const wsNames = model.worksheets.map((w) => w.name);
  const sheetNames = model.dashboard.zones
    .filter((z): z is Extract<Zone, { kind: "sheet" }> => z.kind === "sheet")
    .map((z) => z.name);

  const out: string[] = [];
  out.push("<?xml version='1.0' encoding='utf-8' ?>\n");
  out.push(
    `<workbook original-version='${TABLEAU.originalVersion}' source-build='${TABLEAU.sourceBuild}' ` +
      `source-platform='${TABLEAU.sourcePlatform}' version='${TABLEAU.version}' ` +
      `xmlns:user='http://www.tableausoftware.com/xml/user'>\n`
  );
  out.push(MANIFEST);
  out.push(
    "  <preferences>\n    <preference name='ui.encoding.shelf.height' value='24' />\n" +
      "    <preference name='ui.shelf.height' value='26' />\n  </preferences>\n"
  );
  out.push("  <datasources>\n");
  out.push(datasourceXml(model, dataDirectory));
  out.push("  </datasources>\n");
  out.push("  <worksheets>\n");
  for (const ws of model.worksheets) out.push(worksheetXml(ws, model.dsName, model.dsCaption));
  out.push("  </worksheets>\n");
  out.push("  <dashboards>\n");
  out.push(dashboardXml(model));
  out.push("  </dashboards>\n");
  out.push(windowsXml(wsNames, model.dashboard.name, sheetNames));
  out.push("</workbook>\n");
  return out.join("");
}
