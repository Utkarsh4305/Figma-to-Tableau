import type { Hint } from "./types";
import type { Rect } from "../../shared/types";

export function analyzeLayout(node: { type: string; name: string; rect: Rect; children?: { type: string; name: string; rect: Rect }[] }): Hint[] {
  const hints: Hint[] = [];
  const childArr = node.children || [];
  const namedChildren = childArr.filter((c) => /SHEET\/|KPI\/|NAV\/|BUTTON\/|FILTER\/|IMAGE\/|URL\//i.test(c.name));
  const textChildren = childArr.filter((c) => c.type === "TEXT");
  const rectChildren = childArr.filter((c) => c.type === "RECTANGLE" || c.type === "FRAME" || c.type === "INSTANCE");

  if (namedChildren.length > 0) {
    hints.push({ source: "layout", type: "container", confidence: 0.8, reason: `Contains ${namedChildren.length} prefixed component(s) — acts as a layout container` });
  }

  if (rectChildren.length > 3 && textChildren.length <= 2) {
    const uniform = rectChildren.every((c) => {
      const ratio1 = c.rect.w > 0 && c.rect.h > 0 ? c.rect.w / c.rect.h : 0;
      return ratio1 > 0.5 && ratio1 < 2.0;
    });
    if (uniform) {
      hints.push({ source: "layout", type: "kpi-card", confidence: 0.6, reason: "Uniform card-like children suggest KPI cards" });
    }
  }

  if (childArr.length >= 3) {
    const sorted = [...childArr].sort((a, b) => a.rect.y - b.rect.y);
    const rows = new Map<number, typeof childArr>();
    for (const c of sorted) {
      const key = Math.round(c.rect.y / 10);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push(c);
    }
    if (rows.size >= 3) {
      hints.push({ source: "layout", type: "container", confidence: 0.5, reason: `${rows.size} distinct rows of content suggests a multi-section dashboard layout` });
    }
  }

  if (textChildren.length >= 3) {
    const smallText = textChildren.filter((t) => t.rect.h < 30);
    const axisLabels = smallText.filter((t) => /sales|profit|revenue|cost|count|region|period|year|month|quarter|category/i.test(t.name));
    if (axisLabels.length >= 2) {
      hints.push({ source: "layout", type: "bar-chart", confidence: 0.45, reason: `Axis-like labels (${axisLabels.map((t) => t.name).join(", ")}) suggest a chart` });
    }
  }

  if (childArr.length === 1 && textChildren.length === 1 && rectChildren.length === 0) {
    hints.push({ source: "layout", type: "text-label", confidence: 0.6, reason: "Single text child with no shape children" });
  }

  return hints;
}
