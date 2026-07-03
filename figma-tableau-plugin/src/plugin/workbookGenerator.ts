// ---------------------------------------------------------------------------
// workbookGenerator.ts — generates the .twb XML from the WorkbookSpec.
// ---------------------------------------------------------------------------

import type { WorkbookSpec } from "../shared/spec";
import { TABLEAU, MANIFEST_ENTRIES } from "../shared/constants";
import { uid, hasNavAction } from "./xmlUtils";
import { buildDsContexts, PRIMARY_DS, datasourceXml, colorStyleBlock, actionGroupsXml } from "./datasourceXml";
import { worksheetXml } from "./worksheetXml";
import { dashboardXml } from "./dashboardXml";
import { windowsXml } from "./windowsXml";
import { actionsXml } from "./actionsXml";

function manifestXml(spec: WorkbookSpec): string {
  const entries = new Set<string>(MANIFEST_ENTRIES);
  if (spec.imports) for (const e of spec.imports.manifestEntries) entries.add(e);
  if (hasNavAction(spec)) entries.add("NavigationAction");
  return (
    "  <document-format-change-manifest>\n" +
    [...entries].map((e) => `    <${e} />\n`).join("") +
    "  </document-format-change-manifest>\n"
  );
}

export function generateWorkbookXml(spec: WorkbookSpec, dataDirectory: string): string {
  const dsCtxs = buildDsContexts(spec);
  const primaryDsXml = datasourceXml(
    { dsName: PRIMARY_DS, connName: "textscan.fig", caption: dsCtxs.primary.caption, fileName: spec.data.fileName, fields: spec.data.fields, calcs: spec.data.calcs },
    dataDirectory,
    { colorStyle: colorStyleBlock(spec), actionGroups: actionGroupsXml(spec) },
  );
  const extraDsXml = (spec.extraData ?? []).map((ed) =>
    datasourceXml(
      { dsName: ed.dsName, connName: ed.connName, caption: ed.caption, fileName: ed.fileName, fields: ed.fields, calcs: [] },
      dataDirectory,
      { colorStyle: "", actionGroups: "" },
    ),
  );

  const filtersByWs = new Map<string, Set<string>>();
  const showFilters = spec.exportOptions?.showFilters ?? true;
  for (const d of spec.dashboards)
    for (const z of d.zones)
      if (showFilters && z.kind === "filter" && z.worksheet && z.field && !z.filterParam) {
        const s = filtersByWs.get(z.worksheet) ?? new Set<string>();
        s.add(z.field);
        filtersByWs.set(z.worksheet, s);
      }

  const dashUuid = new Map<string, string>();
  for (const d of spec.dashboards) dashUuid.set(d.name, uid());

  const importedWsNames = spec.imports ? [...spec.imports.worksheetXml.keys()] : [];
  const wsNames = [...spec.worksheets.map((w) => w.name), ...importedWsNames];
  const wsUuid = new Map<string, string>();
  for (const n of wsNames) wsUuid.set(n, uid());

  const dashOut = spec.dashboards.map((d) => dashboardXml(d, dsCtxs.primary, dsCtxs.wsToDs, spec.exportOptions));

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
  out.push(primaryDsXml);
  for (const dx of extraDsXml) out.push(dx);
  if (spec.imports) for (const dx of spec.imports.datasourceXml.values()) out.push(dx + "\n");
  out.push("  </datasources>\n");
  out.push(actionsXml(spec));
  out.push("  <worksheets>\n");
  for (const ws of spec.worksheets)
    out.push(worksheetXml(ws, spec, dsCtxs.wsToDs.get(ws.name) ?? dsCtxs.primary, [...(filtersByWs.get(ws.name) ?? [])]));
  if (spec.imports) for (const wx of spec.imports.worksheetXml.values()) out.push(wx + "\n");
  out.push("  </worksheets>\n");
  out.push("  <dashboards>\n");
  for (const d of dashOut) out.push(d.xml);
  out.push("  </dashboards>\n");
  out.push(
    windowsXml(
      wsNames,
      spec.dashboards.map((d, i) => ({
        name: d.name,
        sheets: dashOut[i].sheetNames,
        uuid: dashUuid.get(d.name) ?? uid(),
      })),
      wsUuid,
      spec.exportOptions?.filterShelfPosition ?? "right"
    )
  );
  out.push("</workbook>\n");
  return out.join("");
}
