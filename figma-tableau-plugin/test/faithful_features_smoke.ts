// Faithful new-features smoke: the LaDataViz-style layer conventions added in
// build filter-action-show-title-32 must lower to the CONFIRMED Tableau XML:
//   - FILTER/Field            -> a real quick-filter card (type-v2='filter')
//   - SHEET/Name[type]:showTitle  -> the worksheet zone shows its title
//   - SHEET/Name[type]:filter     -> a tsc:tsl-filter dashboard action
//   - SHEET/Name[type]:highlight  -> a tsc:brush dashboard action
// Writes test-out/Faithful_Features_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpec } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// Mimics what faithful.ts parseFaithful() would emit AFTER parsing these layer
// names (parseLayerOptions / FILTER prefix already strip the tags); we feed the
// post-parse zones directly so the test stays in the DOM-free UI context.
const model: FaithfulModel = {
  id: "frame",
  title: "Ops Dashboard",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    // SHEET/Sales by Region[bar]:filter:showTitle
    { id: "s1", name: "SHEET/Sales by Region[bar]:filter:showTitle", kind: "sheet", x: 40, y: 120, w: 560, h: 360, sheetName: "Sales by Region", chart: "Bar", showTitle: true, actionKind: "filter" },
    // SHEET/Trend[line]:highlight
    { id: "s2", name: "SHEET/Trend[line]:highlight", kind: "sheet", x: 640, y: 120, w: 560, h: 360, sheetName: "Trend", chart: "Line", actionKind: "highlight" },
    // FILTER/Region
    { id: "f1", name: "FILTER/Region", kind: "filter", x: 40, y: 40, w: 240, h: 48, filterField: "Region" },
    // URL/en.wikipedia.org/wiki/Tableau  (bare host gets an https:// scheme)
    { id: "w1", name: "URL/en.wikipedia.org/wiki/Tableau", kind: "web", x: 40, y: 500, w: 1200, h: 240, url: "https://en.wikipedia.org/wiki/Tableau" },
  ],
};

async function main() {
  const spec = faithfulSpec(model);
  assert(spec.worksheets.length === 2, "two SHEET/ layers -> two worksheets");
  assert(spec.includeActions === true, "actions enabled when :filter/:highlight present");
  assert(spec.actions.length === 2, "one filter + one highlight action");
  assert(spec.actions.some((a) => a.kind === "filter"), "filter action built");
  assert(spec.actions.some((a) => a.kind === "highlight"), "highlight action built");

  const filterZone = spec.dashboards[0].zones.find((z) => z.kind === "filter");
  assert(!!filterZone, "FILTER/ layer -> a filter zone");
  assert(filterZone!.worksheet === spec.worksheets[0].name, "filter card bound to a host worksheet");
  assert(filterZone!.field === "Region", "FILTER/Region -> Region dimension");

  const webZone = spec.dashboards[0].zones.find((z) => z.kind === "web");
  assert(!!webZone, "URL/ layer -> a web zone");
  assert(webZone!.url === "https://en.wikipedia.org/wiki/Tableau", "web zone carries the URL");

  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  // CONFIRMED constructs only (verified against DM_Dashboards / Clinical Trials).
  assert(/type-v2='filter'/.test(xml), "quick-filter card emitted (type-v2='filter')");
  assert(/mode='checkdropdown'/.test(xml), "filter card uses checkdropdown mode");
  assert(/name='Sales by Region' show-title='true'/.test(xml), ":showTitle -> show-title='true' on that sheet");
  assert(/name='Trend' show-title='false'/.test(xml), "untagged sheet stays show-title='false'");
  assert(/command='tsc:tsl-filter'/.test(xml), "filter action command present");
  assert(/command='tsc:brush'/.test(xml), "highlight action command present");
  assert(/<source type='sheet' worksheet='Trend' \/>/.test(xml), "highlight sourced from the Trend sheet");
  assert(/<source dashboard='Ops Dashboard'[^>]*worksheet='Sales by Region'/.test(xml), "filter sourced from its sheet, scoped to the dashboard");
  assert(/type-v2='web'/.test(xml), "web page object emitted (type-v2='web')");
  assert(/param='https:\/\/en.wikipedia.org\/wiki\/Tableau' type-v2='web'/.test(xml), "web zone carries the page URL as param");

  // Must remain load-safe (no known killers, windows present).
  assert(xml.includes("<windows"), "windows section present");
  assert(!/<shelf-sorts/.test(xml), "no shelf-sorts (load killer)");
  assert(!xml.includes("NaN"), "no NaN attributes");

  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());
  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Faithful_Features_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Faithful_Features_Test.twbx"), buf);
  console.log("OK  faithful features:", { worksheets: spec.worksheets.length, actions: spec.actions.length, filters: 1, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
