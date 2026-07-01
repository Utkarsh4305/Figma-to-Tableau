import type { DashboardRegion } from "./types";
import type { Rect } from "../../shared/types";

export interface RegionAnalysis {
  region: DashboardRegion;
  reason: string;
}

export function detectRegion(rect: Rect, dashboardWidth: number, dashboardHeight: number, _index: number, _total: number): RegionAnalysis {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const topFifth = dashboardHeight * 0.2;
  const bottomFifth = dashboardHeight * 0.8;
  const leftSixth = dashboardWidth * 0.16;
  const rightEdge = dashboardWidth * 0.75;

  if (cy < topFifth) {
    if (rect.h < dashboardHeight * 0.15) {
      return { region: "header", reason: "Positioned in the top portion of the dashboard with shallow height" };
    }
    if (rect.w < dashboardWidth * 0.3) {
      return { region: "sidebar", reason: "Top-left position with narrow width suggests a sidebar" };
    }
    return { region: "kpi-strip", reason: "Upper area with content-height suggests KPI cards" };
  }

  if (cy > bottomFifth) {
    if (rect.h < dashboardHeight * 0.1) {
      return { region: "footer", reason: "Positioned at the bottom with shallow height" };
    }
    return { region: "footer", reason: "Bottom area of the dashboard" };
  }

  if (cx < leftSixth) {
    return { region: "sidebar", reason: "Left-side narrow position suggests a sidebar" };
  }

  if (cx > rightEdge && rect.w < dashboardWidth * 0.25) {
    return { region: "filter-panel", reason: "Right-side position suggests a filter panel" };
  }

  const aspectRatio = rect.h > 0 ? rect.w / rect.h : 1;
  if (aspectRatio > 1.3) {
    return { region: "chart-area", reason: "Wide aspect ratio in the central area suggests a chart" };
  }
  if (rect.h > rect.w * 1.2) {
    return { region: "table-area", reason: "Tall aspect ratio in the central area suggests a table" };
  }

  return { region: "chart-area", reason: "Default central region classification" };
}
