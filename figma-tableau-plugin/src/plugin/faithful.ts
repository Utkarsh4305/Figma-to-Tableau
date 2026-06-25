// ---------------------------------------------------------------------------
// faithful.ts — runs INSIDE the Figma sandbox. A FAITHFUL transpiler: instead
// of classifying charts and binding them to sample data, it recreates the whole
// Figma frame as native Tableau dashboard zones (the LaDataViz approach):
//   - TEXT layers          -> text zones (real content, font, color)
//   - shapes / cards / bars -> colored `empty` zones (rect)
//   - icons / vectors / images -> bitmap zones (rasterized PNG)
// The output LOOKS like the design; it carries no live data.
// ---------------------------------------------------------------------------

import type { FaithfulModel, FaithfulZone, Rect } from "../shared/types";

function toHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

function firstSolidFill(node: SceneNode): { hex: string; a: number } | undefined {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return undefined;
  const s = fills.find((f) => f.type === "SOLID" && f.visible !== false) as SolidPaint | undefined;
  if (!s) return undefined;
  return { hex: toHex(s.color), a: s.opacity ?? 1 };
}

function firstSolidStroke(node: SceneNode): { hex: string; w: number } | undefined {
  const strokes = (node as GeometryMixin).strokes;
  if (!strokes || !Array.isArray(strokes)) return undefined;
  const s = strokes.find((x) => x.type === "SOLID" && x.visible !== false) as SolidPaint | undefined;
  if (!s) return undefined;
  const w = (node as GeometryMixin).strokeWeight;
  return { hex: toHex(s.color), w: typeof w === "number" ? w : 1 };
}

function hasImageFill(node: SceneNode): boolean {
  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return false;
  return fills.some((f) => f.type === "IMAGE" && f.visible !== false);
}

// Vector-ish nodes we rasterize to a bitmap (Tableau can't draw the paths).
const VECTORISH = ["VECTOR", "LINE", "STAR", "POLYGON", "ELLIPSE", "BOOLEAN_OPERATION"];
const FILLABLE = ["RECTANGLE", "FRAME", "COMPONENT", "INSTANCE"];

function rectOf(node: SceneNode, origin: { x: number; y: number }): Rect {
  const bb = (node as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox;
  if (bb) return { x: bb.x - origin.x, y: bb.y - origin.y, w: bb.w ?? node.width, h: bb.h ?? node.height };
  return { x: node.x - origin.x, y: node.y - origin.y, w: node.width, h: node.height };
}

const MAX_ZONES = 1500;

function alignOf(node: TextNode): number {
  switch (node.textAlignHorizontal) {
    case "CENTER":
      return 1;
    case "RIGHT":
      return 2;
    default:
      return 0;
  }
}

/**
 * Walk every visible node back-to-front (parent emitted before its children, so
 * children draw on top — matching Figma z-order). Pushes a FaithfulZone for any
 * node that has its own visual (text / fill / image / vector).
 */
function walk(node: SceneNode, origin: { x: number; y: number }, zones: FaithfulZone[]): void {
  if (zones.length >= MAX_ZONES) return;
  if (node.visible === false) return;
  const opacity = (node as SceneNode & { opacity?: number }).opacity;
  if (typeof opacity === "number" && opacity < 0.02) return;

  const rect = rectOf(node, origin);
  // Skip nodes with no resolvable geometry (would emit a "NaN" attr otherwise).
  if (![rect.x, rect.y, rect.w, rect.h].every((n) => Number.isFinite(n))) return;
  if (rect.w <= 0 || rect.h <= 0) return;
  const t = node.type;

  if (t === "TEXT") {
    const tn = node as TextNode;
    const chars = typeof tn.characters === "string" ? tn.characters : "";
    if (chars.trim()) {
      const fill = firstSolidFill(node);
      const fam = tn.fontName !== figma.mixed ? (tn.fontName as FontName).family : undefined;
      const style = tn.fontName !== figma.mixed ? (tn.fontName as FontName).style : "";
      zones.push({
        id: node.id,
        name: node.name || "Text",
        kind: "text",
        ...rect,
        text: chars,
        fontSize: tn.fontSize !== figma.mixed ? (tn.fontSize as number) : 14,
        fontFamily: fam,
        fontColor: fill?.hex || "#101828",
        bold: /bold|semibold|black|heavy|medium/i.test(style),
        align: alignOf(tn),
      });
    }
    return; // text has no children we care about
  }

  // Opaque visuals we rasterize (icons, logos, photos, line/curve charts).
  if (hasImageFill(node) || VECTORISH.indexOf(t) !== -1) {
    zones.push({ id: node.id, name: node.name || "Image", kind: "image", ...rect });
    return; // treat as a single bitmap; don't descend into path internals
  }

  // A shape/card/bar with a solid fill becomes a colored `empty` zone.
  const fill = firstSolidFill(node);
  const stroke = firstSolidStroke(node);
  if ((fill && fill.a > 0.01) || stroke) {
    if (FILLABLE.indexOf(t) !== -1) {
      const cr = (node as SceneNode & { cornerRadius?: number | symbol }).cornerRadius;
      zones.push({
        id: node.id,
        name: node.name || "Rectangle",
        kind: "rect",
        ...rect,
        fill: fill && fill.a > 0.01 ? fill.hex : undefined,
        cornerRadius: typeof cr === "number" ? cr : undefined,
        strokeColor: stroke?.hex,
        strokeWidth: stroke?.w,
      });
    }
  }

  // Recurse so inner text / bars / icons are captured and drawn on top.
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) walk(c as SceneNode, origin, zones);
  }
}

