// ---------------------------------------------------------------------------
// actionsXml.ts — actions XML generation (nav, highlight, filter actions).
// ---------------------------------------------------------------------------

import type { WorkbookSpec } from "../shared/spec";
import { esc } from "./xmlUtils";

export function actionsXml(spec: WorkbookSpec): string {
  const navActions = spec.actions.filter((a) => a.kind === "navigate");
  const tscActions = spec.includeActions ? spec.actions.filter((a) => a.kind !== "navigate") : [];
  if (navActions.length === 0 && tscActions.length === 0) return "";

  const runType = (a: { runOn: string }) =>
    a.runOn === "hover" ? "on-hover" : a.runOn === "menu" ? "on-menu" : "on-select";
  const fallback = spec.dashboards[0]?.name ?? "Dashboard";
  const sheetDash = new Map<string, string>();
  const sheetsByDash = new Map<string, string[]>();
  for (const d of spec.dashboards) {
    const sheets: string[] = [];
    for (const z of d.zones)
      if (z.kind === "sheet" && z.worksheet) {
        if (!sheetDash.has(z.worksheet)) sheetDash.set(z.worksheet, d.name);
        sheets.push(z.worksheet);
      }
    sheetsByDash.set(d.name, sheets);
  }
  const dashOf = (sheet: string) => sheetDash.get(sheet) ?? fallback;

  const x: string[] = ["  <actions>\n"];
  let n = 0;

  for (const a of navActions) {
    n++;
    const srcDash = dashOf(a.sourceSheet);
    const others = (sheetsByDash.get(srcDash) ?? []).filter((s) => s !== a.sourceSheet);
    x.push(`    <nav-action caption='${esc(a.name)}' name='[Action${n}]'>\n`);
    x.push("      <activation type='on-select' />\n");
    x.push(`      <source dashboard='${esc(srcDash)}' type='sheet'>\n`);
    for (const s of others) x.push(`        <exclude-sheet name='${esc(s)}' />\n`);
    x.push("      </source>\n");
    x.push(`      <params>\n        <param name='sheet' value='${esc(a.target)}' />\n      </params>\n`);
    x.push("    </nav-action>\n");
  }

  for (const a of tscActions) {
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
