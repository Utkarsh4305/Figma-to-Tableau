// ---------------------------------------------------------------------------
// Click-to-insert handlers for library components and default starter frames.
// ---------------------------------------------------------------------------

import { findDashboardFrame, buildLibraryFrame, buildDefaultFrame, LIBRARY_COMPONENTS } from "./builders";
import { loadLabelFont } from "./drop";

export async function insertLibraryComponent(componentId: string): Promise<void> {
  const frame = findDashboardFrame();
  const parent: BaseNode & ChildrenMixin =
    frame && frame.parent && "appendChild" in frame.parent
      ? (frame.parent as BaseNode & ChildrenMixin)
      : figma.currentPage;
  const originX = frame ? frame.x + frame.width + 80 : 0;
  const originY = frame ? frame.y : 0;
  const font = await loadLabelFont();

  const t = LIBRARY_COMPONENTS[componentId];
  if (!t) return;
  const f = buildLibraryFrame(componentId, font);
  if (!f) return;

  const slot = Object.keys(LIBRARY_COMPONENTS).indexOf(componentId);
  f.x = originX + (slot % 3) * (t.w + 24);
  f.y = originY + Math.floor(slot / 3) * (t.h + 24);
  parent.appendChild(f);
  figma.currentPage.selection = [f];
  figma.viewport.scrollAndZoomIntoView([f]);
  figma.notify(`Inserted ${t.name} beside your dashboard`);
}

export async function insertDefault(kind: string): Promise<void> {
  const frame = findDashboardFrame();
  const parent: BaseNode & ChildrenMixin =
    frame && frame.parent && "appendChild" in frame.parent
      ? (frame.parent as BaseNode & ChildrenMixin)
      : figma.currentPage;
  const originX = frame ? frame.x + frame.width + 80 : 0;
  const originY = frame ? frame.y : 0;
  const font = await loadLabelFont();

  const f = buildDefaultFrame(kind, font);
  if (!f) return;
  f.x = originX;
  f.y = originY;
  parent.appendChild(f);
  figma.currentPage.selection = [f];
  figma.viewport.scrollAndZoomIntoView([f]);
  const hint = kind === "nav" ? " — now wire a prototype “Navigate to” link from it in Figma." : "";
  figma.notify(`Inserted ${f.name} beside your dashboard — drag it onto your design${hint}`);
}
