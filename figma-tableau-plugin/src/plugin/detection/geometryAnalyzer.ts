import type { Hint } from "./types";
import type { Rect } from "../../shared/types";

interface GeometryFeatures {
  aspectRatio: number;
  area: number;
  childCount: number;
  hasManySmallChildren: boolean;
  hasWideShape: boolean;
  hasTallShape: boolean;
  isSquareLike: boolean;
  hasHorizontalBars: boolean;
  hasVerticalBars: boolean;
  hasCircleLike: boolean;
  hasManyTextNodes: boolean;
  hasLargeNumber: boolean;
}

function extractFeatures(node: { type: string; rect: Rect; children?: { type: string; rect: Rect; name?: string }[]; text?: string }): GeometryFeatures {
  const { rect, children } = node;
  const aspectRatio = rect.h > 0 ? rect.w / rect.h : 1;
  const area = rect.w * rect.h;
  const childArr = children || [];
  const childCount = childArr.length;
  const smallThreshold = Math.min(rect.w, rect.h) * 0.15;
  const smallChildren = childArr.filter((c) => c.rect.w <= smallThreshold && c.rect.h <= smallThreshold);
  const wideChildren = childArr.filter((c) => c.rect.h > 0 && c.rect.w / c.rect.h > 3);
  const tallChildren = childArr.filter((c) => c.rect.w > 0 && c.rect.h / c.rect.w > 3);
  const squares = childArr.filter((c) => {
    const r = c.rect.w > 0 && c.rect.h > 0 ? Math.max(c.rect.w, c.rect.h) / Math.min(c.rect.w, c.rect.h) : 10;
    return r < 1.5;
  });
  const textNodes = childArr.filter((c) => c.type === "TEXT");

  return {
    aspectRatio,
    area,
    childCount,
    hasManySmallChildren: smallChildren.length > 3,
    hasWideShape: wideChildren.length > 0,
    hasTallShape: tallChildren.length > 0,
    isSquareLike: squares.length > 0 && squares.length > childCount * 0.5,
    hasHorizontalBars: wideChildren.length > 2,
    hasVerticalBars: tallChildren.length > 2,
    hasCircleLike: squares.length > childCount * 0.6,
    hasManyTextNodes: textNodes.length > 2,
    hasLargeNumber: !!node.text && /^[\d,.\-+%$£€¥]+$/.test(node.text.trim()),
  };
}

export function analyzeGeometry(node: { type: string; rect: Rect; children?: { type: string; rect: Rect; name?: string }[]; name?: string; text?: string }): Hint[] {
  const hints: Hint[] = [];
  const feat = extractFeatures(node);

  if (feat.childCount === 0 && feat.hasLargeNumber) {
    hints.push({ source: "geometry", type: "kpi-card", confidence: 0.7, reason: "Single node with a large numeric value" });
  }
  if (feat.hasHorizontalBars && feat.childCount > 2) {
    hints.push({ source: "geometry", type: "bar-chart", confidence: 0.6, reason: "Many wide child rectangles suggest horizontal bars" });
  }
  if (feat.hasVerticalBars && feat.childCount > 2) {
    hints.push({ source: "geometry", type: "bar-chart", confidence: 0.6, reason: "Many tall child rectangles suggest vertical bars" });
  }
  if (feat.isSquareLike && feat.childCount >= 3) {
    hints.push({ source: "geometry", type: "pie-chart", confidence: 0.4, reason: "Multiple square-like children could be pie slices or a legend" });
  }
  if (feat.hasWideShape && feat.childCount <= 2) {
    hints.push({ source: "geometry", type: "line-chart", confidence: 0.35, reason: "Wide aspect ratio with few children suggests a line chart" });
  }
  if (feat.childCount >= 4 && feat.hasManySmallChildren) {
    hints.push({ source: "geometry", type: "table", confidence: 0.5, reason: "Grid of small rectangles suggests a table layout" });
  }
  if (feat.hasManyTextNodes && feat.childCount > 3) {
    const labelHint: Hint = { source: "geometry", type: "worksheet", confidence: 0.3, reason: "Multiple text nodes suggest labeled chart axes" };
    hints.push(labelHint);
  }

  return hints;
}
