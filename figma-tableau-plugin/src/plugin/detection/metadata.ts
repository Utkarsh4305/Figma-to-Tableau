import type { ComponentMetadata, DetectedComponentType, DetectionResult } from "./types";
import { METADATA_KEYS, DETECTION_VERSION } from "./types";
import type { ChartKind } from "../../shared/types";

export function readMetadata(node: { getPluginData?: (key: string) => string }): ComponentMetadata | null {
  if (typeof node.getPluginData !== "function") return null;
  try {
    const raw = node.getPluginData(METADATA_KEYS.componentType);
    if (!raw) return null;
    const chartRaw = node.getPluginData(METADATA_KEYS.chartType);
    return {
      componentType: raw as DetectedComponentType,
      tableauType: node.getPluginData(METADATA_KEYS.tableauType) || "",
      chartType: (chartRaw || undefined) as ChartKind | undefined,
      version: node.getPluginData(METADATA_KEYS.version) || DETECTION_VERSION,
      settings: node.getPluginData(METADATA_KEYS.settings) || undefined,
    };
  } catch {
    return null;
  }
}

export function hasMetadata(node: { getPluginData?: (key: string) => string }): boolean {
  return readMetadata(node) !== null;
}

export function writeMetadata(
  node: { setPluginData?: (key: string, value: string) => void },
  result: DetectionResult
): void {
  if (typeof node.setPluginData !== "function") return;
  node.setPluginData(METADATA_KEYS.componentType, result.detectedType);
  node.setPluginData(METADATA_KEYS.tableauType, result.mappedTableauType);
  if (result.chartKind) node.setPluginData(METADATA_KEYS.chartType, result.chartKind);
  node.setPluginData(METADATA_KEYS.version, DETECTION_VERSION);
}

export function clearMetadata(node: { setPluginData?: (key: string, value: string) => void }): void {
  if (typeof node.setPluginData !== "function") return;
  for (const key of Object.values(METADATA_KEYS)) {
    node.setPluginData(key, "");
  }
}
