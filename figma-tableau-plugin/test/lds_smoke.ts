// LaDataViz-feature smoke: tiled containers, bitmap (image) zones, and a
// full-frame background image. Writes test-out/LDS_Test.twb(x) and asserts the
// CONFIRMED Tableau 2026.2 schemas are emitted. Well-formedness is checked
// separately by scripts/validate.py (python minidom).
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { nextId } from "../src/shared/spec";
import { blankSpec, seedSpecFromModel } from "../src/plugin/seed";
import { generateSpecWorkbook, buildSpecBlob } from "../src/plugin/exporter";
import { matchLayerPrefix } from "../src/shared/constants";
import type { DashboardModel } from "../src/shared/types";

// 1x1 transparent PNG
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// SHEET/ convention (parser logic) — the prefix matcher used in the sandbox.
function testPrefixes() {
  const a = matchLayerPrefix("SHEET/Sales by Region");
  assert(!!a && a.role === "worksheet" && a.clean === "Sales by Region", "SHEET/ prefix");
  const b = matchLayerPrefix("IMG/Logo");
  assert(!!b && b.role === "image" && b.clean === "Logo", "IMG/ prefix");
  assert(!matchLayerPrefix("Just a frame"), "non-prefixed name must not match");
}

// seed → tiled: a parsed model (prefix already stripped) with an Auto-Layout
// row of two worksheets must seed a tiled root container, and generate one.
function testSeedTiled() {
  const model: DashboardModel = {
    title: "Tiled Source",
    width: 1200,
    height: 700,
    elements: [
      { id: "a", name: "Revenue", figmaType: "FRAME", rect: { x: 40, y: 80, w: 540, h: 560 }, role: "worksheet", chartKind: "bar", explicit: true },
      { id: "b", name: "Trend", figmaType: "FRAME", rect: { x: 620, y: 80, w: 540, h: 560 }, role: "worksheet", chartKind: "line", explicit: true },
    ],
    tree: [
      {
        id: "row",
        name: "Body",
        figmaType: "FRAME",
        rect: { x: 40, y: 80, w: 1120, h: 560 },
        role: "container",
        autoLayout: "horz",
        children: [
          { id: "a", name: "Revenue", figmaType: "FRAME", rect: { x: 40, y: 80, w: 540, h: 560 }, role: "worksheet", chartKind: "bar" },
          { id: "b", name: "Trend", figmaType: "FRAME", rect: { x: 620, y: 80, w: 540, h: 560 }, role: "worksheet", chartKind: "line" },
        ],
      },
    ],
    palette: [],
    fonts: [],
  };
  const s = seedSpecFromModel(model);
  assert(s.worksheets.length === 2, "two worksheets seeded from SHEET-like elements");
  const root = s.dashboards[0].root;
  assert(!!root && root.children.length >= 1, "tiled root container built from tree");
  s.dashboards[0].layoutMode = "tiled";
  const xml = generateSpecWorkbook(s).twbXml;
  assert(xml.includes("param='horz' type-v2='layout-flow'"), "horizontal container emitted from Auto Layout");
}

async function main() {
  testPrefixes();
  testSeedTiled();

  const spec = blankSpec("LDS Test");
  const dash = spec.dashboards[0];

  // a logo image zone (bitmap)
  dash.zones.push({
    id: nextId("z"),
    kind: "image",
    x: 1100,
    y: 16,
    w: 140,
    h: 48,
    image: PNG,
    imageFile: "logo.png",
    scaled: true,
  });

  // a full-frame background image
  dash.backgroundImage = PNG;
  dash.backgroundImageFile = "LDS-Test-bg.png";

  // tiled layout: wrap every zone in a vertical root container
  dash.layoutMode = "tiled";
  dash.root = {
    id: nextId("c"),
    direction: "vert",
    children: dash.zones.map((z) => ({ zone: z.id })),
  };

  const res = generateSpecWorkbook(spec);
  const xml = res.twbXml;

  assert(xml.includes("type-v2='layout-flow'"), "no tiled layout-flow container");
  assert(xml.includes("param='vert'"), "container direction not emitted");
  assert(xml.includes("param='Image/logo.png' type-v2='bitmap'"), "logo bitmap zone not emitted");
  assert(xml.includes("param='Image/LDS-Test-bg.png' type-v2='bitmap'"), "background bitmap not emitted");
  assert(xml.includes("is-scaled='1'"), "bitmap scaling attr not emitted");
  assert(xml.includes("<windows"), "missing <windows>");

  // the .twbx must carry the image assets under Image/
  const blob = await buildSpecBlob(spec);
  const buf = Buffer.from(await blob.arrayBuffer());

  // verify the package actually contains the images (JSZip read-back)
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  assert(names.includes("Image/logo.png"), "logo.png not packaged: " + names.join(", "));
  assert(names.includes("Image/LDS-Test-bg.png"), "background not packaged: " + names.join(", "));

  const outDir = resolve(__dirname, "..", "test-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "LDS_Test.twb"), xml, "utf8");
  writeFileSync(resolve(outDir, "LDS_Test.twbx"), buf);

  console.log("OK  lds features:", {
    worksheets: res.worksheetCount,
    zones: res.zoneCount,
    warnings: res.warnings.length,
  });
  console.log("OK  .twb bytes:", xml.length, "  .twbx bytes:", buf.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
