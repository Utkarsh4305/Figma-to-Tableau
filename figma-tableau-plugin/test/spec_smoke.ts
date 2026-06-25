// Exercises the spec-driven generator with the new features and writes a real
// .twbx to test-out/ for Tableau verification.
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { nextId } from "../src/shared/spec";
import { blankSpec } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

async function main() {
  const spec = blankSpec("Feature Test");

  // calculated field (conditional category)
  spec.data.calcs.push({
    id: nextId("calc"),
    localName: "Calculation_1001",
    name: "Value Band",
    formula: "IF [Value] > 50 THEN 'High' ELSE 'Low' END",
    type: "string",
    role: "dimension",
  });

  // worksheet: 2 measures + dual axis, conditional color by the calc field
  spec.worksheets[0] = {
    ...spec.worksheets[0],
    mark: "Bar",
    measures: [
      { field: "Value", agg: "Sum" },
      { field: "Amount", agg: "Average" },
    ],
    dualAxis: true,
    colorField: "Value Band",
    colorRules: [
      { value: "High", hex: "#2563eb" },
      { value: "Low", hex: "#d3d3d3" },
    ],
    showLabels: true,
  };

  // a navigation button + a dashboard filter card on a string dimension
  spec.dashboards[0].zones.push({
    id: nextId("z"),
    kind: "button",
    x: 40,
    y: 760,
    w: 160,
    h: 36,
    text: "Open report",
    bg: "#2563EB",
    fg: "#FFFFFF",
    align: 1,
  });
  spec.dashboards[0].zones.push({
    id: nextId("z"),
    kind: "filter",
    x: 220,
    y: 760,
    w: 220,
    h: 60,
    worksheet: spec.worksheets[0].name,
    field: "Category", // string dim from the generic field set
    bg: "#FFFFFF",
  });

  // highlight (tsc:brush) + filter (tsc:tsl-filter w/ link group) actions
  spec.includeActions = true;
  spec.actions.push({
    id: nextId("act"),
    name: "Highlight by band",
    kind: "highlight",
    sourceSheet: spec.worksheets[0].name,
    target: spec.worksheets[0].name,
    field: "Value Band",
    runOn: "select",
  });
  spec.actions.push({
    id: nextId("act"),
    name: "Filter by category",
    kind: "filter",
    sourceSheet: spec.worksheets[0].name,
    target: spec.dashboards[0].name,
    field: "Category",
    runOn: "select",
  });

  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  assert(xml.includes("<windows"), "missing <windows>");
  assert(xml.includes("<calculation class='tableau' formula='IF [Value]"), "calc field not emitted");
  assert(xml.includes("<map to='#2563eb'>"), "conditional color map not emitted");
  assert(xml.includes("&quot;High&quot;"), "color bucket not emitted");
  assert(xml.includes("mark-labels-show"), "labels not emitted");
  assert(/<rows>\[federated\.fig\]\.\[sum:Value:qk\] \[federated\.fig\]\.\[avg:Amount:qk\]<\/rows>/.test(xml), "two measures not on rows");
  // actions (confirmed patterns)
  assert(xml.includes("command='tsc:brush'"), "highlight action (tsc:brush) not emitted");
  assert(xml.includes("command='tsc:tsl-filter'"), "filter action (tsc:tsl-filter) not emitted");
  assert(xml.includes("user:auto-column='sheet_link'"), "filter-action link group not emitted");
  assert(xml.includes("field-captions"), "highlight field-captions not emitted");
  // dashboard filter card + the worksheet filter/slice it binds to
  assert(xml.includes("type-v2='filter'"), "filter card zone not emitted");
  assert(xml.includes("<filter class='categorical'"), "worksheet quick filter not emitted");
  assert(xml.includes("<slices>"), "slices not emitted");
  assert(res.worksheetCount === 1, "ws count");

  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());
  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "Feature_Test.twbx"), buf);
  writeFileSync(resolve(outDir, "Feature_Test.twb"), xml, "utf8");

  console.log("OK  spec features:", { worksheets: res.worksheetCount, zones: res.zoneCount, warnings: res.warnings.length });
  console.log("OK  .twb bytes:", xml.length, "  .twbx bytes:", buf.length);
  if (res.warnings.length) console.log("warnings:", res.warnings);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
