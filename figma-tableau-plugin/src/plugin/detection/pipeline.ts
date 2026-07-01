import type {
  DetectionResult,
  DetectionPipelineOptions,
  Hint,
} from "./types";
import { DEFAULT_PIPELINE_OPTIONS } from "./types";
import { analyzeGeometry } from "./geometryAnalyzer";
import { analyzeLayout } from "./layoutAnalyzer";
import { getTextHints } from "./textAnalyzer";
import { detectRegion } from "./regionDetector";
import { combineHints, toElementRole, toChartKind, toTableauType } from "./confidenceEngine";
import { readMetadata } from "./metadata";
import type { Rect, DashboardModel } from "../../shared/types";

export interface DetectionNode {
  id: string;
  name: string;
  type: string;
  rect: Rect;
  text?: string;
  children?: DetectionNode[];
  figmaNode?: { getPluginData?: (k: string) => string; setPluginData?: (k: string, v: string) => void };
}

function nodeToDetection(node: DetectionNode, dashboardWidth: number, dashboardHeight: number, index: number, total: number, opts: DetectionPipelineOptions): DetectionResult {
  const hints: Hint[] = [];

  // 1. Plugin Metadata (highest priority)
  if (opts.preferMetadata && node.figmaNode) {
    const meta = readMetadata(node.figmaNode);
    if (meta) {
      hints.push({ source: "metadata", type: meta.componentType, confidence: 0.95, reason: `Plugin metadata: ${meta.componentType}` });
    }
  }

  // 2. Naming Convention
  if (opts.useNaming) {
    const nameHints = analyzeNaming(node.name);
    hints.push(...nameHints);
  }

  // 3. Layout Analysis
  if (opts.useLayout) {
    const layoutHints = analyzeLayout(node);
    hints.push(...layoutHints);
  }

  // 4. Geometry Analysis
  if (opts.useGeometry) {
    const geoHints = analyzeGeometry(node);
    hints.push(...geoHints);
  }

  // 5. Text Analysis
  if (opts.useText && node.text) {
    const textHints = getTextHints(node.text, node.name);
    hints.push(...textHints);
  }

  // 6. Position Analysis
  if (opts.usePosition) {
    const regionInfo = detectRegion(node.rect, dashboardWidth, dashboardHeight, index, total);
    const regionHints: Hint[] = [];
    switch (regionInfo.region) {
      case "header": regionHints.push({ source: "position", type: "header", confidence: 0.5, reason: regionInfo.reason }); break;
      case "kpi-strip": regionHints.push({ source: "position", type: "kpi-card", confidence: 0.4, reason: regionInfo.reason }); break;
      case "chart-area": regionHints.push({ source: "position", type: "worksheet", confidence: 0.3, reason: regionInfo.reason }); break;
      case "table-area": regionHints.push({ source: "position", type: "table", confidence: 0.3, reason: regionInfo.reason }); break;
      case "sidebar": regionHints.push({ source: "position", type: "sidebar", confidence: 0.5, reason: regionInfo.reason }); break;
      case "filter-panel": regionHints.push({ source: "position", type: "filter", confidence: 0.4, reason: regionInfo.reason }); break;
      case "footer": regionHints.push({ source: "position", type: "footer", confidence: 0.5, reason: regionInfo.reason }); break;
    }
    hints.push(...regionHints);
  }

  const { combinedType, confidence, reasons } = combineHints(hints);
  const regionInfo = detectRegion(node.rect, dashboardWidth, dashboardHeight, index, total);

  return {
    id: node.id,
    name: node.name,
    figmaType: node.type,
    rect: node.rect,
    detectedType: combinedType,
    elementRole: toElementRole(combinedType),
    chartKind: toChartKind(combinedType) as any,
    confidence,
    reasons,
    mappedTableauType: toTableauType(combinedType),
    region: regionInfo.region,
    children: node.children?.map((c, i) =>
      nodeToDetection(c, dashboardWidth, dashboardHeight, i, node.children!.length, opts)
    ),
  };
}

