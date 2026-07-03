// Multi-dashboard smoke: several Figma frames (FaithfulModels) become ONE
// workbook with one Tableau dashboard EACH (the LaDataViz multi-dashboard
// workflow). Locks in:
//   - one <dashboard> + one dashboard <window> per model
//   - worksheet names unique ACROSS dashboards (Tableau maps windows by name)
//   - image filenames unique across dashboards (packaged Image/ files)
//   - each dashboard's sheet shows in ITS OWN dashboard window viewpoints
//   - the merged .twb stays load-safe (windows present, no shelf-sorts, no NaN)
// Writes test-out/Faithful_Multi_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpecMulti } from "../src/plugin/faithfulSpec";
import { generateSpecWorkbook, buildSpecBlob, collectImageAssets } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// Two frames that deliberately COLLIDE on names: both have a "Revenue" SHEET and
// a "logo" image, so the global dedupe (worksheet "Revenue"/"Revenue 2", images
// logo_1/logo_2) is exercised.
const overview: FaithfulModel = {
  id: "f1",
  title: "Sales Overview",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    { id: "o-logo", name: "logo", kind: "image", x: 40, y: 24, w: 120, h: 40, imagePng: PNG },
    { id: "o-rev", name: "SHEET/Revenue[bar]", kind: "sheet", x: 40, y: 120, w: 560, h: 360, sheetName: "Revenue", chart: "Bar" },
    { id: "o-trend", name: "SHEET/Trend[line]", kind: "sheet", x: 640, y: 120, w: 560, h: 360, sheetName: "Trend", chart: "Line" },
  ],
};
const ops: FaithfulModel = {
  id: "f2",
  title: "Ops",
  width: 1440,
  height: 900,
  background: "#FFFFFF",
  zones: [
    { id: "p-logo", name: "logo", kind: "image", x: 40, y: 24, w: 120, h: 40, imagePng: PNG },
    // same sheet name as a sheet on the other dashboard -> must be renamed
    { id: "p-rev", name: "SHEET/Revenue[bar]:filter", kind: "sheet", x: 40, y: 120, w: 700, h: 500, sheetName: "Revenue", chart: "Bar", actionKind: "filter" },
    { id: "p-filter", name: "FILTER/Region", kind: "filter", x: 40, y: 40, w: 240, h: 48, filterField: "Region" },
  ],
};

async function main() {
  const spec = faithfulSpecMulti([overview, ops]);

  assert(spec.dashboards.length === 2, "two frames -> two dashboards");
  assert(spec.dashboards[0].name === "Sales Overview" && spec.dashboards[1].name === "Ops", "dashboard names from frame titles");

  // 3 sheets total (Revenue, Trend, Revenue) -> names globally unique.
  const wsNames = spec.worksheets.map((w) => w.name);
  assert(wsNames.length === 3, "three worksheets total across both dashboards");
  assert(new Set(wsNames).size === wsNames.length, "worksheet names unique across dashboards: " + wsNames.join(","));
  assert(wsNames.includes("Revenue") && wsNames.includes("Revenue 2"), "colliding 'Revenue' sheets de-duped to Revenue / Revenue 2");

  // image filenames unique across dashboards (both layers named "logo").
  const imgFiles = collectImageAssets(spec).map((a) => a.file);
  assert(imgFiles.length === 2, "two images packaged (one per dashboard): " + imgFiles.join(","));
  assert(new Set(imgFiles).size === 2, "image filenames unique across dashboards: " + imgFiles.join(","));

  // the :filter sheet on the Ops dashboard -> a filter action scoped to Ops.
  assert(spec.includeActions && spec.actions.length === 1, "one filter action from the Ops :filter sheet");

  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  // exactly two <dashboard> elements + two dashboard windows.
  assert((xml.match(/<dashboard name='/g) || []).length === 2, "two <dashboard> elements");
  assert((xml.match(/<window class='dashboard'/g) || []).length === 2, "two dashboard windows");
  assert(/<window class='dashboard' maximized='true' name='Sales Overview'>/.test(xml), "Sales Overview dashboard window present");
  assert(/<window class='dashboard' maximized='true' name='Ops'>/.test(xml), "Ops dashboard window present");

  // each dashboard window lists its OWN sheet in its viewpoints. Slice the two
  // dashboard WINDOW blocks (in the <windows> section) and check membership.
  const ovWinStart = xml.indexOf("<window class='dashboard' maximized='true' name='Sales Overview'>");
  const opWinStart = xml.indexOf("<window class='dashboard' maximized='true' name='Ops'>");
  const ovWin = xml.slice(ovWinStart, opWinStart);
  assert(/<viewpoint name='Revenue'>/.test(ovWin), "Sales Overview viewpoint has Revenue");
  assert(/<viewpoint name='Trend'>/.test(ovWin), "Sales Overview viewpoint has Trend");
  const opWin = xml.slice(opWinStart);
  assert(/<viewpoint name='Revenue 2'>/.test(opWin), "Ops viewpoint has Revenue 2");
  // Revenue 2 belongs to Ops, NOT Sales Overview.
  assert(!/<viewpoint name='Revenue 2'>/.test(ovWin), "Revenue 2 is not on the Sales Overview window");

  // the filter action is sourced from the Ops dashboard (where its sheet lives).
  assert(/<source dashboard='Ops'[^>]*worksheet='Revenue 2'/.test(xml), "filter action sourced from Ops / Revenue 2");

  // load-safety invariants.
  assert(xml.includes("<windows"), "windows section present");
  assert(!/<shelf-sorts/.test(xml), "no shelf-sorts (load killer)");
  assert(!xml.includes("NaN"), "no NaN attributes");

  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  assert(names.filter((n) => n.startsWith("Image/") && n.endsWith(".png")).length === 2, "two images packaged under Image/: " + names.join(","));

  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Faithful_Multi_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Faithful_Multi_Test.twbx"), buf);
  console.log("OK  faithful multi:", { dashboards: spec.dashboards.length, worksheets: spec.worksheets.length, images: imgFiles.length, actions: spec.actions.length, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
