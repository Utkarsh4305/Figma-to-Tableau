// Navigation smoke: a BUTTON/ layer becomes a NATIVE Tableau navigation button
// (type-v2='dashboard-object' + <button action='tabdoc:goto-sheet'>), copied
// from LaDataViz's multi.twbx. Locks in:
//   - the button zone targets the OTHER dashboard's window <simple-id> uuid
//   - the goto-sheet window-id matches that dashboard window's simple-id exactly
//   - the BasicButtonObject manifest flags are present (required for the object)
//   - explicit "Label > Target" parsing resolves the named target dashboard
//   - a button with NO resolvable target falls back to a text zone (load-safe)
//   - the merged .twb stays load-safe (windows present, no shelf-sorts, no NaN)
// Writes test-out/Faithful_Nav_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpecMulti } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// Dashboard A has a button explicitly targeting "Details" + a chart.
const home: FaithfulModel = {
  id: "f1",
  title: "Home",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    { id: "h-sheet", name: "SHEET/Sales[bar]", kind: "sheet", x: 40, y: 120, w: 560, h: 360, sheetName: "Sales", chart: "Bar" },
    // explicit target -> "Details" dashboard
    { id: "h-btn", name: "BUTTON/View Details > Details", kind: "button", x: 40, y: 40, w: 160, h: 48, label: "View Details", target: "Details", fill: "#2563EB", fontColor: "#FFFFFF", fontSize: 13 },
  ],
};
// Dashboard B has a button with NO explicit target (2-dashboard toggle -> Home)
// and a second button whose target names a NON-EXISTENT dashboard (unresolvable
// -> renders as a plain text zone, no navigation).
const details: FaithfulModel = {
  id: "f2",
  title: "Details",
  width: 1280,
  height: 800,
  background: "#FFFFFF",
  zones: [
    { id: "d-sheet", name: "SHEET/Detail[line]", kind: "sheet", x: 40, y: 120, w: 560, h: 360, sheetName: "Detail", chart: "Line" },
    { id: "d-back", name: "BUTTON/Back", kind: "button", x: 40, y: 40, w: 120, h: 48, label: "Back", fill: "#111827", fontColor: "#FFFFFF", fontSize: 13 },
    { id: "d-bogus", name: "BUTTON/Nowhere > Does Not Exist", kind: "button", x: 200, y: 40, w: 120, h: 48, label: "Nowhere", target: "Does Not Exist", fill: "#999999", fontColor: "#FFFFFF", fontSize: 13 },
  ],
};

async function main() {
  const spec = faithfulSpecMulti([home, details]);

  assert(spec.dashboards.length === 2, "two frames -> two dashboards");

  // target resolution: Home button -> Details; Details "Back" -> Home (toggle);
  // Details "Nowhere" -> unresolved (cleared).
  const homeBtn = spec.dashboards[0].zones.find((z) => z.kind === "button" && z.text === "View Details");
  const backBtn = spec.dashboards[1].zones.find((z) => z.kind === "button" && z.text === "Back");
  const bogusBtn = spec.dashboards[1].zones.find((z) => z.kind === "button" && z.text === "Nowhere");
  assert(!!homeBtn && homeBtn.targetDashboard === "Details", "Home button resolves to Details");
  assert(!!backBtn && backBtn.targetDashboard === "Home", "Back button (no explicit target, 2 dashboards) toggles to Home");
  assert(!!bogusBtn && !bogusBtn.targetDashboard, "unresolvable target is cleared");

  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  // Two native nav buttons emitted (Home->Details, Back->Home); the bogus one
  // falls back to a text zone (no dashboard-object).
  assert((xml.match(/type-v2='dashboard-object'/g) || []).length === 2, "exactly two native nav buttons");
  assert(/button-type='text'/.test(xml), "button-type='text'");
  assert(/<caption>View Details<\/caption>/.test(xml), "Home button caption present");
  assert(/<caption>Back<\/caption>/.test(xml), "Back button caption present");
  // the bogus button rendered as a text zone, not a dashboard-object button.
  assert(!/<caption>Nowhere<\/caption>/.test(xml), "unresolvable button is NOT a nav button");

  // The Home button's window-id must equal the Details dashboard window's uuid.
  const detailsWin = xml.match(/<window class='dashboard'[^>]*name='Details'>[\s\S]*?<simple-id uuid='(\{[^}]+\})'/);
  assert(!!detailsWin, "Details dashboard window has a simple-id");
  const detailsUuid = detailsWin![1];
  const homeWin = xml.match(/<window class='dashboard'[^>]*name='Home'>[\s\S]*?<simple-id uuid='(\{[^}]+\})'/);
  assert(!!homeWin, "Home dashboard window has a simple-id");
  const homeUuid = homeWin![1];

  // Slice each dashboard's <dashboard> block to check the button targets the
  // CORRECT other dashboard's window uuid.
  const homeDashStart = xml.indexOf("<dashboard name='Home'>");
  const detailsDashStart = xml.indexOf("<dashboard name='Details'>");
  const homeDash = xml.slice(homeDashStart, detailsDashStart);
  const detailsDash = xml.slice(detailsDashStart, xml.indexOf("</dashboards>"));
  assert(
    homeDash.includes(`tabdoc:goto-sheet window-id=&quot;${detailsUuid}&quot;`),
    "Home's button navigates to the Details window uuid"
  );
  assert(
    detailsDash.includes(`tabdoc:goto-sheet window-id=&quot;${homeUuid}&quot;`),
    "Details' Back button navigates to the Home window uuid"
  );

  // manifest flags for the button object.
  assert(/<BasicButtonObject \/>/.test(xml), "BasicButtonObject manifest flag present");
  assert(/<BasicButtonObjectTextSupport \/>/.test(xml), "BasicButtonObjectTextSupport manifest flag present");

  // load-safety invariants.
  assert(xml.includes("<windows"), "windows section present");
  assert(!/<shelf-sorts/.test(xml), "no shelf-sorts (load killer)");
  assert(!xml.includes("NaN"), "no NaN attributes");

  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());

  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Faithful_Nav_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Faithful_Nav_Test.twbx"), buf);
  console.log("OK  faithful nav:", { dashboards: spec.dashboards.length, navButtons: 2, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
