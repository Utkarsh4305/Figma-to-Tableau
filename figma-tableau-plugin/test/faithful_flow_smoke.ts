// Layout-flow smoke: the opt-in 'flow' layout turns a faithful dashboard into
// nested Tableau layout-flow containers (the LaDataViz responsive structure),
// while the DEFAULT stays pixel-exact floating (Tableau-confirmed). Locks in:
//   - flow:    layoutMode='tiled' + a root container; <zone type-v2='layout-flow'>
//              present; every content zone (sheets + header text) still placed;
//              ALL rects dropped (cards propagated, decoratives removed);
//              fixed min=max sizing (matches the LaDataViz tiled references);
//              distribute-evenly on horz rows (even-only on vert); nav buttons
//              pinned; FILTER/ cards re-attached as a height-pinned TOP row;
//              grouped KPI-card text tiled with tinted spacer fills; load-safe.
//   - default: no layout arg -> floating, no layout-flow, byte-identical path.
// Writes test-out/Faithful_Flow_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpec } from "../src/plugin/faithfulSpec";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// A clean dashboard: a header + nav button row over two side-by-side charts, a
// COLORED KPI panel card at the bottom enclosing TWO text layers (label+value),
// a decorative divider rect, and a FILTER/ card. Guillotine should yield
// vert{ horz{header,button}, horz{left,right}, kpi-group }, wrapped with the
// filter sidebar: horz{ body, Filters }. The full-frame bg + card + divider
// rects are dropped, BUT the colored KPI panel's colour is propagated onto the
// text tiles it encloses and tinted spacer tiles fill the card's gaps (so cards
// survive flow mode instead of going transparent — with NO floating rects).
const model: FaithfulModel = {
  id: "frame",
  title: "Flow Dashboard",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    { id: "bg", name: "Background", kind: "rect", x: 0, y: 0, w: 1280, h: 800, fill: "#F4F5FB" },
    { id: "hdr", name: "Header", kind: "text", x: 40, y: 24, w: 900, h: 40, text: "Overview", fontSize: 22, bold: true, fontColor: "#101828" },
    // a BUTTON/ nav button — must stay PINNED to its 120×40 in the flow, not flex
    { id: "btn", name: "BUTTON/Next", kind: "button", x: 1100, y: 24, w: 120, h: 40, label: "Next", fill: "#2563EB" },
    // a decorative divider rect (encloses nothing) — dropped in flow mode
    { id: "div", name: "Divider", kind: "rect", x: 40, y: 80, w: 1200, h: 2, fill: "#E2E4EE" },
    { id: "card", name: "Card", kind: "rect", x: 30, y: 110, w: 580, h: 420, fill: "#FFFFFF", cornerRadius: 12 },
    { id: "left", name: "SHEET/Sales[bar]", kind: "sheet", x: 40, y: 120, w: 560, h: 400, sheetName: "Sales", chart: "Bar" },
    { id: "right", name: "SHEET/Trend[line]", kind: "sheet", x: 640, y: 120, w: 560, h: 400, sheetName: "Trend", chart: "Line" },
    // a colored panel card enclosing TWO text layers — must become ONE vert
    // group whose tiles + spacer fills all carry the card colour
    { id: "kcard", name: "KPI Card", kind: "rect", x: 40, y: 600, w: 400, h: 160, fill: "#EAF3FE", cornerRadius: 10 },
    { id: "klabel", name: "KPI Label", kind: "text", x: 60, y: 620, w: 200, h: 24, text: "Revenue", fontSize: 13, fontColor: "#475467" },
    { id: "kval", name: "KPI Value", kind: "text", x: 60, y: 660, w: 200, h: 40, text: "42", fontSize: 28, bold: true, fontColor: "#101828" },
    // a FILTER/ card — excluded from the guillotine, re-attached as a sidebar
    { id: "flt", name: "FILTER/Region", kind: "filter", x: 1000, y: 600, w: 200, h: 120, filterField: "Region" },
  ],
};

