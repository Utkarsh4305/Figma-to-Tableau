// Nav/ smoke: a Nav/ layer's target comes from its FIGMA PROTOTYPE INTERACTION
// (not the layer name). The sandbox walk records the reaction's destination node
// id on the zone (navTargetId); expandNavTargets fills in navTargetFrameId /
// navTargetIsSheet; seed.ts resolves each to a real window. This test feeds those
// post-resolution fields directly (the Figma read can't run headless) and locks:
//   - a Nav whose destination is a SHEET/ node navigates to that WORKSHEET window
//   - a Nav whose destination is a FRAME navigates to that DASHBOARD window
//   - an unresolvable destination falls back to a plain (non-nav) button
//   - the goto-sheet window-id matches the target window's <simple-id> exactly
// Writes test-out/Faithful_NavLink_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpecMulti } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// Home (frame f1): a chart + three Nav/ buttons (→ dashboard, → worksheet, broken).
const home: FaithfulModel = {
  id: "f1",
  title: "Home",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [
    { id: "h-sheet", name: "SHEET/Sales[bar]", kind: "sheet", x: 40, y: 200, w: 560, h: 360, sheetName: "Sales", chart: "Bar" },
    // Nav → the Details FRAME (dashboard target)
    { id: "n-dash", name: "Nav/Open Details", kind: "button", x: 40, y: 40, w: 160, h: 48, label: "Open Details", navTargetId: "f2", navTargetFrameId: "f2", navTargetIsSheet: false, fill: "#2563EB", fontColor: "#FFFFFF", fontSize: 13 },
    // Nav → the Detail SHEET node directly (worksheet target)
    { id: "n-sheet", name: "Nav/Jump to Chart", kind: "button", x: 220, y: 40, w: 160, h: 48, label: "Jump to Chart", navTargetId: "d-sheet", navTargetFrameId: "f2", navTargetIsSheet: true, fill: "#10B981", fontColor: "#FFFFFF", fontSize: 13 },
    // Nav with an unresolvable destination -> plain button
    { id: "n-bad", name: "Nav/Broken", kind: "button", x: 400, y: 40, w: 160, h: 48, label: "Broken", navTargetId: "ghost", navTargetFrameId: "ghost-frame", navTargetIsSheet: false, fill: "#999999", fontColor: "#FFFFFF", fontSize: 13 },
  ],
};
// Details (frame f2): the worksheet the second Nav points at.
const details: FaithfulModel = {
  id: "f2",
  title: "Details",
  width: 1280,
  height: 800,
  background: "#FFFFFF",
  zones: [
    { id: "d-sheet", name: "SHEET/Detail[line]", kind: "sheet", x: 40, y: 120, w: 1200, h: 560, sheetName: "Detail", chart: "Line" },
  ],
};

async function main() {
  const spec = faithfulSpecMulti([home, details]);
  assert(spec.dashboards.length === 2, "two frames -> two dashboards");

  const navDash = spec.dashboards[0].zones.find((z) => z.kind === "button" && z.text === "Open Details");
  const navSheet = spec.dashboards[0].zones.find((z) => z.kind === "button" && z.text === "Jump to Chart");
  const navBad = spec.dashboards[0].zones.find((z) => z.kind === "button" && z.text === "Broken");

  assert(!!navDash && navDash.targetDashboard === "Details" && !navDash.targetWorksheet, "Nav→frame resolves to the Details DASHBOARD");
  assert(!!navSheet && navSheet.targetWorksheet === "Detail" && !navSheet.targetDashboard, "Nav→SHEET resolves to the Detail WORKSHEET");
  assert(!!navBad && !navBad.targetDashboard && !navBad.targetWorksheet, "unresolvable Nav is left plain");

  const xml = generateSpecWorkbook(spec).twbXml;

  // Two native nav buttons; the broken one is a plain text zone.
  assert((xml.match(/type-v2='dashboard-object'/g) || []).length === 2, "exactly two native nav buttons");
  assert(/<caption>Open Details<\/caption>/.test(xml), "dashboard-nav caption present");
  assert(/<caption>Jump to Chart<\/caption>/.test(xml), "worksheet-nav caption present");
  assert(!/<caption>Broken<\/caption>/.test(xml), "broken nav is NOT a native button");

  // window-id of each button must equal its target window's <simple-id> uuid.
  const detailsDashUuid = xml.match(/<window class='dashboard'[^>]*name='Details'>[\s\S]*?<simple-id uuid='(\{[^}]+\})'/)![1];
  const detailWsUuid = xml.match(/<window class='worksheet' name='Detail'>[\s\S]*?<simple-id uuid='(\{[^}]+\})'/)![1];
  const homeDash = xml.slice(xml.indexOf("<dashboard name='Home'>"), xml.indexOf("<dashboard name='Details'>"));
  assert(homeDash.includes(`tabdoc:goto-sheet window-id=&quot;${detailsDashUuid}&quot;`), "dashboard-nav targets the Details dashboard window uuid");
  assert(homeDash.includes(`tabdoc:goto-sheet window-id=&quot;${detailWsUuid}&quot;`), "worksheet-nav targets the Detail worksheet window uuid");
  assert(detailsDashUuid !== detailWsUuid, "dashboard and worksheet windows have distinct uuids");

  // load-safety invariants.
  assert(xml.includes("<windows"), "windows section present");
  assert(!/<shelf-sorts/.test(xml), "no shelf-sorts (load killer)");
  assert(!xml.includes("NaN"), "no NaN attributes");

  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());
  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Faithful_NavLink_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Faithful_NavLink_Test.twbx"), buf);
  console.log("OK  faithful nav-link:", { dashboards: spec.dashboards.length, dashNav: navDash!.targetDashboard, sheetNav: navSheet!.targetWorksheet, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
