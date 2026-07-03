// Nav/ smoke: a Nav/ layer's target comes from its FIGMA PROTOTYPE INTERACTION
// (not the layer name). The sandbox walk records the reaction's destination node
// id (navTargetId) and marks the zone isNav; expandNavTargets fills in
// navTargetFrameId / navTargetIsSheet; seed.ts turns each into a button-WORKSHEET
// + a <nav-action>. This test feeds those post-resolution fields directly (the
// Figma read can't run headless) and locks:
//   - a Nav whose destination is a SHEET/ node navigates to that WORKSHEET
//   - a Nav whose destination is a FRAME navigates to that DASHBOARD
//   - an unresolvable destination produces NO nav-action (plain button label)
//   - NO native <button>; <nav-action> + NavigationAction manifest flag
// Writes test-out/Faithful_NavLink_Test.twb(x).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpecMulti } from "../src/plugin/faithfulSpec";
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
    { id: "n-dash", name: "Nav/Open Details", kind: "button", x: 40, y: 40, w: 160, h: 48, label: "Open Details", isNav: true, navTargetId: "f2", navTargetFrameId: "f2", navTargetIsSheet: false, fill: "#2563EB", fontColor: "#FFFFFF", fontSize: 13 },
    // Nav → the Detail SHEET node directly (worksheet target)
    { id: "n-sheet", name: "Nav/Jump to Chart", kind: "button", x: 220, y: 40, w: 160, h: 48, label: "Jump to Chart", isNav: true, navTargetId: "d-sheet", navTargetFrameId: "f2", navTargetIsSheet: true, fill: "#10B981", fontColor: "#FFFFFF", fontSize: 13 },
    // Nav with an unresolvable destination -> no nav-action
    { id: "n-bad", name: "Nav/Broken", kind: "button", x: 400, y: 40, w: 160, h: 48, label: "Broken", isNav: true, navTargetId: "ghost", navTargetFrameId: "ghost-frame", navTargetIsSheet: false, fill: "#999999", fontColor: "#FFFFFF", fontSize: 13 },
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

  const navs = spec.actions.filter((a) => a.kind === "navigate");
  assert(navs.length === 2, `two resolved nav-actions (got ${navs.length})`);
  assert(navs.some((a) => a.sourceSheet === "Open Details" && a.target === "Details"), "Nav→frame resolves to the Details DASHBOARD");
  assert(navs.some((a) => a.sourceSheet === "Jump to Chart" && a.target === "Detail"), "Nav→SHEET resolves to the Detail WORKSHEET");
  assert(!navs.some((a) => a.sourceSheet === "Broken"), "unresolvable Nav has no nav-action");

  const xml = generateSpecWorkbook(spec).twbXml;

  assert(!/<button[\s>]/.test(xml), "no native <button> element");
  assert((xml.match(/<nav-action /g) || []).length === 2, "exactly two <nav-action>s");
  assert(/<NavigationAction \/>/.test(xml), "NavigationAction manifest flag present");

  // Both buttons live on Home -> both nav-actions are sourced from Home; one
  // targets the Details DASHBOARD, the other the Detail WORKSHEET.
  const toDash = xml.match(/<nav-action caption='Go to Details'[\s\S]*?<\/nav-action>/)![0];
  const toSheet = xml.match(/<nav-action caption='Go to Detail'[\s\S]*?<\/nav-action>/)![0];
  assert(/<source dashboard='Home'/.test(toDash) && /<param name='sheet' value='Details' \/>/.test(toDash), "dashboard-nav: source Home, target Details");
  assert(/<source dashboard='Home'/.test(toSheet) && /<param name='sheet' value='Detail' \/>/.test(toSheet), "worksheet-nav: source Home, target Detail");

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
  console.log("OK  faithful nav-link:", { dashboards: spec.dashboards.length, navActions: navs.length, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
