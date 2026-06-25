// ---------------------------------------------------------------------------
// mapper.ts — the configurable Figma -> Tableau mapping engine (UI side).
// Consumes a DashboardModel + the user's mapping overrides + export settings
// and produces an intermediate TableauModel that tableauGenerator turns into
// XML. All Figma px coordinates are normalized into Tableau's 0..100000 zone
// space here, so the generator stays purely structural.
// ---------------------------------------------------------------------------

import type {
  DashboardModel,
  ParsedElement,
  ExportSettings,
  FieldType,
  ChartKind,
  MappingRow,
} from "../shared/types";
import { DOMAIN_KEYWORDS, DOMAIN_FIELDS } from "../shared/constants";

export interface TField {
  name: string;
  type: FieldType;
}

export interface TWorksheet {
  name: string;
  kind: "bar" | "line"; // the two load-safe mark classes
  dim: string;
  dimType: FieldType;
  meas: string;
}

export interface TRun {
  text: string;
  bold?: boolean;
  size?: number;
  color?: string;
  font?: string;
  align?: number; // 0 left, 1 center, 2 right
  break?: boolean; // append a Tableau line break (&#10;) after this run
}

export interface TextZone {
  kind: "text";
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  runs: TRun[];
  bg?: string;
  bc: string;
  bs: string; // border-style: none|solid
  bw: string; // border-width
  padding: string;
}

export interface SheetZone {
  kind: "sheet";
  id: number;
  name: string; // must equal a worksheet name
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  bc: string;
}

export type Zone = TextZone | SheetZone;

export interface TableauModel {
  workbookName: string;
  dashboardName: string;
  dsName: string;
  dsCaption: string;
  connName: string;
  csvFile: string;
  fields: TField[];
  csvText: string;
  worksheets: TWorksheet[];
  dashboard: {
    name: string;
    widthPx: number;
    heightPx: number;
    bg: string;
    bc: string;
    zones: Zone[];
  };
}

const INK = "#101828";
const DEFAULT_FONT = "Segoe UI";

function detectDomain(model: DashboardModel): string {
  const hay = (model.title + " " + model.elements.map((e) => e.name).join(" ")).toLowerCase();
  for (const { domain, words } of DOMAIN_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return domain;
  }
  return "generic";
}

function clamp(v: number, lo = 0, hi = 100000): number {
  return Math.round(Math.max(lo, Math.min(hi, v)));
}

/** Normalize a Figma px rect into Tableau 0..100000 zone space. */
function norm(
  rect: { x: number; y: number; w: number; h: number },
  fw: number,
  fh: number
) {
  return {
    x: clamp((rect.x / fw) * 100000),
    y: clamp((rect.y / fh) * 100000),
    w: clamp((rect.w / fw) * 100000, 1),
    h: clamp((rect.h / fh) * 100000, 1),
  };
}

function sanitizeName(name: string): string {
  return (name || "Sheet").replace(/\s+/g, " ").trim().slice(0, 60) || "Sheet";
}

function pickFont(model: DashboardModel): string {
  return model.fonts[0] || DEFAULT_FONT;
}

