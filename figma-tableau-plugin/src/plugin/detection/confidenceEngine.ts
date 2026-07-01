import type { Hint, DetectedComponentType } from "./types";
import type { ElementRole } from "../../shared/types";

const ROLE_MAP: Record<DetectedComponentType, ElementRole> = {
  "kpi-card": "kpi",
  "bar-chart": "worksheet",
  "line-chart": "worksheet",
  "pie-chart": "worksheet",
  "area-chart": "worksheet",
  "scatter-plot": "worksheet",
  "heatmap": "worksheet",
  "table": "worksheet",
  "filter": "filter",
  "header": "text",
  "sidebar": "container",
  "footer": "text",
  "navigation": "button",
  "container": "container",
  "text-label": "text",
  "image": "image",
  "legend": "ignore",
  "parameter": "filter",
  "web-object": "web",
  "worksheet": "worksheet",
  "unknown": "ignore",
};

const CHART_KIND_MAP: Record<string, string | undefined> = {
  "bar-chart": "bar",
  "line-chart": "line",
  "pie-chart": "pie",
  "area-chart": "area",
  "scatter-plot": "scatter",
  "heatmap": "heatmap",
  "table": "table",
  "kpi-card": "kpi",
};

interface CombinedScore {
  type: DetectedComponentType;
  totalWeight: number;
  reasons: string[];
}

export function combineHints(hints: Hint[]): { combinedType: DetectedComponentType; confidence: number; reasons: string[] } {
  if (hints.length === 0) {
    return { combinedType: "unknown", confidence: 0, reasons: ["No detection signals available"] };
  }

  const sourceWeights: Record<string, number> = {
    metadata: 0.95,
    naming: 0.8,
    layout: 0.6,
    geometry: 0.5,
    text: 0.45,
    position: 0.3,
  };

  const scores = new Map<DetectedComponentType, CombinedScore>();
  for (const h of hints) {
    const weight = sourceWeights[h.source] || 0.3;
    const existing = scores.get(h.type);
    if (existing) {
      existing.totalWeight += weight * h.confidence;
      existing.reasons.push(h.reason);
    } else {
      scores.set(h.type, { type: h.type, totalWeight: weight * h.confidence, reasons: [h.reason] });
    }
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1].totalWeight - a[1].totalWeight);
  const best = sorted[0][1];
  const maxPossible = Object.keys(sourceWeights).length;
  const clampedConfidence = Math.min(1, Math.max(0, best.totalWeight / maxPossible));

  return {
    combinedType: best.type,
    confidence: Math.round(clampedConfidence * 100) / 100,
    reasons: best.reasons.slice(0, 3),
  };
}

export function toElementRole(detectedType: DetectedComponentType): ElementRole {
  return ROLE_MAP[detectedType] || "ignore";
}

export function toChartKind(detectedType: DetectedComponentType): string | undefined {
  return CHART_KIND_MAP[detectedType];
}

export function toTableauType(detectedType: DetectedComponentType): string {
  switch (detectedType) {
    case "kpi-card": return "Text-mark worksheet (KPI)";
    case "bar-chart": return "Bar-mark worksheet";
    case "line-chart": return "Line-mark worksheet";
    case "pie-chart": return "Pie-mark worksheet";
    case "area-chart": return "Area-mark worksheet";
    case "scatter-plot": return "Circle-mark worksheet";
    case "heatmap": return "Square-mark worksheet";
    case "table": return "Text-table worksheet";
    case "filter": return "Dashboard quick-filter card";
    case "header": return "Text zone";
    case "sidebar": return "Layout-flow container";
    case "footer": return "Text zone";
    case "navigation": return "Navigation button worksheet";
    case "container": return "Layout-flow container";
    case "text-label": return "Text zone";
    case "image": return "Bitmap image zone";
    case "legend": return "Legend (auto-handled by Tableau)";
    case "parameter": return "Dashboard parameter control";
    case "web-object": return "Web page object";
    case "worksheet": return "Worksheet";
    default: return "Empty zone";
  }
}
