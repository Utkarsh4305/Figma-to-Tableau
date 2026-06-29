// Entity-name smoke: a real worksheet named with an XML entity, e.g.
// "Subject Count and & Percentage" (stored as `name='… &amp; …'`), must:
//   - parse to the DECODED real name (so the staged SHEET/ layer + match work),
//   - swap in (a SHEET/ layer carrying the real "&" matches it),
//   - splice with the name escaped exactly ONCE (no "&amp;amp;" double-escape, so
//     the dashboard zone still resolves the worksheet instead of showing a demo).
import { faithfulSpecMulti } from "../src/plugin/seed";
import { parseImport } from "../src/plugin/twbImport";
import { generateSpecWorkbook, applyImportedSwap } from "../src/plugin/exporter";
import type { FaithfulModel } from "../src/shared/types";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

const REAL = "Subject Count and & Percentage By Treatment Group";
// A minimal but structurally valid-enough .twb: one datasource, one worksheet whose
// name carries the &amp; entity and depends on that datasource.
const TWB = `<?xml version='1.0' encoding='utf-8' ?>
<workbook>
  <datasources>
    <datasource caption='Real' name='federated.abc123' version='18.1'>
      <connection class='excel-direct' />
    </datasource>
  </datasources>
  <worksheets>
    <worksheet name='Subject Count and &amp; Percentage By Treatment Group'>
      <table>
        <view>
          <datasources>
            <datasource caption='Real' name='federated.abc123' />
          </datasources>
          <datasource-dependencies datasource='federated.abc123'>
            <column datatype='integer' name='[Count]' role='measure' type='quantitative' />
          </datasource-dependencies>
        </view>
        <panes><pane><mark class='Bar' /></pane></panes>
      </table>
    </worksheet>
  </worksheets>
</workbook>`;

async function main() {
  const buf = new TextEncoder().encode(TWB).buffer;
  const parsed = await parseImport(buf as ArrayBuffer, "real.twb");
  assert(parsed.worksheetNames.length === 1, "one worksheet parsed");
  assert(parsed.worksheetNames[0] === REAL, `name decoded to real "&": got "${parsed.worksheetNames[0]}"`);

  // The Figma SHEET/ placeholder carries the real "&" (as "Add to Figma" would stage it).
  const model: FaithfulModel = {
    id: "f1", title: "Home", width: 1280, height: 800, background: "#F4F5FB",
    zones: [{ id: "s1", name: `SHEET/${REAL}`, kind: "sheet", x: 40, y: 80, w: 1100, h: 600, sheetName: REAL, chart: "Bar" }],
  };
  const spec = faithfulSpecMulti([model]);
  const r = applyImportedSwap(spec, parsed);
  assert(r.swapped === 1, `entity-named sheet swaps (got ${r.swapped}, unmatched=${r.unmatched.join(",")})`);

  const xml = generateSpecWorkbook(spec).twbXml;
  // Escaped exactly once everywhere it appears (zone, window, spliced worksheet).
  assert(xml.includes("&amp; Percentage"), "name escaped once (&amp;)");
  assert(!xml.includes("&amp;amp;"), "NOT double-escaped (&amp;amp;)");
  // The dashboard zone, the worksheet block, and the window all carry the SAME bytes.
  const enc = "Subject Count and &amp; Percentage By Treatment Group";
  assert(xml.includes(`<worksheet name='${enc}'>`), "real worksheet spliced with single-escaped name");
  assert(xml.includes(`name='${enc}' show-title=`), "dashboard zone references the same single-escaped name");
  assert(xml.includes(`class='worksheet' name='${enc}'`), "worksheet window uses the same single-escaped name");
  assert(xml.includes("federated.abc123"), "imported datasource spliced");

  console.log("OK  twb import entity:", { name: parsed.worksheetNames[0], swapped: r.swapped });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
