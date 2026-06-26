// Capture-layer smoke: exercises parseFaithful() (the Figma-sandbox transpiler)
// with a minimal `figma` mock, locking in the three fidelity fixes:
//   1. Figma px font sizes are converted to Tableau points (x0.75).
//   2. Fills keep alpha as 8-digit #RRGGBBAA (a low-opacity black stays faint,
//      not a solid black bar); gradients resolve to a representative color.
//   3. A too-short text box is grown so big titles aren't clipped.

function assert(c: boolean, m: string) {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

const MIXED = Symbol("figma.mixed");
// Minimal sandbox global before importing the module under test.
(globalThis as unknown as { figma: unknown }).figma = {
  mixed: MIXED,
  currentPage: { selection: [] as unknown[], children: [] as unknown[] },
};

const solid = (r: number, g: number, b: number, opacity = 1) => ({ type: "SOLID", visible: true, opacity, color: { r, g, b } });
const bbox = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

const title = {
  id: "t1", name: "title", type: "TEXT", visible: true,
  characters: "Overview", fontName: { family: "Inter", style: "Bold" }, fontSize: 50,
  textAlignHorizontal: "LEFT", fills: [solid(0.05, 0.05, 0.05)],
  absoluteBoundingBox: bbox(100, 60, 300, 20), // deliberately too short for a 50px font
  getStyledTextSegments: () => [{ characters: "Overview", fontSize: 50, fontName: { family: "Inter", style: "Bold" }, fills: [solid(0.05, 0.05, 0.05)] }],
};
const track = {
  id: "trk", name: "Frame", type: "RECTANGLE", visible: true,
  fills: [solid(0, 0, 0, 0.06)], // low-opacity black -> a faint track, NOT a black bar
  absoluteBoundingBox: bbox(100, 200, 320, 16), width: 320, height: 16, x: 100, y: 200,
};
const gradBar = {
  id: "grd", name: "fill", type: "RECTANGLE", visible: true,
  fills: [{ type: "GRADIENT_LINEAR", visible: true, opacity: 1, gradientStops: [
    { position: 0, color: { r: 0.5, g: 0.2, b: 0.9, a: 1 } },
    { position: 1, color: { r: 0.2, g: 0.4, b: 0.95, a: 1 } },
  ] }],
  absoluteBoundingBox: bbox(100, 200, 180, 16), width: 180, height: 16, x: 100, y: 200,
};
// A SemiBold KPI value: must render at normal weight (LaDataViz does not bold
// SemiBold/Medium — bolding widens the text and makes Tableau truncate it).
const kpiVal = {
  id: "v1", name: "data", type: "TEXT", visible: true,
  characters: "67/85", fontName: { family: "Roboto", style: "SemiBold" }, fontSize: 28,
  textAlignHorizontal: "LEFT", fills: [solid(0, 0, 0)],
  absoluteBoundingBox: bbox(100, 300, 100, 36),
  getStyledTextSegments: () => [{ characters: "67/85", fontSize: 28, fontName: { family: "Roboto", style: "SemiBold" }, fills: [solid(0, 0, 0)] }],
};
// A horizontal progress bar ROTATED 90deg in Figma: its AABB is tall+thin
// (8x200), which would render as a vertical sliver. We should lay it back down
// to its unrotated 200x8 horizontal shape.
const rotBar = {
  id: "rb", name: "Rectangle 4131", type: "RECTANGLE", visible: true, rotation: 90,
  fills: [solid(0.14, 0.45, 0.96)],
  absoluteBoundingBox: bbox(880, 1000, 8, 200), width: 200, height: 8, x: 880, y: 1000,
};
const frame = {
  id: "F", name: "Overview", type: "FRAME", visible: true,
  fills: [solid(1, 1, 1)], absoluteBoundingBox: bbox(0, 0, 1523, 1422),
  width: 1523, height: 1422, x: 0, y: 0,
  children: [title, track, gradBar, kpiVal, rotBar],
};
(globalThis as unknown as { figma: { currentPage: { selection: unknown[] } } }).figma.currentPage.selection = [frame];

async function main() {
  const { parseFaithful } = await import("../src/plugin/faithful");
  const model = parseFaithful();

  const t = model.zones.find((z) => z.name === "title")!;
  assert(!!t, "title zone captured");
  // 1. px->pt: 50px * 0.75 = 37.5pt (not 50)
  assert(Math.abs((t.fontSize ?? 0) - 37.5) < 0.01, "font px->pt converted (50->37.5), got " + t.fontSize);
  // 3. short box grown so glyph tops aren't clipped (>= ~37.5*1.5)
  assert((t.h ?? 0) >= 55, "short title box grown to fit line, got h=" + t.h);
  // width slack added so Tableau doesn't truncate (orig 300 + ~1 char)
  assert((t.w ?? 0) > 300, "width slack added to avoid ellipsis truncation, got w=" + t.w);
  assert(t.bold === true, "true Bold weight stays bold");

  // SemiBold KPI value must NOT be bold (else it widens and truncates)
  const v = model.zones.find((z) => z.name === "data")!;
  assert(!!v, "kpi value captured");
  assert(v.bold !== true, "SemiBold renders at normal weight (not bold)");

  const trk = model.zones.find((z) => z.name === "Frame")!;
  assert(!!trk && trk.kind === "rect", "track rect captured");
  // 2. 8-digit fill with low alpha, NOT solid black
  assert(/^#000000[0-9A-F]{2}$/.test(trk.fill || ""), "track fill is 8-digit black w/ alpha, got " + trk.fill);
  assert(trk.fill !== "#000000FF" && trk.fill !== "#000000", "track is NOT fully-opaque black, got " + trk.fill);

  // rotated bar laid back down to horizontal (w > h), not a vertical sliver
  const rb = model.zones.find((z) => z.name === "Rectangle 4131")!;
  assert(!!rb, "rotated bar captured");
  assert((rb.w ?? 0) > (rb.h ?? 0), "90deg-rotated bar rendered horizontal, got " + rb.w + "x" + rb.h);
  assert(Math.abs((rb.w ?? 0) - 200) < 2 && Math.abs((rb.h ?? 0) - 8) < 2, "uses unrotated 200x8 dims");

  const grd = model.zones.find((z) => z.name === "fill")!;
  assert(!!grd, "gradient bar captured (not skipped)");
  assert(/^#[0-9A-F]{8}$/.test(grd.fill || ""), "gradient -> 8-digit color, got " + grd.fill);
  assert(!/^#000000/.test(grd.fill || ""), "gradient resolves to its real color, not black, got " + grd.fill);

  console.log("OK  faithful capture:", { titlePt: t.fontSize, titleH: t.h, track: trk.fill, grad: grd.fill });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