function isFrameLike(n: BaseNode): boolean {
  return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "COMPONENT_SET" || n.type === "INSTANCE";
}

function findFrame(): SceneNode | undefined {
  const sel = figma.currentPage.selection[0];
  if (sel) {
    if (isFrameLike(sel)) return sel;
    let p: BaseNode | null = sel.parent;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      if (isFrameLike(p)) return p as SceneNode;
      p = p.parent;
    }
    if ("children" in sel) return sel;
  }
  return figma.currentPage.children.find((n) => n.type === "FRAME" || n.type === "COMPONENT") as
    | SceneNode
    | undefined;
}

export function parseFaithful(): FaithfulModel {
  const frame = findFrame();
  if (!frame) throw new Error("Select a frame (or have at least one frame on the page) to convert.");
  const bb =
    (frame as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox ?? {
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
    };
  const origin = { x: bb.x, y: bb.y };
  const zones: FaithfulZone[] = [];

  // The frame's own background first (so it sits behind everything).
  const bg = firstSolidFill(frame);
  if (bg && bg.a > 0.01) {
    zones.push({ id: frame.id + ":bg", name: frame.name || "Background", kind: "rect", x: 0, y: 0, w: bb.w, h: bb.h, fill: bg.hex });
  }
  if ("children" in frame) {
    for (const c of (frame as ChildrenMixin).children) walk(c as SceneNode, origin, zones);
  }

  return {
    id: frame.id,
    title: frame.name || "Dashboard",
    width: bb.w || frame.width,
    height: bb.h || frame.height,
    background: bg?.hex,
    zones,
  };
}

// --- image rasterization (sandbox) ------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

/** Rasterize every image-kind zone to a base64 PNG. Failures are skipped. */
export async function attachFaithfulImages(model: FaithfulModel): Promise<void> {
  for (const z of model.zones) {
    if (z.kind !== "image" || z.imagePng) continue;
    try {
      const node = (await figma.getNodeByIdAsync(z.id)) as SceneNode | null;
      const exporter = node as (SceneNode & { exportAsync?: (s: unknown) => Promise<Uint8Array> }) | null;
      if (exporter && typeof exporter.exportAsync === "function") {
        const bytes = await exporter.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
        z.imagePng = bytesToBase64(bytes);
      }
    } catch {
      /* leave imagePng undefined — that zone just won't render */
    }
  }
  // Drop image zones that couldn't be rasterized (no empty bitmaps).
  model.zones = model.zones.filter((z) => z.kind !== "image" || z.imagePng);
}
