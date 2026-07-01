import type { Hint } from "./types";

const CURRENCY_PAT = /^[\$\€\£\¥]\s*[\d,]+(\.\d+)?/;
const PERCENT_PAT = /^[\d,]+(\.\d+)?\s*%|^[\d,]+(\.\d+)?\s*percent/i;
const LARGE_NUM_PAT = /^[\d,]+(\.\d+)?[kKmMbBtT]?$/;
const DATE_PAT = /^\d{1,4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,4}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const TITLE_PAT = /^(total|sum|average|trend|overview|summary|performance|dashboard|report)/i;
const AXIS_LABEL_PAT = /^(sales|profit|revenue|cost|quantity|count|amount|rate|ratio|value|volume)/i;
const FILTER_NAME_PAT = /^(filter|select|choose|pick|all|region|category|segment|date|period|year|month|quarter)/i;

export interface TextFeatures {
  hasCurrency: boolean;
  hasPercent: boolean;
  hasLargeNumber: boolean;
  hasDate: boolean;
  isTitle: boolean;
  isAxisLabel: boolean;
  isFilterName: boolean;
  text: string;
}

export function analyzeText(text: string, nodeName: string): TextFeatures {
  const t = text.trim();
  return {
    hasCurrency: CURRENCY_PAT.test(t),
    hasPercent: PERCENT_PAT.test(t),
    hasLargeNumber: LARGE_NUM_PAT.test(t),
    hasDate: DATE_PAT.test(t) || DATE_PAT.test(nodeName),
    isTitle: TITLE_PAT.test(t) || TITLE_PAT.test(nodeName),
    isAxisLabel: AXIS_LABEL_PAT.test(t) || AXIS_LABEL_PAT.test(nodeName),
    isFilterName: FILTER_NAME_PAT.test(t) || FILTER_NAME_PAT.test(nodeName),
    text: t,
  };
}

export function getTextHints(text: string, nodeName: string): Hint[] {
  const hints: Hint[] = [];
  const feat = analyzeText(text, nodeName);

  if (feat.hasCurrency || feat.hasPercent || feat.hasLargeNumber) {
    hints.push({ source: "text", type: "kpi-card", confidence: 0.65, reason: `Text matches a metric pattern: ${feat.hasCurrency ? "currency" : feat.hasPercent ? "percentage" : "large number"}` });
  }
  if (feat.isTitle) {
    hints.push({ source: "text", type: "text-label", confidence: 0.7, reason: "Text matches a title/heading pattern" });
  }
  if (feat.isAxisLabel) {
    hints.push({ source: "text", type: "worksheet", confidence: 0.4, reason: "Text matches an axis-label pattern" });
  }
  if (feat.isFilterName) {
    hints.push({ source: "text", type: "filter", confidence: 0.5, reason: "Text matches a filter-name pattern" });
  }
  if (feat.hasDate) {
    hints.push({ source: "text", type: "worksheet", confidence: 0.35, reason: "Contains date-like text, likely a time-series chart" });
  }

  return hints;
}
