// Layout-flow smoke: the opt-in 'flow' layout turns a faithful dashboard into
// nested Tableau layout-flow containers (the LaDataViz responsive structure),
// while the DEFAULT stays pixel-exact floating (Tableau-confirmed). Locks in:
//   - flow:    layoutMode='tiled' + a root container; <zone type-v2='layout-flow'>
//              present; every content zone (sheets + header text) still placed;
//              enclosing card/background rects dropped; load-safe.
//   - default: no layout arg -> floating, no layout-flow, byte-identical path.
// Writes test-out/Faithful_Flow_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpec } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// A clean dashboard: a full-width header over two side-by-side charts, and a
// COLORED KPI panel card at the bottom enclosing a KPI text. Guillotine should
// yield vert{ header, horz{ left, right }, kpi }. The full-frame bg + the card
// rects are dropped, BUT the colored KPI panel's colour is propagated onto the
// KPI tile it encloses (so cards survive flow mode instead of going transparent).
const model: FaithfulModel = {
  id: "frame",
  title: "Flow Dashboard",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    { id: "bg", name: "Background", kind: "rect", x: 0, y: 0, w: 1280, h: 800, fill: "#F4F5FB" },
    { id: "hdr", name: "Header", kind: "text", x: 40, y: 24, w: 1200, h: 40, text: "Overview", fontSize: 22, bold: true, fontColor: "#101828" },
    { id: "card", name: "Card", kind: "rect", x: 30, y: 110, w: 580, h: 420, fill: "#FFFFFF", cornerRadius: 12 },
    { id: "left", name: "SHEET/Sales[bar]", kind: "sheet", x: 40, y: 120, w: 560, h: 400, sheetName: "Sales", chart: "Bar" },
    { id: "right", name: "SHEET/Trend[line]", kind: "sheet", x: 640, y: 120, w: 560, h: 400, sheetName: "Trend", chart: "Line" },
    // a colored panel card enclosing a KPI text (no sheet) — must keep its colour
    { id: "kcard", name: "KPI Card", kind: "rect", x: 40, y: 600, w: 400, h: 160, fill: "#EAF3FE", cornerRadius: 10 },
    { id: "kpi", name: "KPI", kind: "text", x: 60, y: 640, w: 320, h: 60, text: "Total 42", fontSize: 28, bold: true, fontColor: "#101828" },
  ],
};

async function main() {
  // --- default: floating (unchanged, Tableau-confirmed) ---------------------
  const floatSpec = faithfulSpec(model);
  assert(floatSpec.dashboards[0].layoutMode === "floating", "default faithful stays floating");
  assert(!floatSpec.dashboards[0].root, "floating has no container root");
  const floatXml = generateSpecWorkbook(floatSpec).twbXml;
  assert(!/type-v2='layout-flow'/.test(floatXml), "floating emits NO layout-flow containers");

  // --- opt-in: responsive flow ---------------------------------------------
  const flowSpec = faithfulSpec(model, "flow");
  const dash = flowSpec.dashboards[0];
  assert(dash.layoutMode === "tiled", "flow -> tiled layout");
  assert(!!dash.root, "flow builds a container root");

  // the bg + enclosing card rects are dropped; the 4 content zones remain
  // (header text, 2 sheets, KPI text).
  const kinds = dash.zones.map((z) => z.kind).sort();
  assert(dash.zones.length === 4, "bg + enclosing cards dropped, 4 content zones kept: " + kinds.join(","));
  assert(dash.zones.filter((z) => z.kind === "sheet").length === 2, "both sheets kept");
  assert(dash.zones.some((z) => z.kind === "text"), "header text kept");
  assert(!dash.zones.some((z) => z.kind === "rect"), "no decorative rects remain in flow mode");

  // the COLORED KPI panel's background survived: it was propagated onto the KPI
  // tile it enclosed (a leaf tile renders a bg; the flow container can't).
  const kpiTile = dash.zones.find((z) => z.kind === "text" && z.text === "Total 42");
  assert(!!kpiTile && kpiTile.bg === "#EAF3FE", "KPI panel colour propagated to its tile, got " + kpiTile?.bg);
  // the white card around the left sheet was absorbed by the sheet (pre-pass),
  // so the left sheet kept a white card — not page-coloured.
  const leftSheet = dash.zones.find((z) => z.kind === "sheet" && z.worksheet === "Sales");
  assert(!!leftSheet && leftSheet.bg !== "#F4F5FB", "left sheet card not page-coloured, got " + leftSheet?.bg);

  const res = generateSpecWorkbook(flowSpec);
  const xml = res.twbXml;
  const flowZones = xml.match(/<zone\b[^>]*type-v2='layout-flow'[^>]*>/g) || [];
  assert(flowZones.length >= 2, "nested layout-flow containers emitted: " + flowZones.length);
  assert(/param='vert'/.test(xml) && /param='horz'/.test(xml), "both flow directions present (vert root, horz row)");

  // CONFIRMED-XML discipline: a layout-flow zone must NOT carry a background
  // (no reference does — container bg is unconfirmed). Check each flow zone's
  // OWN style block (up to its first child zone) has no background-color.
  for (const m of xml.matchAll(/<zone\b[^>]*type-v2='layout-flow'[^>]*>([\s\S]*?)<zone/g)) {
    assert(!/background-color/.test(m[1]), "layout-flow container has no background-color (margin-only)");
  }

  // the KPI panel colour reaches the generated XML (on the KPI text tile).
  assert(/background-color' value='#EAF3FE'/.test(xml), "KPI panel colour present in the flow XML");

  // every worksheet still has a window + the dashboard lists it.
  assert(/name='Sales'/.test(xml) && /name='Trend'/.test(xml), "both worksheets present");

  // load-safety invariants.
  assert(xml.includes("<windows"), "windows section present");
  assert(!/<shelf-sorts/.test(xml), "no shelf-sorts (load killer)");
  assert(!xml.includes("NaN"), "no NaN attributes");

  const blob = await buildSpecBlob(flowSpec);
  const buf = Buffer.from(await blob.arrayBuffer());
  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Faithful_Flow_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Faithful_Flow_Test.twbx"), buf);
  console.log("OK  faithful flow:", { layout: dash.layoutMode, containers: flowZones.length, zones: dash.zones.length, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
