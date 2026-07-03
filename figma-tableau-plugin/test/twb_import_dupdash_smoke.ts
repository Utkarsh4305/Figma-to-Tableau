// Swap-duplicate smoke: the SAME imported sheet placed TWICE on ONE dashboard
// must show the user's REAL sheet on BOTH copies — not the real one on the first
// and a leftover demo on the second. Tableau won't bind two dashboard zones to one
// worksheet (duplicate viewpoint identity), so applyImportedSwap splices a renamed
// CLONE of the imported worksheet ("X (copy)", same imported datasource) for the
// repeat. Locks in:
//   - the two zones point at "X" and "X (copy)" (both imported, distinct names)
//   - the deduped demo "X 2" is gone (not exported as a sample chart)
//   - two distinct worksheet windows + two distinct dashboard viewpoints exist
//   - the workbook is still well-formed (no duplicate-identity D2E8DA72)
import { readFileSync } from "fs";
import { resolve } from "path";
import { faithfulSpecMulti } from "../src/plugin/faithfulSpec";
import { parseImport } from "../src/plugin/twbImport";
import { generateSpecWorkbook, applyImportedSwap } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

const TWBX = resolve(__dirname, "..", "..", "examples", "DM_Dashboards.twbx");
const SWAP = "Sheet 15";

const model: FaithfulModel = {
  id: "f1",
  title: "Home",
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  // the SAME SHEET/ placed twice on ONE dashboard
  zones: [
    { id: "s1", name: `SHEET/${SWAP}[bar]`, kind: "sheet", x: 40, y: 80, w: 500, h: 300, sheetName: SWAP, chart: "Bar" },
    { id: "s2", name: `SHEET/${SWAP}[bar]`, kind: "sheet", x: 600, y: 80, w: 500, h: 300, sheetName: SWAP, chart: "Bar" },
  ],
};

async function main() {
  const file = readFileSync(TWBX);
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const parsed = await parseImport(ab as ArrayBuffer, "DM_Dashboards.twbx");
  assert(parsed.worksheetNames.includes(SWAP), `imported workbook exposes "${SWAP}"`);

  const spec = faithfulSpecMulti([model]);
  const r = applyImportedSwap(spec, parsed);
  assert(r.swapped === 1, `one distinct imported base swapped (got ${r.swapped})`);

  // Both zones now reference an imported sheet: the base + a renamed clone.
  const zoneWs = spec.dashboards[0].zones.filter((z) => z.kind === "sheet").map((z) => z.worksheet);
  assert(zoneWs[0] === SWAP, `first copy points at the imported sheet (got ${zoneWs[0]})`);
  assert(zoneWs[1] === `${SWAP} (copy)`, `repeat points at a renamed clone (got ${zoneWs[1]})`);

  // Both clone + base live in the imported XML; no demo "X 2" survives.
  assert(spec.imports!.worksheetXml.has(`${SWAP} (copy)`), "clone XML spliced");
  assert(!spec.worksheets.some((w) => w.name === `${SWAP} 2`), "deduped demo copy pruned");

  const xml = generateSpecWorkbook(spec).twbXml;

  // Two distinct real worksheet blocks (base + clone), two windows, two viewpoints.
  const baseHit = (xml.match(new RegExp(`<worksheet name='${SWAP}'>`, "g")) || []).length;
  const cloneHit = (xml.match(new RegExp(`<worksheet name='${SWAP} \\(copy\\)'>`, "g")) || []).length;
  assert(baseHit === 1, `base worksheet present once, got ${baseHit}`);
  assert(cloneHit === 1, `clone worksheet present once, got ${cloneHit}`);
  const winHits = (xml.match(/class='worksheet' name='Sheet 15( \(copy\))?'/g) || []).length;
  assert(winHits === 2, `two worksheet windows, got ${winHits}`);
  const vps = (xml.match(/<viewpoint name='Sheet 15( \(copy\))?'>/g) || []).length;
  assert(vps === 2, `two dashboard viewpoints, got ${vps}`);

  assert(!xml.includes("NaN"), "no NaN attributes");
  console.log("OK  twb import dup-dash:", { swapped: r.swapped, zoneWs, baseHit, cloneHit, winHits, vps });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
