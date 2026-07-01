import type { ElementRole, ChartKind, Rect } from "../../shared/types";

export type DetectedComponentType =
  | "kpi-card"
  | "bar-chart"
  | "line-chart"
  | "pie-chart"
  | "area-chart"
  | "scatter-plot"
  | "heatmap"
  | "table"
  | "filter"
  | "header"
  | "sidebar"
  | "footer"
  | "navigation"
  | "container"
  | "text-label"
  | "image"
  | "legend"
  | "parameter"
  | "web-object"
  | "worksheet"
  | "unknown";

export type DashboardRegion =
  | "header"
  | "kpi-strip"
  | "chart-area"
  | "table-area"
  | "sidebar"
  | "filter-panel"
  | "footer"
  | "unknown";

export interface DetectionResult {
  id: string;
  name: string;
  figmaType: string;
  rect: Rect;
  detectedType: DetectedComponentType;
  elementRole: ElementRole;
  chartKind?: ChartKind;
  confidence: number;
  reasons: string[];
  mappedTableauType: string;
  region: DashboardRegion;
  children?: DetectionResult[];
  metadata?: Record<string, string>;
}

export interface Hint {
  source: "metadata" | "naming" | "layout" | "geometry" | "text" | "position";
  type: DetectedComponentType;
  confidence: number;
  reason: string;
}

export interface AnalyzerResult {
  hints: Hint[];
  combinedType: DetectedComponentType;
  combinedRole: ElementRole;
  confidence: number;
  reasons: string[];
}

export interface DetectionPipelineOptions {
  preferMetadata: boolean;
  useNaming: boolean;
  useLayout: boolean;
  useGeometry: boolean;
  useText: boolean;
  usePosition: boolean;
}

export const DEFAULT_PIPELINE_OPTIONS: DetectionPipelineOptions = {
  preferMetadata: true,
  useNaming: true,
  useLayout: true,
  useGeometry: true,
  useText: true,
  usePosition: true,
};

export const DETECTION_VERSION = "1.0.0";

export const METADATA_KEYS = {
  componentType: "ftt-component-type",
  tableauType: "ftt-tableau-type",
  chartType: "ftt-chart-type",
  version: "ftt-version",
  settings: "ftt-settings",
} as const;

export interface ComponentMetadata {
  componentType: DetectedComponentType;
  tableauType: string;
  chartType?: ChartKind;
  version: string;
  settings?: string;
}
