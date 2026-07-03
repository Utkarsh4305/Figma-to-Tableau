// ---------------------------------------------------------------------------
// rasterization.ts — base64 encoding, image zone rasterization.
// ---------------------------------------------------------------------------

import type { FaithfulModel, FaithfulZone } from "../../shared/types";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bytesToBase64(bytes: Uint8Array): string {
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
    } catch (e) {
      console.warn("Image zone exportAsync failed:", e);
    }
  }
  model.zones = model.zones.filter((z) => z.kind !== "image" || z.imagePng);
}

/**
 * Build a FaithfulModel from a single background image rasterization of the
 * frame (no interactive zones, no text/rect/sheet/filter/button — just the
 * full frame rendered as a static PNG). Used by the standalone Image export
 * mode: the whole design is captured as one bitmap zone, producing a .twbx
 * that looks exactly like the Figma frame but has no live worksheets.
 */
export async function buildImageOnlyModel(node: SceneNode): Promise<FaithfulModel> {
  const w = Math.round(node.width);
  const h = Math.round(node.height);
  const frame = node as FrameNode | SceneNode;
  const name = ("name" in frame ? frame.name : "Dashboard") || "Dashboard";
  let imagePng: string | undefined;
  try {
    const exporter = node as (SceneNode & { exportAsync?: (s: unknown) => Promise<Uint8Array> });
    if (typeof exporter.exportAsync === "function") {
      const bytes = await exporter.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
      imagePng = bytesToBase64(bytes);
    }
  } catch (e) {
    console.warn("Image-only model rasterization failed:", e);
  }
  const zones: FaithfulZone[] = imagePng
    ? [{ id: node.id + "_img", name: "Background", kind: "image", x: 0, y: 0, w, h, imagePng, isBackground: true }]
    : [];
  return { id: node.id, title: name, width: w, height: h, zones };
}

/**
 * Rasterize the entire frame as a background PNG and insert it at position 0
 * (behind every other zone). This captures gradients, images, and complex fills
 * that can't be recreated as native Tableau zones, while the interactive zones
 * (sheets, filters, buttons, web objects) render on top as live Tableau objects.
 * The frame MUST be the same SceneNode already used to build the model.
 * Best-effort: if rasterization fails the model is left unchanged.
 */
export async function attachBackgroundImage(model: FaithfulModel, node: SceneNode): Promise<void> {
  try {
    const exporter = node as (SceneNode & { exportAsync?: (s: unknown) => Promise<Uint8Array> });
    if (typeof exporter.exportAsync !== "function") return;
    const bytes = await exporter.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
    const b64 = bytesToBase64(bytes);
    const w = model.width;
    const h = model.height;
    const bgZone: FaithfulZone = {
      id: node.id + "_bg",
      name: "Background",
      kind: "image",
      x: 0, y: 0, w, h,
      imagePng: b64,
      isBackground: true,
    };
    model.zones = [bgZone, ...model.zones];
  } catch (e) {
    console.warn("Background image export failed:", e);
  }
}
