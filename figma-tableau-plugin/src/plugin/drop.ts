// ---------------------------------------------------------------------------
// Drag-and-drop handler: font preloading, frame-container lookup, and drop
// event processing.
// ---------------------------------------------------------------------------

import { buildLibraryFrame, buildDefaultFrame } from "./builders";

/** Preloaded label font, so the drop handler can create text SYNCHRONOUSLY (a
 * drop callback shouldn't await — the gesture context can be lost). Populated at
 * startup by loadLabelFont(); until then drop-created frames just omit their
 * caption text (harmless — the layer NAME still carries the Tableau mapping). */
export let preloadedLabelFont: FontName | null = null;

/** Best-effort: load a usable font for the placeholder labels. */
export async function loadLabelFont(): Promise<FontName | null> {
  for (const f of [
    { family: "Inter", style: "Regular" },
    { family: "Roboto", style: "Regular" },
    { family: "Arial", style: "Regular" },
  ]) {
    try {
      await figma.loadFontAsync(f);
      preloadedLabelFont = f;
      return f;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Nearest frame-like ancestor of `node` (inclusive) we can appendChild into, so
 * a dropped component becomes a CHILD of the dashboard (and thus exports). */
export function frameLikeContainer(node: BaseNode | null): (BaseNode & ChildrenMixin) | null {
  const isFrameLike = (n: BaseNode) =>
    n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE" || n.type === "COMPONENT_SET";
  let p: BaseNode | null = node;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    if (isFrameLike(p) && "appendChild" in p) return p as BaseNode & ChildrenMixin;
    p = p.parent;
  }
  return null;
}

/**
 * Drag-and-drop from the plugin UI onto the canvas. The Library / Defaults cards
 * set a `text/plain` dataTransfer payload ({ ftDrop, source, id }); Figma fires
 * this `drop` event with that payload + the canvas position. We build the same
 * frame the click-insert would and drop it AT the cursor — inside the dashboard
 * frame under the cursor (so it exports) or free on the page otherwise.
 */
export function handleDrop(event: DropEvent): void {
  const item = event.items.find((i) => i.type === "text/plain");
  if (!item) return;
  let payload: { ftDrop?: boolean; source?: string; id?: string };
  try {
    payload = JSON.parse(item.data);
  } catch (e) {
    console.warn("Drop payload parse failed:", e);
    return;
  }
  if (!payload || !payload.ftDrop || !payload.id) return;

  const font = preloadedLabelFont;
  const f =
    payload.source === "library"
      ? buildLibraryFrame(payload.id, font)
      : buildDefaultFrame(payload.id, font);
  if (!f) return;

  const container = frameLikeContainer(event.node);
  if (container) {
    container.appendChild(f);
    const at = (container as unknown as { absoluteTransform: Transform }).absoluteTransform;
    f.x = Math.round(event.absoluteX - at[0][2]);
    f.y = Math.round(event.absoluteY - at[1][2]);
  } else {
    figma.currentPage.appendChild(f);
    f.x = Math.round(event.absoluteX);
    f.y = Math.round(event.absoluteY);
  }
  figma.currentPage.selection = [f];
  figma.notify(`Added ${f.name}`);
}