/** Build a small deterministic sample CSV for the chosen fields. */
function makeCsv(fields: TField[]): string {
  const cats = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
  const segs = ["North", "South", "East", "West"];
  const header = fields.map((f) => f.name).join(",");
  const lines = [header];
  let v = 30;
  for (let i = 0; i < cats.length; i++) {
    v = ((v * 7 + 13) % 90) + 20;
    const cells = fields.map((f, idx) => {
      if (f.type === "string") return idx === 0 ? cats[i] : segs[i % segs.length];
      if (f.type === "date") return `2026-0${(i % 9) + 1}-01`;
      return String(((v * (idx + 2)) % 120) + 15);
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Reduce any detected chart kind to one of the two load-safe Tableau mark
 * classes. Specialty visuals (pie/area/scatter/heatmap/table) become bar or
 * line stand-ins to swap inside Tableau — exactly the project's documented
 * approach for wireframes.
 */
function safeKind(kind: ChartKind | undefined): "bar" | "line" {
  return kind === "line" || kind === "area" ? "line" : "bar";
}

/** Apply user mapping overrides onto the parsed elements. */
function applyOverrides(elements: ParsedElement[], overrides: MappingRow[]): ParsedElement[] {
  const byId = new Map(overrides.map((o) => [o.elementId, o]));
  return elements.map((e) => {
    const o = byId.get(e.id);
    if (!o) return e;
    return { ...e, role: o.role, chartKind: o.chartKind ?? e.chartKind };
  });
}

/** Produce the default mapping rows the UI shows (before user edits). */
export function defaultMappingRows(model: DashboardModel): MappingRow[] {
  return model.elements.map((e) => ({
    elementId: e.id,
    elementName: e.name,
    figmaType: e.figmaType,
    role: e.role,
    chartKind: e.chartKind,
  }));
}

export function buildTableauModel(
  model: DashboardModel,
  settings: ExportSettings,
  overrides: MappingRow[] = []
): TableauModel {
  const elements = applyOverrides(model.elements, overrides);
  const domain = detectDomain(model);
  const fieldDef = DOMAIN_FIELDS[domain] ?? DOMAIN_FIELDS.generic;
  const dims = fieldDef.dims;
  const meas = fieldDef.meas;
  const fields: TField[] = [...dims, ...meas].map(([name, type]) => ({ name, type }));
  const font = pickFont(model);

  const fw = settings.layoutWidth || model.width;
  const fh = settings.layoutHeight || model.height;

  const worksheets: TWorksheet[] = [];
  const zones: Zone[] = [];
  let zid = 2;
  const nid = () => ++zid;
  const usedNames = new Set<string>();

  const uniqueName = (base: string) => {
    let n = sanitizeName(base);
    let i = 2;
    while (usedNames.has(n)) n = `${sanitizeName(base)} ${i++}`;
    usedNames.add(n);
    return n;
  };

  // Cycle through dim/measure combos so successive charts differ visually.
  let combo = 0;
  const nextCombo = () => {
    const d = dims[combo % dims.length];
    const m = meas[combo % meas.length];
    combo++;
    return { dim: d[0], dimType: d[1], meas: m[0] };
  };

  const fmtBg = (hex?: string) => hex && hex !== "#000000" ? hex : "#FFFFFF";

  for (const e of elements) {
    if (e.role === "ignore") continue;
    const z = norm(e.rect, fw, fh);

    if (e.role === "worksheet") {
      const wsName = uniqueName(e.name || "Sheet");
      const { dim, dimType, meas: m } = nextCombo();
      worksheets.push({ name: wsName, kind: safeKind(e.chartKind), dim, dimType, meas: m });
      zones.push({
        kind: "sheet",
        id: nid(),
        name: wsName,
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        bg: fmtBg(e.fill?.hex),
        bc: e.stroke?.hex || "#D7DAEC",
      });
      continue;
    }

    if (e.role === "kpi") {
      const label = (e.name || "KPI").slice(0, 40);
      const value = e.text && /\d/.test(e.text) ? e.text.split("\n")[0] : "—";
      zones.push({
        kind: "text",
        id: nid(),
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        runs: [
          { text: label, size: 11, color: "#5B6478", font, break: true },
          { text: String(value), bold: true, size: 21, color: INK, font, break: true },
        ],
        bg: fmtBg(e.fill?.hex),
        bc: e.stroke?.hex || "#D7DAEC",
        bs: "solid",
        bw: "1",
        padding: "10",
      });
      continue;
    }

    if (e.role === "filter") {
      zones.push({
        kind: "text",
        id: nid(),
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        runs: [{ text: e.name || "Filter", size: 13, color: INK, font, align: 1 }],
        bg: fmtBg(e.fill?.hex),
        bc: e.stroke?.hex || "#D7DAEC",
        bs: "solid",
        bw: "1",
        padding: "12",
      });
      continue;
    }

    if (e.role === "text") {
      const txt = (e.text || e.name || "").split("\n").slice(0, 3);
      if (!txt.join("").trim()) continue;
      const runs: TRun[] = txt.map((line, i) => ({
        text: line,
        break: i < txt.length - 1,
        bold: e.bold || (i === 0 && (e.fontSize ?? 0) >= 18),
        size: e.fontSize ? Math.round(e.fontSize) : i === 0 ? 16 : 12,
        color: e.fill?.hex || INK,
        font,
      }));
      zones.push({
        kind: "text",
        id: nid(),
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        runs,
        bc: "#000000",
        bs: "none",
        bw: "0",
        padding: "6",
      });
      continue;
    }

    if (e.role === "container" && e.fill) {
      zones.push({
        kind: "text",
        id: nid(),
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        runs: [],
        bg: fmtBg(e.fill.hex),
        bc: e.stroke?.hex || "#E2E5F0",
        bs: "solid",
        bw: "1",
        padding: "0",
      });
    }
  }

  // Guarantee at least one worksheet so the workbook is non-empty.
  if (worksheets.length === 0) {
    const name = uniqueName("Sheet 1");
    const { dim, dimType, meas: m } = nextCombo();
    worksheets.push({ name, kind: "bar", dim, dimType, meas: m });
    zones.push({
      kind: "sheet",
      id: nid(),
      name,
      x: 2000,
      y: 30000,
      w: 96000,
      h: 68000,
      bg: "#FFFFFF",
      bc: "#D7DAEC",
    });
  }

  const bg = model.background?.hex || "#F4F5FB";

  return {
    workbookName: settings.workbookName || "Workbook",
    dashboardName: settings.dashboardName || model.title || "Dashboard",
    dsName: "federated.fig",
    dsCaption: (settings.workbookName || "Figma") + " Sample",
    connName: "textscan.fig",
    csvFile: "figma_sample.csv",
    fields,
    csvText: makeCsv(fields),
    worksheets,
    dashboard: {
      name: settings.dashboardName || model.title || "Dashboard",
      widthPx: Math.round(fw),
      heightPx: Math.round(fh),
      bg,
      bc: "#C8CCE4",
      zones,
    },
  };
}
