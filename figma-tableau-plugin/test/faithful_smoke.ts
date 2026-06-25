// Faithful-transpile smoke: a FaithfulModel (text + colored rect + image) must
// generate a well-formed .twb whose dashboard recreates the design as native
// zones (text/empty/bitmap), with exactly one unplaced dummy worksheet — the
// LaDataViz pattern. Writes test-out/Faithful_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpec } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

const model: FaithfulModel = {
  id: "frame",
  title: "Overview Dashboard",
  width: 1280,
  height: 900,
  background: "#F4F5FB",
  zones: [
    { id: "card", name: "metric", kind: "rect", x: 40, y: 80, w: 360, h: 90, fill: "#FFFFFF", cornerRadius: 12, strokeColor: "#E3E6F0", strokeWidth: 1 },
    { id: "lbl", name: "title", kind: "text", x: 56, y: 92, w: 300, h: 18, text: "Tasks Completed", fontSize: 11, fontFamily: "Roboto", fontColor: "#6B7280", align: 0 },
    { id: "val", name: "data", kind: "text", x: 56, y: 116, w: 300, h: 34, text: "67/85", fontSize: 24, fontFamily: "Roboto", fontColor: "#101828", bold: true, align: 0 },
    { id: "bar", name: "Bar 1", kind: "rect", x: 60, y: 300, w: 40, h: 160, fill: "#22C55E" },
    { id: "logo", name: "Logo", kind: "image", x: 40, y: 24, w: 120, h: 40, imagePng: PNG },
    // a node with non-finite geometry must NOT emit a "NaN" attribute
    { id: "bad", name: "Broken", kind: "rect", x: NaN, y: 10, w: 100, h: NaN, fill: "#000000" },
  ],
};

async function main() {
  const spec = faithfulSpec(model);
  assert(spec.worksheets.length === 1, "exactly one dummy worksheet");
  assert(spec.dashboards[0].zones.length === 6, "all 6 layers became zones");
  assert(spec.dashboards[0].layoutMode === "floating", "faithful uses floating (exact positions)");

  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  assert(/type-v2='empty'/.test(xml), "colored rect -> empty zone");
  assert(/background-color' value='#FFFFFF'/.test(xml), "card background-color emitted");
  assert(/background-color' value='#22C55E'/.test(xml), "bar background-color emitted");
  assert(xml.includes(">Tasks Completed<"), "real KPI label text present");
  assert(xml.includes(">67/85<"), "real KPI value text present (not sample data)");
  assert(/fontname='Roboto'/.test(xml), "design font preserved");
  assert(/type-v2='bitmap'/.test(xml), "logo -> bitmap zone");
  assert(/friendly-name='metric'/.test(xml), "Figma layer name -> friendly-name");
  assert(!/\[sum:/.test(xml.split("<dashboards>")[1] || ""), "dashboard binds no data pills");
  assert(xml.includes("<windows"), "windows section present");
  assert(!xml.includes("NaN"), "no NaN attributes (non-finite geometry guarded)");

  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  assert(names.some((n) => n.startsWith("Image/")), "logo packaged under Image/: " + names.join(","));

  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Faithful_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Faithful_Test.twbx"), buf);
  console.log("OK  faithful:", { zones: res.zoneCount, worksheets: res.worksheetCount, warnings: res.warnings.length, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
