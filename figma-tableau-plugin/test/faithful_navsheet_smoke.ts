// Nav-to-sheet smoke (Issue 3): when a Nav/ button navigates to a SHEET whose
// frame the user did NOT select, only the WORKSHEET should be added — NOT its
// whole enclosing dashboard. expandNavTargets emits a `sheetOnly` model for that
// destination; assembleFaithfulWorkbook materializes its worksheet WITHOUT a
// dashboard. This test feeds that post-resolution shape directly (the Figma read
// can't run headless) and locks:
//   - a sheetOnly model adds a worksheet but NO dashboard
//   - the nav-action targets that worksheet
//   - only the ONE real (selected) dashboard exists
import { faithfulSpecMulti } from "../src/plugin/faithfulSpec";
import { generateSpecWorkbook } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// The selected dashboard: a chart + a Nav button pointing at an UNSELECTED sheet.
const home: FaithfulModel = {
  id: "f1",
  title: "Home",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    { id: "h-sheet", name: "SHEET/Sales[bar]", kind: "sheet", x: 40, y: 200, w: 560, h: 360, sheetName: "Sales", chart: "Bar" },
    // Nav → a SHEET node ("detail-node") whose dashboard was NOT selected.
    { id: "n-sheet", name: "Nav/Jump to Detail", kind: "button", x: 40, y: 40, w: 160, h: 48, label: "Jump to Detail", isNav: true, navTargetId: "detail-node", navTargetIsSheet: true, fill: "#10B981", fontColor: "#FFFFFF", fontSize: 13 },
  ],
};

// What expandNavTargets appends for the unselected SHEET destination: a sheetOnly
// model whose single sheet zone id === the nav destination node id.
const detailSheetOnly: FaithfulModel = {
  id: "detail-node",
  title: "Detail",
  width: 600,
  height: 400,
  sheetOnly: true,
  zones: [
    { id: "detail-node", name: "SHEET/Detail[line]", kind: "sheet", x: 0, y: 0, w: 600, h: 400, sheetName: "Detail", chart: "Line" },
  ],
};

async function main() {
  const spec = faithfulSpecMulti([home, detailSheetOnly]);

  // ONLY the selected frame becomes a dashboard — the sheet target did NOT add one.
  assert(spec.dashboards.length === 1, `one dashboard (sheet target adds no dashboard), got ${spec.dashboards.length}`);
  assert(spec.dashboards[0].name === "Home", "the one dashboard is Home");

  // The Detail worksheet exists (so the nav has somewhere to land).
  assert(spec.worksheets.some((w) => w.name === "Detail"), "Detail worksheet materialized");

  // The nav-action targets the WORKSHEET, not a dashboard.
  const navs = spec.actions.filter((a) => a.kind === "navigate");
  assert(navs.length === 1, `one nav-action (got ${navs.length})`);
  assert(navs[0].sourceSheet === "Jump to Detail" && navs[0].target === "Detail", "Nav→sheet targets the Detail worksheet");

  const xml = generateSpecWorkbook(spec).twbXml;
  assert((xml.match(/<dashboard name='/g) || []).length === 1, "exactly one <dashboard> element");
  assert((xml.match(/<window class='dashboard'/g) || []).length === 1, "exactly one dashboard window");
  // Detail has a worksheet window but no dashboard window.
  assert(/class='worksheet' name='Detail'/.test(xml), "Detail has a worksheet window");
  assert(!/class='dashboard'[^>]*name='Detail'/.test(xml), "Detail has NO dashboard window");
  assert(/<param name='sheet' value='Detail' \/>/.test(xml), "nav-action navigates to the Detail worksheet");
  assert(!xml.includes("NaN"), "no NaN attributes");

  console.log("OK  faithful nav-sheet:", { dashboards: spec.dashboards.length, worksheets: spec.worksheets.length, navActions: navs.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
