// ---------------------------------------------------------------------------
// layoutTree.ts — geometric layout engine (recursive guillotine partitioning)
// ---------------------------------------------------------------------------

import type { LayoutNode, ContainerSpec, ZoneSpec } from "../shared/spec";
import { nextId, isContainer } from "../shared/spec";

export interface LRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const GUTTER_TOL = 8;

export function bands(items: LRect[], axis: "x" | "y"): LRect[][] {
  const start = (i: LRect) => (axis === "x" ? i.x : i.y);
  const end = (i: LRect) => (axis === "x" ? i.x + i.w : i.y + i.h);
  const sorted = [...items].sort((a, b) => start(a) - start(b));
  const groups: LRect[][] = [];
  let cur: LRect[] = [sorted[0]];
  let curEnd = end(sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    if (start(it) >= curEnd - GUTTER_TOL) {
      groups.push(cur);
      cur = [it];
      curEnd = end(it);
    } else {
      cur.push(it);
      curEnd = Math.max(curEnd, end(it));
    }
  }
  groups.push(cur);
  return groups;
}

export function partition(items: LRect[]): LayoutNode {
  if (items.length === 1) return { zone: items[0].id };
  const cols = bands(items, "x");
  const rows = bands(items, "y");

  let dir: "horz" | "vert" | null = null;
  if (cols.length > 1 && cols.length >= rows.length) dir = "horz";
  else if (rows.length > 1) dir = "vert";
  else if (cols.length > 1) dir = "horz";

  if (!dir) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    return { id: nextId("c"), direction: "vert", children: sorted.map((i) => ({ zone: i.id })) };
  }
  const groups = dir === "horz" ? cols : rows;
  return { id: nextId("c"), direction: dir, children: groups.map(partition) };
}

export function inferLayoutTree(zones: ZoneSpec[]): ContainerSpec | undefined {
  const items: LRect[] = zones.map((z) => ({ id: z.id, x: z.x, y: z.y, w: z.w, h: z.h }));
  if (!items.length) return undefined;
  if (items.length === 1) {
    return { id: nextId("c"), direction: "vert", children: [{ zone: items[0].id }], name: "Body" };
  }
  const node = partition(items);
  if (!isContainer(node)) return { id: nextId("c"), direction: "vert", children: [node], name: "Body" };
  node.name = "Body";
  return node;
}
