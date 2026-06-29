// Swap-sharing smoke (Issues 1 & 2): the SAME imported sheet placed on SEVERAL
// dashboards must swap to the user's REAL sheet on EVERY copy — not just the
// first. seed dedupes repeats to "Sheet 15"/"Sheet 15 2"; applyImportedSwap
// repoints each copy at the one imported worksheet by BASE name, prunes the
// orphaned demo, and the generator splices the real sheet once. Locks in:
//   - both dashboard zones reference the single imported worksheet
//   - exactly ONE worksheet of that name exists (the deduped demo is dropped)
//   - the imported worksheet XML + window appear exactly once
//   - BOTH dashboard windows list the imported sheet in their viewpoints
import { readFileSync } from "fs";
import { resolve } from "path";
import { faithfulSpecMulti } from "../src/plugin/seed";
import { parseImport } from "../src/plugin/twbImport";
import { generateSpecWorkbook, applyImportedSwap } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

const TWBX = resolve(__dirname, "..", "..", "examples", "DM_Dashboards.twbx");
const SWAP = "Sheet 15"; // a real worksheet inside DM_Dashboards.twbx

const mk = (id: string, title: string): FaithfulModel => ({
  id,
  title,
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  // the SAME SHEET/ placed on each dashboard (matches an imported worksheet)
  zones: [
    { id: id + "-s", name: `SHEET/${SWAP}[bar]`, kind: "sheet", x: 40, y: 80, w: 1100, h: 600, sheetName: SWAP, chart: "Bar" },
  ],
});

async function main() {
  const file = readFileSync(TWBX);
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const parsed = await parseImport(ab as ArrayBuffer, "DM_Dashboards.twbx");
  assert(parsed.worksheetNames.includes(SWAP), `imported workbook exposes "${SWAP}"`);

  // Two dashboards, each with the same imported sheet placed on it.
  const spec = faithfulSpecMulti([mk("f1", "Home"), mk("f2", "Detail")]);
  // seed dedupes: the two copies are "Sheet 15" and "Sheet 15 2" before the swap.
  const namesBefore = spec.worksheets.map((w) => w.name);
  assert(namesBefore.filter((n) => n.startsWith(SWAP)).length === 2, "two demo copies before swap: " + namesBefore.join(","));

  // The swap: repoint every copy at the one imported sheet.
  const r = applyImportedSwap(spec, parsed);
  assert(r.swapped === 1, `one distinct imported sheet swapped (got ${r.swapped})`);

  // Both dashboard zones now reference the single imported worksheet by name.
  const zoneWs = spec.dashboards.map((d) => d.zones.find((z) => z.kind === "sheet")!.worksheet);
  assert(zoneWs.every((n) => n === SWAP), "both dashboards point at the imported sheet: " + zoneWs.join(","));

  // The orphaned "Sheet 15 2" demo worksheet was pruned (only the base remains,
  // and the generator will replace IT with the imported XML).
  const namesAfter = spec.worksheets.map((w) => w.name);
  assert(!namesAfter.includes(`${SWAP} 2`), "deduped demo copy pruned: " + namesAfter.join(","));

  const xml = generateSpecWorkbook(spec).twbXml;

  // Imported worksheet present exactly once (demo dropped, real spliced once).
  const wsHits = (xml.match(new RegExp(`<worksheet name='${SWAP}'>`, "g")) || []).length;
  assert(wsHits === 1, `imported worksheet present exactly once, got ${wsHits}`);
  const winHits = (xml.match(new RegExp(`class='worksheet' name='${SWAP}'`, "g")) || []).length;
  assert(winHits === 1, `one worksheet <window> for the imported sheet, got ${winHits}`);

  // BOTH dashboard windows list the imported sheet in their viewpoints.
  const homeStart = xml.indexOf("<window class='dashboard' maximized='true' name='Home'>");
  const detStart = xml.indexOf("<window class='dashboard' maximized='true' name='Detail'>");
  assert(homeStart >= 0 && detStart >= 0, "both dashboard windows present");
  const homeWin = xml.slice(homeStart, detStart);
  const detWin = xml.slice(detStart);
  assert(new RegExp(`<viewpoint name='${SWAP}'>`).test(homeWin), "Home window shows the imported sheet");
  assert(new RegExp(`<viewpoint name='${SWAP}'>`).test(detWin), "Detail window shows the imported sheet");

  assert(!xml.includes("NaN"), "no NaN attributes");
  console.log("OK  twb import share:", { swapped: r.swapped, zones: zoneWs.length, wsHits, winHits });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
