// Duplicate dashboard-name smoke: several selected Figma frames sharing a name
// (e.g. multiple "Data Metrics") must NOT produce a workbook that fails to load
// with D2E8DA72 ("element 'windows' declares duplicate identity constraint").
// Locks in:
//   - dashboard names are de-duplicated ("Data Metrics", "Data Metrics 2", …)
//   - every <window> name in the windows section is unique
//   - every <simple-id> uuid in the windows section is unique (the nav change
//     keyed the dashboard window uuid by name, so collisions would dupe uuids)
//   - generateSpecWorkbook does NOT throw the duplicate-identity guard
import { faithfulSpecMulti } from "../src/plugin/seed";
import { generateSpecWorkbook } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

const mk = (title: string, id: string): FaithfulModel => ({
  id,
  title,
  width: 1280,
  height: 800,
  background: "#FFFFFF",
  zones: [
    { id: id + "-s", name: "SHEET/Metric[bar]", kind: "sheet", x: 40, y: 80, w: 600, h: 360, sheetName: "Metric", chart: "Bar" },
  ],
});

async function main() {
  // three frames, TWO of them named "Data Metrics" (the real failure case).
  const models = [mk("Data Metrics", "f1"), mk("Calories", "f2"), mk("Data Metrics", "f3")];
  const spec = faithfulSpecMulti(models);

  const names = spec.dashboards.map((d) => d.name);
  assert(names.length === 3, "three dashboards");
  assert(new Set(names).size === 3, "dashboard names de-duplicated, got: " + names.join(","));
  assert(names.includes("Data Metrics") && names.includes("Data Metrics 2"), "collision resolved to 'Data Metrics' / 'Data Metrics 2': " + names.join(","));

  // generateSpecWorkbook runs validateTwb, which now THROWS on duplicate window
  // identity — so a clean return proves no duplicates slipped through.
  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  const wins = xml.match(/<windows[\s\S]*?<\/windows>/)![0];
  const winNames = [...wins.matchAll(/<window class='(?:worksheet|dashboard)'[^>]*name='([^']*)'/g)].map((m) => m[1]);
  assert(new Set(winNames).size === winNames.length, "all window names unique: " + winNames.join(","));
  const winUuids = [...wins.matchAll(/<simple-id uuid='([^']+)'/g)].map((m) => m[1]);
  assert(new Set(winUuids).size === winUuids.length, "all window simple-id uuids unique (" + winUuids.length + " ids)");

  // the guard really fires when fed a bad spec (two dashboards forced same name).
  let threw = false;
  try {
    const bad = faithfulSpecMulti([mk("X", "a"), mk("Y", "b")]);
    bad.dashboards[1].name = bad.dashboards[0].name; // force a collision post-dedup
    generateSpecWorkbook(bad);
  } catch (e) {
    threw = /D2E8DA72|duplicate/i.test(String(e));
  }
  assert(threw, "validateTwb throws on a forced duplicate window name");

  console.log("OK  faithful dupname:", { dashboards: names.length, names: names.join(" / "), winUuids: winUuids.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
