// ---------------------------------------------------------------------------
// smoke.ts — headless end-to-end check (run with `npm test`).
// Builds a synthetic DashboardModel, generates the .twb XML, validates the
// invariants the project depends on for Tableau 2026.2, and writes a real
// .twbx to test-out/ so you can open it in Tableau to confirm load.
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { DashboardModel, ExportSettings } from "../src/shared/types";
import { defaultMappingRows } from "../src/plugin/mapper";
import { generateWorkbook, buildBlob } from "../src/plugin/exporter";

function color(hex: string) {
  return { r: 0, g: 0, b: 0, a: 1, hex };
}

const model: DashboardModel = {
  title: "Clinical Trial Dashboard",
  width: 1280,
  height: 800,
  background: color("#F4F5FB"),
  palette: ["#2563EB", "#10B981", "#F59E0B"],
  fonts: ["Inter"],
  elements: [
    { id: "1", name: "Dashboard Title", figmaType: "TEXT", rect: { x: 40, y: 24, w: 600, h: 40 }, role: "text", text: "Clinical Trial Dashboard", fontSize: 24, bold: true },
    { id: "2", name: "Filter Panel", figmaType: "FRAME", rect: { x: 40, y: 80, w: 1200, h: 48 }, role: "filter", fill: color("#FFFFFF") },
    { id: "3", name: "Enrolled KPI", figmaType: "FRAME", rect: { x: 40, y: 140, w: 280, h: 110 }, role: "kpi", chartKind: "kpi", text: "1,248", fill: color("#FFFFFF") },
    { id: "4", name: "Active Sites KPI", figmaType: "FRAME", rect: { x: 340, y: 140, w: 280, h: 110 }, role: "kpi", chartKind: "kpi", text: "37", fill: color("#FFFFFF") },
    { id: "5", name: "Enrollment by Site", figmaType: "FRAME", rect: { x: 40, y: 270, w: 580, h: 480 }, role: "worksheet", chartKind: "bar", fill: color("#FFFFFF") },
    { id: "6", name: "Enrollment Trend", figmaType: "FRAME", rect: { x: 660, y: 270, w: 580, h: 480 }, role: "worksheet", chartKind: "line", fill: color("#FFFFFF") },
  ],
};

const settings: ExportSettings = {
  workbookName: "Clinical_Trial_Dashboard",
  dashboardName: "Clinical Trial Dashboard",
  tableauVersion: "2026.2",
  layoutWidth: 1280,
  layoutHeight: 800,
  embedData: true,
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

async function main() {
  const rows = defaultMappingRows(model);
  const res = generateWorkbook(model, settings, rows);
  const xml = res.twbXml;

  // Invariants that distinguish "opens" from "Internal Error 501CF476".
  assert(xml.includes("<windows"), "missing <windows> section");
  assert(xml.includes("<document-format-change-manifest>"), "missing manifest");
  assert(xml.includes("<object-graph>"), "missing datasource object-graph");
  assert(xml.includes("class='dashboard'"), "missing dashboard window");
  assert(xml.includes("<viewpoint"), "missing dashboard viewpoints");
  assert(res.worksheetCount === 2, `expected 2 worksheets, got ${res.worksheetCount}`);
  assert(/<column [^>]*\/>\s*<column /.test(xml.replace(/\n\s*/g, "")) || xml.includes("<column "), "no columns in deps");
  assert(res.warnings.length === 0, "unexpected warnings: " + res.warnings.join("; "));

  // Build a real .twbx (Node 18+ has Blob).
  const blob = await buildBlob(model, settings, rows);
  const buf = Buffer.from(await blob.arrayBuffer());
  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  const twbxPath = resolve(outDir, "Clinical_Trial_Dashboard.twbx");
  writeFileSync(twbxPath, buf);
  // Also drop the raw .twb for easy diffing against the Python reference.
  writeFileSync(resolve(outDir, "Clinical_Trial_Dashboard.twb"), xml, "utf8");

  console.log("OK  worksheets:", res.worksheetCount, "zones:", res.zoneCount);
  console.log("OK  .twb bytes:", xml.length);
  console.log("OK  .twbx written:", twbxPath, `(${buf.length} bytes)`);
  console.log("Next: open the .twbx in Tableau 2026.2 to confirm it loads.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