function analyzeNaming(name: string): Hint[] {
  const hints: Hint[] = [];

  const patterns: [RegExp, string, number, string][] = [
    [/^\s*sheet\s*\//i, "worksheet", 0.9, "Explicit SHEET/ prefix"],
    [/^\s*kpi\s*\//i, "kpi-card", 0.9, "Explicit KPI/ prefix"],
    [/^\s*(?:nav|button)\s*\//i, "navigation", 0.9, "Explicit navigation prefix"],
    [/^\s*filter\s*\//i, "filter", 0.9, "Explicit FILTER/ prefix"],
    [/^\s*(?:image|img|logo)\s*\//i, "image", 0.9, "Explicit IMAGE/ prefix"],
    [/^\s*(?:url|web)\s*\//i, "web-object", 0.9, "Explicit URL/ prefix"],
    [/^\s*text\s*\//i, "text-label", 0.9, "Explicit TEXT/ prefix"],
    [/^\s*(?:container|group)\s*\//i, "container", 0.9, "Explicit container prefix"],
  ];

  for (const [re, type, conf, reason] of patterns) {
    if (re.test(name)) {
      hints.push({ source: "naming", type: type as any, confidence: conf, reason });
      return hints;
    }
  }

  const keywordPatterns: [RegExp, string, number, string][] = [
    [/\b(kpi|metric|scorecard)\b/i, "kpi-card", 0.55, "Layer name contains KPI-related keyword"],
    [/\b(chart|graph|plot|trend)\b/i, "worksheet", 0.5, "Layer name contains chart-related keyword"],
    [/\b(bar|column)\b/i, "bar-chart", 0.55, "Layer name suggests a bar chart"],
    [/\b(line|trend|spark)\b/i, "line-chart", 0.55, "Layer name suggests a line chart"],
    [/\b(pie|donut)\b/i, "pie-chart", 0.55, "Layer name suggests a pie chart"],
    [/\b(table|grid|data|list)\b/i, "table", 0.55, "Layer name suggests a table"],
    [/\b(filter|dropdown|selector)\b/i, "filter", 0.55, "Layer name suggests a filter"],
    [/\b(header|title|heading)\b/i, "header", 0.55, "Layer name suggests a header"],
    [/\b(sidebar|nav|menu)\b/i, "sidebar", 0.55, "Layer name suggests a sidebar"],
    [/\b(logo|icon|image)\b/i, "image", 0.55, "Layer name suggests an image"],
    [/\b(footer|bottom)\b/i, "footer", 0.55, "Layer name suggests a footer"],
  ];

  for (const [re, type, conf, reason] of keywordPatterns) {
    if (re.test(name)) {
      hints.push({ source: "naming", type: type as any, confidence: conf, reason });
      break;
    }
  }

  return hints;
}

export function analyzeDashboard(
  model: DashboardModel,
  opts: Partial<DetectionPipelineOptions> = {}
): DetectionResult[] {
  const options = { ...DEFAULT_PIPELINE_OPTIONS, ...opts };
  const dw = model.width || 1280;
  const dh = model.height || 800;
  const elements = model.elements || [];

  return elements
    .filter((e) => e.role !== "ignore")
    .map((e, i) => {
      const detectionNode: DetectionNode = {
        id: e.id,
        name: e.name,
        type: e.figmaType,
        rect: e.rect,
        text: e.text,
        children: e.children?.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.figmaType,
          rect: c.rect,
          text: c.text,
        })),
      };
      return nodeToDetection(detectionNode, dw, dh, i, elements.length, options);
    });
}

export function analyzeNode(
  node: DetectionNode,
  dashboardWidth: number,
  dashboardHeight: number,
  index: number,
  total: number,
  opts: Partial<DetectionPipelineOptions> = {}
): DetectionResult {
  return nodeToDetection(node, dashboardWidth, dashboardHeight, index, total, { ...DEFAULT_PIPELINE_OPTIONS, ...opts });
}

export { writeMetadata, hasMetadata, clearMetadata, readMetadata } from "./metadata";