async function main() {
  // --- default: floating (unchanged, Tableau-confirmed) ---------------------
  const floatSpec = faithfulSpec(model);
  assert(floatSpec.dashboards[0].layoutMode === "floating", "default faithful stays floating");
  assert(!floatSpec.dashboards[0].root, "floating has no container root");
  const floatXml = generateSpecWorkbook(floatSpec).twbXml;
  assert(!/type-v2='layout-flow'/.test(floatXml), "floating emits NO layout-flow containers");
  assert(/sizing-mode='fixed'/.test(floatXml), "floating keeps the fixed dashboard size");

  // --- opt-in: responsive flow ---------------------------------------------
  const flowSpec = faithfulSpec(model, "flow");
  const dash = flowSpec.dashboards[0];
  assert(dash.layoutMode === "tiled", "flow -> tiled layout");
  assert(!!dash.root, "flow builds a container root");

  // bg + enclosing cards + the decorative divider are ALL dropped; the content
  // zones (header, button-sheet, 2 charts, 2 KPI texts, filter) remain, plus
  // the tinted spacer tiles that fill the KPI card's uncovered bands.
  const rects = dash.zones.filter((z) => z.kind === "rect");
  assert(rects.length > 0 && rects.every((z) => z.friendlyName === "Card Fill"),
    "only tinted Card Fill spacers remain as rects (decoratives dropped), got " +
    rects.map((z) => z.friendlyName).join(","));
  assert(rects.every((z) => z.bg === "#EAF3FE"), "card spacer fills carry the KPI card colour");
  assert(dash.zones.filter((z) => z.kind === "sheet").length === 3, "both charts + the button-sheet kept");
  assert(dash.zones.some((z) => z.kind === "filter"), "filter card kept");
  assert(dash.zones.filter((z) => z.kind === "text").length === 3, "header + 2 KPI texts kept (tiled in flow tree)");

  // the COLORED KPI panel's background survived on BOTH enclosed text tiles
  // (a leaf tile renders a bg; the flow container can't; no floating rect).
  const kpiTiles = dash.zones.filter((z) => z.kind === "text" && (z.text === "Revenue" || z.text === "42"));
  assert(kpiTiles.length === 2 && kpiTiles.every((z) => z.bg === "#EAF3FE"),
    "KPI panel colour propagated to its text tiles, got " + kpiTiles.map((z) => z.bg).join(","));
  // the nav button zone is marked pinned (so it can't flex like a chart).
  const btnZone = dash.zones.find((z) => z.kind === "sheet" && z.worksheet === "Next");
  assert(!!btnZone && btnZone.pinned === true, "button-sheet zone is pinned");
  // the white card around the left sheet was absorbed by the sheet (pre-pass),
  // so the left sheet kept a white card — not page-coloured.
  const leftSheet = dash.zones.find((z) => z.kind === "sheet" && z.worksheet === "Sales");
  assert(!!leftSheet && leftSheet.bg !== "#F4F5FB", "left sheet card not page-coloured, got " + leftSheet?.bg);

  const res = generateSpecWorkbook(flowSpec);
  const xml = res.twbXml;
  const flowZones = xml.match(/<zone\b[^>]*type-v2='layout-flow'[^>]*>/g) || [];
  // vert{ horz{hdr,btn}, horz{left,right}, vert-kpi-group } wrapped in
  // horz{ body, vert-Filters } → at least 5 containers.
  assert(flowZones.length >= 5, "nested layout-flow containers emitted: " + flowZones.length);
  assert(/param='vert'/.test(xml) && /param='horz'/.test(xml), "both flow directions present (vert body, horz rows)");

  // TILED dashboards keep the FIXED min=max size — both LaDataViz tiled
  // references (Template.twb, multi.twbx) do; scale-to-fit preserves the
  // designed proportions (an automatic <size /> let Tableau re-lay the flow
  // and distorted the fixed/flexible balance).
  assert(/sizing-mode='fixed'/.test(xml), "tiled dashboard keeps fixed min=max sizing");
  assert(!/<size \/>/.test(xml), "no automatic <size /> in the tiled workbook");

  // GENERALIZED strategy rules (mirrors the LaDataViz references exactly):
  // every multi-child HORZ row carries distribute-evenly (an unequal
  // strategy-less horz row is an unproven construct that collapsed columns
  // into one-char slivers); VERT stacks carry it only when genuinely even.
  // Here: header row + chart row = 2, all horz (the single-filter row and the
  // vert body/KPI stacks carry none).
  const deZones = [...xml.matchAll(/<zone[^>]*layout-strategy-id='distribute-evenly'[^>]*>/g)];
  assert(deZones.length === 2, "distribute-evenly on the 2 multi-child horz rows, got " + deZones.length);
  assert(deZones.every((m) => /param='horz'/.test(m[0])), "distribute-evenly only on horz rows");

  // WIDTH-pin safety: a narrow zone (the 120px button, 10% of its row) keeps
  // its pin; a WIDE zone (the 900px header text, 76% of its row) must NOT be
  // width-pinned — a wide pin starves its siblings into slivers (the exact
  // "vertical one-char text" failure). It flexes instead.
  assert(/fixed-size='120' is-fixed='true'[^>]*name='Next'/.test(xml), "nav button pinned to 120px in the flow");
  const headerZone = xml.match(/<zone[^>]*friendly-name='Header'[^>]*>/)?.[0] ?? "";
  assert(headerZone !== "" && !/fixed-size/.test(headerZone), "wide header text is NOT width-pinned");

  // the FILTER/ card landed in a HEIGHT-PINNED filter bar row at the top of the
  // vert body — NEVER a fixed-width sidebar (distribute-evenly ignores width
  // pins, so a sidebar always equalized to ~half the dashboard, wasting a huge
  // empty column). The row is pinned to the clamped quick-filter height.
  const filtersZone = xml.match(/<zone[^>]*friendly-name='Filters'[^>]*>/)?.[0] ?? "";
  assert(/param='horz'[^>]*type-v2='layout-flow'/.test(filtersZone), "Filters top-bar row container present");
  assert(/fixed-size='110' is-fixed='true'/.test(filtersZone), "Filters row height-pinned (clamped), got: " + filtersZone);
  assert(/type-v2='filter'/.test(xml), "quick-filter card emitted inside the tree");
  assert(!/friendly-name='Filter Fill'/.test(xml), "no filler needed for a top filter row");

  // tinted spacer tiles: empty zones with the card colour, pinned to gap height.
  const spacerBlocks = [...xml.matchAll(/<zone[^>]*friendly-name='Card Fill'[^>]*>/g)];
  assert(spacerBlocks.length >= 2, "KPI card gap spacers emitted: " + spacerBlocks.length);
  assert(spacerBlocks.every((m) => /type-v2='empty'/.test(m[0]) && /is-fixed='true'/.test(m[0])),
    "spacers are pinned empty zones");

  // CONFIRMED-XML discipline: a layout-flow zone must NOT carry a background
  // (no reference does — container bg is unconfirmed). Check each flow zone's
  // OWN style block (up to its first child zone) has no background-color.
  for (const m of xml.matchAll(/<zone\b[^>]*type-v2='layout-flow'[^>]*>([\s\S]*?)<zone/g)) {
    assert(!/background-color/.test(m[1]), "layout-flow container has no background-color (margin-only)");
  }

  // the KPI panel colour reaches the generated XML (on the KPI text tiles).
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
