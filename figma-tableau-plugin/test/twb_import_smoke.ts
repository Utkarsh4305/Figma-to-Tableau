// Worksheet-swap smoke: import REAL worksheets from an existing .twbx and splice
// them into a faithful export so a SHEET/ placeholder renders the user's actual
// sheet on their actual data instead of a demo. Uses examples/DM_Dashboards.twbx
// (Excel-backed federated datasource). Writes test-out/Imported_Swap_Test.twbx.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { faithfulSpec } from "../src/plugin/seed";
import { parseImport } from "../src/plugin/twbImport";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

const TWBX = resolve(__dirname, "..", "..", "examples", "DM_Dashboards.twbx");
const SWAP = "Sheet 15"; // a real worksheet inside DM_Dashboards.twbx

async function main() {
  // 1. Parse the existing workbook and confirm it exposes its real worksheets.
  const file = readFileSync(TWBX);
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const parsed = await parseImport(ab as ArrayBuffer, "DM_Dashboards.twbx");
  assert(parsed.worksheetNames.includes(SWAP), `imported workbook exposes "${SWAP}": ${parsed.worksheetNames.join(", ")}`);

  const payload = parsed.payloadFor([SWAP]);
  assert(payload.worksheetXml.has(SWAP), "payload carries the chosen worksheet XML verbatim");
  assert(payload.datasourceXml.size >= 1, "payload carries the datasource(s) the sheet depends on");
  assert(payload.assets.length >= 1, "payload carries the backing data file(s)");
  const dsName = [...payload.datasourceXml.keys()][0];
  assert(/^federated\./.test(dsName), "datasource name is a federated.* id: " + dsName);

  // 2. Build a faithful design whose SHEET/ placeholder is named to match.
  const model: FaithfulModel = {
    id: "frame",
    title: "Swap Demo",
    width: 1280,
    height: 800,
    background: "#F4F5FB",
    zones: [
      { id: "s1", name: `SHEET/${SWAP}[bar]`, kind: "sheet", x: 40, y: 80, w: 1200, h: 640, sheetName: SWAP, chart: "Bar" },
    ],
  };
  const spec = faithfulSpec(model);
  assert(spec.worksheets.some((w) => w.name === SWAP), "faithfulSpec made a demo worksheet for the placeholder");
  spec.imports = payload; // the swap: attach the imported real sheet

  // 3. Generate and verify the merge.
  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  // The imported worksheet appears exactly once (demo of that name was dropped).
  const wsHits = (xml.match(new RegExp(`<worksheet name='${SWAP}'>`, "g")) || []).length;
  assert(wsHits === 1, `imported worksheet present exactly once (demo dropped), got ${wsHits}`);
  assert(xml.includes(`name='${dsName}'`), "imported datasource spliced into <datasources>");
  assert(/class='excel-direct'/.test(xml), "imported Excel connection carried verbatim");
  assert(xml.includes(`class='worksheet' name='${SWAP}'`), "imported sheet has a worksheet <window>");
  // The dashboard zone references the imported sheet by name.
  assert(new RegExp(`name='${SWAP}'[^>]*type-v2=`).test(xml) || xml.includes(`name='${SWAP}' show-title=`), "dashboard zone points at the imported sheet");
  assert(xml.includes("<windows"), "windows section present");
  assert(!/<shelf-sorts/.test(xml), "no shelf-sorts load killer");
  assert(!xml.includes("NaN"), "no NaN attributes");

  // 4. Package and confirm the backing data file rides along at its exact path.
  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  assert(names.some((n) => /^Data\/.+\.xlsx$/i.test(n)), "imported .xlsx packaged under Data/: " + names.join(","));
  assert(names.some((n) => n === "Data/data.csv"), "our sample CSV still packaged (no collision)");

  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Imported_Swap_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "Imported_Swap_Test.twbx"), buf);
  console.log("OK  twb import/swap:", { imported: parsed.worksheetNames.length, swapped: SWAP, ds: dsName, assets: payload.assets.length, twb: xml.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
