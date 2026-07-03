// LaDataViz-feature smoke: tiled containers and bitmap (image) zones.
// Writes test-out/LDS_Test.twb(x) and asserts the CONFIRMED Tableau 2026.2
// schemas are emitted. Well-formedness is checked separately by
// scripts/validate.py (python minidom).
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

// Geometric layout engine: a realistic 2D design (left sidebar + header + a row
// of 3 KPIs + two chart rows) must reconstruct a clean nested layout-flow tree
// — NOT fall back to floating — with KPI/header rows pinned (fixed-size) and
// chart areas flexible. This is the LaDataViz-grade structure.
function testGeometricLayout() {
  const el = (
    id: string,
    name: string,
    role: "worksheet" | "kpi" | "image" | "text",
    x: number,
    y: number,
    w: number,
    h: number,
    chartKind?: "bar" | "line" | "kpi"
  ): import("../src/shared/types").ParsedElement => ({
    id,
    name,
    figmaType: "FRAME",
    rect: { x, y, w, h },
    role,
    chartKind,
    imagePng: role === "image" ? PNG : undefined,
  });
  const model: DashboardModel = {
    title: "Overview",
    width: 1280,
    height: 900,
    elements: [
      el("side", "Sidebar", "image", 0, 0, 64, 900),
      el("t1", "Overview", "text", 90, 36, 300, 40),
      el("k1", "Tasks Completed", "kpi", 90, 130, 360, 70, "kpi"),
      el("k2", "Streak Length", "kpi", 470, 130, 360, 70, "kpi"),
      el("k3", "Habit Consistency", "kpi", 850, 130, 360, 70, "kpi"),
      el("c1", "Daily Task Completion", "worksheet", 90, 230, 560, 180, "bar"),
      el("c2", "Habit Consistency Trend", "worksheet", 690, 230, 540, 180, "line"),
      el("c3", "Habit Performance", "worksheet", 90, 440, 560, 220, "bar"),
      el("c4", "Tasks", "worksheet", 690, 440, 540, 220, "bar"),
    ],
    palette: [],
    fonts: [],
  };
  const s = seedSpecFromModel(model);
  assert(s.dashboards[0].layoutMode === "tiled", "2D design must tile, not float");
  const root = s.dashboards[0].root!;
  assert(!!root && root.direction === "horz", "top level splits sidebar | content (horz)");
  const xml = generateSpecWorkbook(s).twbXml;
  // Sidebar (width), header text + KPI row (heights) pinned; chart rows
  // flexible. The 3 EQUAL KPI leaves are NOT width-pinned — their even horz
  // row carries distribute-evenly instead (the reference pattern), so pins
  // there would only skew the strip.
  const pinned = (xml.match(/is-fixed='true'/g) || []).length;
  assert(pinned >= 3, "expected pinned header/kpi-row/sidebar zones, got " + pinned);
  const kpiZone = xml.match(/<zone[^>]*name='Tasks Completed'[^>]*>/)?.[0] ?? "";
  assert(kpiZone !== "" && !/fixed-size/.test(kpiZone), "equal KPI leaves unpinned (distribute-evenly sizes them)");
  assert((xml.match(/type-v2='layout-flow'/g) || []).length >= 4, "expected nested flow containers");
  assert((xml.match(/show-title='false'/g) || []).length === 7, "all 7 sheets hide titles");
  assert(xml.includes("friendly-name='Sidebar' fixed-size='64'"), "sidebar pinned to its width");
}

async function main() {
  testPrefixes();
  testSeedTiled();
  testGeometricLayout();

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
