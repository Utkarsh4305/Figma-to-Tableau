// Navigation smoke (BUTTON/ name convention). A BUTTON/ layer becomes a
// button-WORKSHEET (a Text-mark sheet showing the caption) + a <nav-action> that
// navigates on click — the only nav mechanism the user's Tableau accepts (the
// native <button> dashboard-object is rejected, D2E8DA72). Locks in:
//   - explicit "Label > Target" resolves to that dashboard's nav-action
//   - no explicit target + 2 dashboards -> toggles to the other
//   - an unresolvable target -> NO nav-action (button-worksheet is a plain label)
//   - NO <button> element anywhere; <nav-action> + NavigationAction manifest flag
//   - the nav-action source excludes every other sheet so only the button fires
//   - load-safe (windows present, no shelf-sorts, no NaN)
// Writes test-out/Faithful_Nav_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpecMulti } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// Dashboard A: a chart + a button explicitly targeting "Details".
const home: FaithfulModel = {
  id: "f1",
  title: "Home",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    { id: "h-sheet", name: "SHEET/Sales[bar]", kind: "sheet", x: 40, y: 120, w: 560, h: 360, sheetName: "Sales", chart: "Bar" },
    { id: "h-btn", name: "BUTTON/View Details > Details", kind: "button", x: 40, y: 40, w: 160, h: 48, label: "View Details", target: "Details", fill: "#2563EB", fontColor: "#FFFFFF", fontSize: 13 },
  ],
};
// Dashboard B: a "Back" button (no explicit target -> 2-dashboard toggle -> Home)
// and a button whose target doesn't exist (unresolvable -> no nav-action).
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

  // Each BUTTON/ became a button-worksheet (Text-mark, navButton set).
  const btnWs = spec.worksheets.filter((w) => w.navButton);
  assert(btnWs.length === 3, "three BUTTON/ layers -> three button-worksheets");
  assert(btnWs.some((w) => w.navButton!.caption === "View Details"), "caption carried onto the button-worksheet");

  // Navigation = nav-action (kind 'navigate'). View Details -> Details; Back ->
  // Home (toggle); Nowhere -> unresolved (no action).
  const navs = spec.actions.filter((a) => a.kind === "navigate");
  assert(navs.length === 2, `two resolved nav-actions (got ${navs.length})`);
  assert(navs.some((a) => a.sourceSheet === "View Details" && a.target === "Details"), "View Details -> Details");
  assert(navs.some((a) => a.sourceSheet === "Back" && a.target === "Home"), "Back -> Home (toggle)");
  assert(!navs.some((a) => a.sourceSheet === "Nowhere"), "unresolvable button has no nav-action");

  const xml = generateSpecWorkbook(spec).twbXml;

  // NO native button; nav-actions + manifest flag present.
  assert(!/<button[\s>]/.test(xml), "no native <button> element");
  assert(!/type-v2='dashboard-object'/.test(xml), "no dashboard-object zone");
  assert((xml.match(/<nav-action /g) || []).length === 2, "exactly two <nav-action>s");
  assert(/<NavigationAction \/>/.test(xml), "NavigationAction manifest flag present");

  // The button-worksheet renders the caption (string-literal calc + label).
  assert(/<worksheet name='View Details'>/.test(xml), "button-worksheet emitted");
  assert(/formula='&quot;View Details&quot;'/.test(xml), "caption baked as a string calc");

  // The View Details nav-action: source dashboard 'Home', target 'Details',
  // excludes the other Home sheet ('Sales') so only the button triggers it.
  const navBlock = xml.match(/<nav-action caption='Go to Details'[\s\S]*?<\/nav-action>/)![0];
  assert(/<source dashboard='Home' type='sheet'>/.test(navBlock), "nav-action sourced from the Home dashboard");
  assert(/<exclude-sheet name='Sales' \/>/.test(navBlock), "other sheet excluded so only the button fires");
  assert(/<param name='sheet' value='Details' \/>/.test(navBlock), "navigates to Details");

  // load-safety invariants.
  assert(xml.includes("<windows"), "windows section present");
  assert(!/<shelf-sorts/.test(xml), "no shelf-sorts (load killer)");
  assert(!xml.includes("NaN"), "no NaN attributes");
  // <actions> MUST come before <worksheets> per the workbook content model, else
  // D2E8DA72 "element 'actions' is not allowed". Lock the order.
  assert(xml.indexOf("<actions>") < xml.indexOf("<worksheets>"), "<actions> precedes <worksheets>");
  assert(xml.indexOf("</datasources>") < xml.indexOf("<actions>"), "<actions> follows <datasources>");

  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());

  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Faithful_Nav_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Faithful_Nav_Test.twbx"), buf);
  console.log("OK  faithful nav:", { dashboards: spec.dashboards.length, navActions: navs.length, buttonWorksheets: btnWs.length, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
