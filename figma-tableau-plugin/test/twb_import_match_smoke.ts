// Swap-matching smoke: the fix for "real sheets don't show — every chart is the
// default demo bar." Matching a SHEET/ placeholder to an imported worksheet must
// be tolerant of CASE and WHITESPACE (an exact, case-sensitive match silently
// fell back to a demo for every sheet). Also: a placeholder that matches NOTHING
// must be reported via SwapResult.unmatched so the failure is never silent.
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
const SWAP = "Sheet 15";

const mk = (id: string, layerName: string, sheetName: string): FaithfulModel => ({
  id,
  title: "Home " + id,
  width: 1280,
  height: 800,
  background: "#F4F5FB",
  zones: [{ id: id + "-s", name: layerName, kind: "sheet", x: 40, y: 80, w: 1100, h: 600, sheetName, chart: "Bar" }],
});

async function main() {
  const file = readFileSync(TWBX);
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const parsed = await parseImport(ab as ArrayBuffer, "DM_Dashboards.twbx");
  assert(parsed.worksheetNames.includes(SWAP), `imported workbook exposes "${SWAP}"`);

  // Case + whitespace differences must STILL swap to the real sheet.
  const spec = faithfulSpecMulti([mk("f1", "SHEET/  sHeEt   15 [bar]", "sHeEt   15")]);
  const r = applyImportedSwap(spec, parsed);
  assert(r.swapped === 1, `case/space mismatch still swaps (got ${r.swapped})`);
  assert(r.unmatched.length === 0, "nothing reported unmatched: " + r.unmatched.join(","));
  const zoneWs = spec.dashboards[0].zones.find((z) => z.kind === "sheet")!.worksheet;
  assert(zoneWs === SWAP, `zone points at the REAL imported name (got ${zoneWs})`);
  const xml = generateSpecWorkbook(spec).twbXml;
  assert(xml.includes(`<worksheet name='${SWAP}'>`), "real worksheet XML spliced (not a demo)");
  assert(xml.includes("federated.0ac7"), "imported federated datasource spliced");

  // A placeholder that matches NOTHING is reported (so the UI can warn instead of
  // silently shipping demo data).
  const spec2 = faithfulSpecMulti([mk("f2", "SHEET/Totally Made Up[bar]", "Totally Made Up")]);
  const r2 = applyImportedSwap(spec2, parsed);
  assert(r2.swapped === 0, "no match → nothing swapped");
  assert(r2.unmatched.includes("Totally Made Up"), "unmatched placeholder reported: " + r2.unmatched.join(","));

  console.log("OK  twb import match:", { swapped: r.swapped, zoneWs, unmatched2: r2.unmatched });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
