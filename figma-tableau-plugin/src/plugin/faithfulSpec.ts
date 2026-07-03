// ---------------------------------------------------------------------------
// faithfulSpec.ts — faithful Figma-to-Tableau spec builder
// ---------------------------------------------------------------------------

import type { FaithfulModel } from "../shared/types";
import type {
  WorkbookSpec,
  WorksheetSpec,
  DashboardSpec,
  ZoneSpec,
  MarkType,
  ContainerSpec,
  LayoutNode,
  ActionSpec,
} from "../shared/spec";
import { nextId, isContainer, DEFAULT_EXPORT_OPTIONS } from "../shared/spec";
import { slugFile } from "./seed";
import { inferLayoutTree } from "./layoutTree";
import { detectFaithfulDomain, domainDatasetFor, domainLabel, type DomainDataset } from "./domainData";

const PRIMARY_DS = "federated.fig";

export function markTypeOf(chart: string | undefined): MarkType {
  const ok: MarkType[] = ["Bar", "Line", "Area", "Pie", "Circle", "Square", "Text"];
  return (ok.find((m) => m === chart) as MarkType) || "Bar";
}

export function filterDimFor(label: string | undefined, data: DomainDataset): string {
  const l = (label || "").toLowerCase();
  const named = data.fields.find((f) => f.role === "dimension" && f.name.toLowerCase() === l);
  if (named) return named.name;
  if (/period|time|date|quarter|month|year|week|day/.test(l)) return data.trendDim;
  return data.catDim;
}

export interface FaithfulCtx {
  data: DomainDataset;
  worksheets: WorksheetSpec[];
  actions: ActionSpec[];
  used: Set<string>;
  imgN: number;
  sheetN: number;
  sheetIdToWs: Map<string, string>;
  navButtons: Array<{
    buttonWs: string;
    sourceDash: string;
    isNav?: boolean;
    nameTarget?: string;
    targetId?: string;
    targetFrameId?: string;
    isSheet?: boolean;
  }>;
}

export function uniqNameIn(ctx: FaithfulCtx, base: string): string {
  let n = (base || "Sheet").slice(0, 60);
  let i = 2;
  while (ctx.used.has(n)) n = `${(base || "Sheet").slice(0, 55)} ${i++}`;
  ctx.used.add(n);
  return n;
}

export function uniqueDashNames(titles: string[]): string[] {
  const seen = new Set<string>();
  return titles.map((raw) => {
    const base = (raw || "Dashboard").slice(0, 80) || "Dashboard";
    let n = base;
    let i = 2;
    while (seen.has(n)) n = `${base.slice(0, 76)} ${i++}`;
    seen.add(n);
    return n;
  });
}

export function buildFaithfulDashboard(
  model: FaithfulModel,
  ctx: FaithfulCtx,
  dashName: string,
  data: DomainDataset,
  dsName: string,
): DashboardSpec {
  const dashArea = Math.max(1, model.width * model.height);
  const dropped = new Set<string>();
  for (const s of model.zones) {
    if (s.kind !== "sheet") continue;
    let best: (typeof model.zones)[number] | undefined;
    for (const r of model.zones) {
      if (r === s || r.kind !== "rect" || dropped.has(r.id)) continue;
      const encloses =
        r.x <= s.x + 2 && r.y <= s.y + 2 && r.x + r.w >= s.x + s.w - 2 && r.y + r.h >= s.y + s.h - 2;
      const cardLike = r.w * r.h <= dashArea * 0.5 && r.w * r.h > s.w * s.h;
      if (encloses && cardLike && (!best || r.w * r.h < best.w * best.h)) best = r;
    }
    if (best) {
      s.x = best.x;
      s.y = best.y;
      s.w = best.w;
      s.h = best.h;
      if (s.cornerRadius == null) s.cornerRadius = best.cornerRadius;
      dropped.add(best.id);
    }
  }
  const srcZones = model.zones.filter((z) => !dropped.has(z.id));

  const zones: ZoneSpec[] = srcZones.map((z) => {
    const base = { x: z.x, y: z.y, w: z.w, h: z.h, friendlyName: z.name };
    if (z.kind === "sheet") {
      const wsName = uniqNameIn(ctx, z.sheetName || z.name || "Sheet");
      ctx.sheetIdToWs.set(z.id, wsName);
      const mark = markTypeOf(z.chart);
      const isTrend = mark === "Line" || mark === "Area";
      const dimension = isTrend ? data.trendDim : data.catDim;
      const measures =
        mark === "Circle"
          ? [{ field: data.meas[0], agg: "Sum" as const }, { field: data.meas[1], agg: "Sum" as const }]
          : [{ field: ctx.sheetN++ % 2 === 0 ? data.meas[0] : data.meas[1], agg: "Sum" as const }];
      ctx.worksheets.push({
        id: nextId("ws"),
        name: wsName,
        mark,
        dimension,
        measures,
        dualAxis: false,
        markColor: z.markColor || data.accent || "#898989",
        showLabels: true,
        dsName: dsName === PRIMARY_DS ? undefined : dsName,
      });
      if (z.actionKind === "filter") {
        ctx.actions.push({ id: nextId("act"), name: `Filter from ${wsName}`, kind: "filter", sourceSheet: wsName, target: dashName, runOn: "select" });
      } else if (z.actionKind === "highlight") {
        ctx.actions.push({ id: nextId("act"), name: `Highlight from ${wsName}`, kind: "highlight", sourceSheet: wsName, target: wsName, field: dimension, runOn: "select" });
      }
      return { id: nextId("z"), kind: "sheet" as const, ...base, worksheet: wsName, baseSheetName: z.sheetName || z.name || wsName, bg: "#FFFFFF", cornerRadius: z.cornerRadius, showTitle: true };
    }
    if (z.kind === "filter") {
      return {
        id: nextId("z"),
        kind: "filter" as const,
        ...base,
        field: filterDimFor(z.filterField, data),
        bg: "#FFFFFF",
        fg: "#D7DAEC",
      };
    }
    if (z.kind === "web") {
      return { id: nextId("z"), kind: "web" as const, ...base, url: z.url };
    }
    if (z.kind === "button") {
      const caption = z.label || z.name || "Button";
      const btnWs = uniqNameIn(ctx, (caption || "Button").slice(0, 40));
      ctx.worksheets.push({
        id: nextId("ws"),
        name: btnWs,
        mark: "Text",
        measures: [],
        dualAxis: false,
        showLabels: true,
        navButton: {
          caption,
          bg: z.fill || "#2563EB",
          fg: z.fontColor || "#FFFFFF",
          fontSize: z.fontSize ? Math.round(z.fontSize) : 13,
        },
      });
      ctx.navButtons.push({
        buttonWs: btnWs,
        sourceDash: dashName,
        isNav: z.isNav,
        nameTarget: z.target,
        targetId: z.navTargetId,
        targetFrameId: z.navTargetFrameId,
        isSheet: z.navTargetIsSheet,
      });
      return { id: nextId("z"), kind: "sheet" as const, ...base, worksheet: btnWs, bg: z.fill || "#2563EB", cornerRadius: z.cornerRadius, showTitle: false, pinned: true };
    }
    if (z.kind === "text") {
      return {
        id: nextId("z"),
        kind: "text" as const,
        ...base,
        text: z.text,
        fontSize: z.fontSize ? Math.round(z.fontSize) : 14,
        fontFamily: z.fontFamily,
        fg: z.fontColor,
        bold: z.bold,
        align: z.align,
        runs: z.runs,
      };
    }
    if (z.kind === "image") {
      ctx.imgN++;
      return {
        id: nextId("z"),
        kind: "image" as const,
        ...base,
        image: z.imagePng,
        imageFile: `${slugFile(z.name || "img")}_${ctx.imgN}.png`,
        scaled: true,
      };
    }
    return {
      id: nextId("z"),
      kind: "rect" as const,
      ...base,
      bg: z.fill,
      cornerRadius: z.cornerRadius,
      strokeColor: z.strokeColor,
      strokeWidth: z.strokeWidth,
    };
  });

  const filterZones = zones.filter((z) => z.kind === "filter");
  if (filterZones.length > 0) {
    const gap = 8;
    const sideW = Math.max(...filterZones.map((z) => z.w), 180);
    const sideX = Math.round(model.width) - sideW - 12;
    let accY = 12;
    for (const fz of filterZones) {
      fz.x = sideX;
      fz.y = accY;
      fz.w = sideW;
      accY += fz.h + gap;
    }
  }

  return {
    id: nextId("db"),
    name: dashName,
    widthPx: Math.round(model.width),
    heightPx: Math.round(model.height),
    bg: model.background || "#FFFFFF",
    zones: dropFigmaTitles(zones),
    layoutMode: "floating",
  };
}

export function dropFigmaTitles(zones: ZoneSpec[]): ZoneSpec[] {
  const sheets = zones.filter((z) => z.kind === "sheet" && z.showTitle === true);
  if (!sheets.length) return zones;
  const remove = new Set<string>();
  const ABOVE = 60;
  for (const s of sheets) {
    let best: ZoneSpec | undefined;
    let bestDist = Infinity;
    for (const t of zones) {
      if (t.kind !== "text" || remove.has(t.id) || !t.text) continue;
      const hOK = t.x >= s.x - 16 && t.x + t.w <= s.x + s.w + 16 && t.x < s.x + s.w && t.x + t.w > s.x;
      const vOK = t.y >= s.y - ABOVE && t.y <= s.y + s.h * 0.25;
      if (!hOK || !vOK) continue;
      if (t.text.trim().length > 60 || t.text.split("\n").length > 2) continue;
      const dist = Math.abs(t.y - s.y);
      if (dist < bestDist) {
        best = t;
        bestDist = dist;
      }
    }
    if (best) remove.add(best.id);
  }
  return remove.size ? zones.filter((z) => !remove.has(z.id)) : zones;
}

export function isContentZone(z: ZoneSpec): boolean {
  return z.kind === "sheet" || z.kind === "text" || z.kind === "image" || z.kind === "filter" || z.kind === "web";
}

export function isStructuralZone(z: ZoneSpec): boolean {
  return z.kind === "sheet" || z.kind === "image" || z.kind === "filter" || z.kind === "web" || z.kind === "button" || z.kind === "text";
}

export function applyFlowLayout(dash: DashboardSpec): void {
  const encloses = (r: ZoneSpec, o: ZoneSpec) =>
    r.x <= o.x + 2 && r.y <= o.y + 2 && r.x + r.w >= o.x + o.w - 2 && r.y + r.h >= o.y + o.h - 2;

  const dashArea = Math.max(1, dash.widthPx * dash.heightPx);
  const enclosingCards = dash.zones
    .filter((z) => z.kind === "rect" && dash.zones.some((o) => o !== z && isContentZone(o) && encloses(z, o)))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const cardToTextInfo = new Map<string, { textIds: string[]; bg: string; x: number; y: number; w: number; h: number; cornerRadius?: number }>();
  for (const card of enclosingCards) {
    if (!card.bg || card.w * card.h >= dashArea * 0.8) continue;
    const textIds: string[] = [];
    for (const o of dash.zones) {
      if (o === card || !isContentZone(o) || o.kind === "image" || !encloses(card, o)) continue;
      if (!o.bg || o.bg === "#FFFFFF" || o.bg === "#FFFFFFFF") o.bg = card.bg;
      if (o.cornerRadius == null) o.cornerRadius = card.cornerRadius;
      if (o.kind === "text") textIds.push(o.id);
    }
    if (textIds.length > 1) cardToTextInfo.set(card.id, { textIds, bg: card.bg, x: card.x, y: card.y, w: card.w, h: card.h, cornerRadius: card.cornerRadius });
  }
  const kept = dash.zones.filter((z) => z.kind !== "rect");
  const structural = kept.filter(isStructuralZone);
  const filterTiles = structural.filter((z) => z.kind === "filter");
  const bodyTiles = structural.filter((z) => z.kind !== "filter");
  if (bodyTiles.length < 2) return;

  interface TextGroupInfo {
    textIds: string[];
    bg: string;
    x: number;
    y: number;
    w: number;
    h: number;
    cornerRadius?: number;
  }
  const cardTextGroups = new Map<string, TextGroupInfo>();
  const lineGroups = new Map<string, ZoneSpec[]>();
  const groupRepIds = new Set<string>();

  for (const z of bodyTiles) {
    const m = /^(.*)#L(\d+)$/.exec(z.id || "");
    if (m) {
      const g = lineGroups.get(m[1]);
      if (g) g.push(z);
      else lineGroups.set(m[1], [z]);
    }
  }
  const lineGroupIds = new Set<string>();
  for (const members of lineGroups.values()) for (const m of members) lineGroupIds.add(m.id);
  const usedInCardGroup = new Set<string>();
  for (const [cardId, info] of cardToTextInfo) {
    const available = info.textIds.filter((id) => !lineGroupIds.has(id));
    if (available.length > 1) {
      const gid = `@cardtext:${cardId}`;
      cardTextGroups.set(gid, { textIds: available, bg: info.bg, x: info.x, y: info.y, w: info.w, h: info.h, cornerRadius: info.cornerRadius });
      for (const id of available) usedInCardGroup.add(id);
    }
  }

  const structuralList: ZoneSpec[] = bodyTiles.filter((z) => {
    if (lineGroupIds.has(z.id)) return false;
    if (usedInCardGroup.has(z.id)) return false;
    return true;
  });

  for (const [baseId, members] of lineGroups) {
    members.sort((a, b) => a.y - b.y);
    const repId = `@group:${baseId}`;
    structuralList.push({
      id: repId,
      kind: "text",
      x: Math.min(...members.map((z) => z.x)),
      y: Math.min(...members.map((z) => z.y)),
      w: Math.max(...members.map((z) => z.x + z.w)) - Math.min(...members.map((z) => z.x)),
      h: Math.max(...members.map((z) => z.y + z.h)) - Math.min(...members.map((z) => z.y)),
    });
    groupRepIds.add(repId);
  }

  for (const [gid, info] of cardTextGroups) {
    const members = info.textIds.map((id) => bodyTiles.find((z) => z.id === id)).filter((z): z is ZoneSpec => !!z);
    if (members.length < 2) continue;
    structuralList.push({
      id: gid,
      kind: "text",
      x: info.x,
      y: info.y,
      w: info.w,
      h: info.h,
    });
    groupRepIds.add(gid);
  }

  let root: ContainerSpec | undefined;
  try {
    root = inferLayoutTree(structuralList);
  } catch (e) {
    console.warn("inferLayoutTree(structuralList) failed, falling back to floating:", e);
    root = undefined;
  }
  if (!root) return;

  const spacerZones: ZoneSpec[] = [];
  const expandTextGroups = (node: LayoutNode): void => {
    if (!isContainer(node)) return;
    for (let i = 0; i < node.children.length; i++) {
      const ch = node.children[i];
      if (!isContainer(ch) && groupRepIds.has(ch.zone)) {
        let memberZones: ZoneSpec[] | undefined;
        let card: TextGroupInfo | undefined;

        if (ch.zone.startsWith("@group:")) {
          const ms = lineGroups.get(ch.zone.replace(/^@group:/, ""));
          if (ms && ms.length > 0) memberZones = [...ms].sort((a, b) => a.y - b.y);
        } else if (ch.zone.startsWith("@cardtext:")) {
          const info = cardTextGroups.get(ch.zone);
          if (info) {
            card = info;
            memberZones = info.textIds
              .map((id) => bodyTiles.find((z) => z.id === id))
              .filter((z): z is ZoneSpec => !!z)
              .sort((a, b) => a.y - b.y);
          }
        }

        if (memberZones && memberZones.length > 0) {
          const children: LayoutNode[] = [];
          if (card) {
            const spacer = (y: number, h: number): void => {
              const z: ZoneSpec = {
                id: nextId("z"),
                kind: "rect",
                friendlyName: "Card Fill",
                x: card!.x,
                y,
                w: card!.w,
                h,
                bg: card!.bg,
              };
              spacerZones.push(z);
              children.push({ zone: z.id });
            };
            let cursor = card.y;
            for (const m of memberZones) {
              const gap = m.y - cursor;
              if (gap > 2) spacer(cursor, gap);
              children.push({ zone: m.id });
              cursor = Math.max(cursor, m.y + m.h);
            }
            const tail = card.y + card.h - cursor;
            if (tail > 2) spacer(cursor, tail);
          } else {
            for (const m of memberZones) children.push({ zone: m.id });
          }
          node.children[i] = {
            id: nextId("c"),
            direction: "vert",
            children,
            name: card ? "KPI Card" : undefined,
          };
        }
      } else {
        expandTextGroups(ch);
      }
    }
  };
  expandTextGroups(root);

  if (filterTiles.length > 0) {
    filterTiles.sort((a, b) => a.y - b.y || a.x - b.x);
    const rowH = Math.max(70, Math.min(110, Math.round(Math.max(...filterTiles.map((f) => f.h)))));
    const n = filterTiles.length;
    filterTiles.forEach((f, i) => {
      f.x = Math.round((i * dash.widthPx) / n);
      f.y = 0;
      f.w = Math.round(dash.widthPx / n);
      f.h = rowH;
    });
    const filterRow: ContainerSpec = {
      id: nextId("c"),
      direction: "horz",
      children: filterTiles.map((f) => ({ zone: f.id })),
      name: "Filters",
    };
    if (root.direction === "vert") root.children.unshift(filterRow);
    else root = { id: nextId("c"), direction: "vert", children: [filterRow, root], name: "Body" };
  }

  dash.zones = [...kept, ...spacerZones];
  dash.layoutMode = "tiled";
  dash.root = root;
}

export function materializeSheetOnly(model: FaithfulModel, ctx: FaithfulCtx, data: DomainDataset, dsName: string): void {
  for (const z of model.zones) {
    if (z.kind !== "sheet") continue;
    const wsName = uniqNameIn(ctx, z.sheetName || z.name || "Sheet");
    ctx.sheetIdToWs.set(z.id, wsName);
    const mark = markTypeOf(z.chart);
    const isTrend = mark === "Line" || mark === "Area";
    const measures =
      mark === "Circle"
        ? [{ field: data.meas[0], agg: "Sum" as const }, { field: data.meas[1], agg: "Sum" as const }]
        : [{ field: ctx.sheetN++ % 2 === 0 ? data.meas[0] : data.meas[1], agg: "Sum" as const }];
    ctx.worksheets.push({
      id: nextId("ws"),
      name: wsName,
      mark,
      dimension: isTrend ? data.trendDim : data.catDim,
      measures,
      dualAxis: false,
      markColor: z.markColor || data.accent || "#898989",
      showLabels: true,
      dsName: dsName === PRIMARY_DS ? undefined : dsName,
    });
  }
}

export function assembleFaithfulWorkbook(
  models: FaithfulModel[],
  opts?: { layout?: "flow" | "floating" }
): WorkbookSpec {
  const dashModels = models.filter((m) => !m.sheetOnly);
  const sheetOnlyModels = models.filter((m) => m.sheetOnly);

  const domainOf = (m: FaithfulModel) => detectFaithfulDomain([m]);
  const distinctDomains = [...new Set([...dashModels, ...sheetOnlyModels].map(domainOf))];
  if (distinctDomains.length === 0) distinctDomains.push("generic");
  const domainInfo = new Map<
    string,
    { data: DomainDataset; dsName: string; connName: string; caption: string; fileName: string }
  >();
  distinctDomains.forEach((dom, i) => {
    domainInfo.set(dom, {
      data: domainDatasetFor(dom),
      dsName: i === 0 ? PRIMARY_DS : `${PRIMARY_DS}${i + 1}`,
      connName: i === 0 ? "textscan.fig" : `textscan.fig${i + 1}`,
      caption: `${domainLabel(dom)} Data`,
      fileName: i === 0 ? "data.csv" : `data_${dom}.csv`,
    });
  });
  const primary = domainInfo.get(distinctDomains[0])!;
  const data = primary.data;
  const { fields, rows } = data;
  const ctx: FaithfulCtx = { data, worksheets: [], actions: [], used: new Set(), imgN: 0, sheetN: 0, sheetIdToWs: new Map(), navButtons: [] };

  const resolvedDashNames = uniqueDashNames(dashModels.map((m) => m.title || "Dashboard"));
  const dashboards = dashModels.map((m, i) => {
    const info = domainInfo.get(domainOf(m))!;
    return buildFaithfulDashboard(m, ctx, resolvedDashNames[i], info.data, info.dsName);
  });
  if (opts?.layout === "flow") for (const d of dashboards) applyFlowLayout(d);

  for (const m of sheetOnlyModels) {
    const info = domainInfo.get(domainOf(m))!;
    materializeSheetOnly(m, ctx, info.data, info.dsName);
  }
  const extraData = distinctDomains.slice(1).map((dom) => {
    const info = domainInfo.get(dom)!;
    return { dsName: info.dsName, connName: info.connName, caption: info.caption, fileName: info.fileName, fields: info.data.fields, rows: info.data.rows };
  });

  if (ctx.worksheets.length === 0) {
    ctx.worksheets.push({
      id: nextId("ws"),
      name: "Sheet 1",
      mark: "Bar",
      dimension: data.catDim,
      measures: [{ field: data.meas[0], agg: "Sum" }],
      dualAxis: false,
      showLabels: false,
    });
  }

  const buttonWsNames = new Set(ctx.worksheets.filter((w) => w.navButton).map((w) => w.name));
  const firstChart = ctx.worksheets.find((w) => !w.navButton)?.name;
  for (const dash of dashboards) {
    const localHost = dash.zones.find(
      (z) => z.kind === "sheet" && z.worksheet && !buttonWsNames.has(z.worksheet)
    )?.worksheet;
    const host = localHost ?? firstChart;
    if (host) for (const zn of dash.zones) if (zn.kind === "filter" && !zn.worksheet) zn.worksheet = host;
  }

  const frameIdToDash = new Map<string, string>();
  dashModels.forEach((m, i) => {
    if (m.id) frameIdToDash.set(m.id, resolvedDashNames[i]);
  });
  const dashNames = dashboards.map((d) => d.name);
  const findDash = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const t = raw.trim().toLowerCase();
    return dashNames.find((n) => n.toLowerCase() === t) ?? dashNames.find((n) => n.toLowerCase().includes(t));
  };
  for (const nb of ctx.navButtons) {
    let target: string | undefined;
    if (nb.isNav) {
      if (nb.isSheet && nb.targetId && ctx.sheetIdToWs.has(nb.targetId)) target = ctx.sheetIdToWs.get(nb.targetId);
      else if (nb.targetFrameId && frameIdToDash.has(nb.targetFrameId)) target = frameIdToDash.get(nb.targetFrameId);
    } else if (nb.nameTarget) {
      target = findDash(nb.nameTarget);
    } else if (dashNames.length === 2) {
      target = dashNames[(dashNames.indexOf(nb.sourceDash) + 1) % 2];
    } else if (dashNames.length > 2) {
      target = dashNames[(dashNames.indexOf(nb.sourceDash) + 1) % dashNames.length];
    }
    if (target && target !== nb.sourceDash && target !== nb.buttonWs) {
      ctx.actions.push({ id: nextId("act"), name: `Go to ${target}`, kind: "navigate", sourceSheet: nb.buttonWs, target, runOn: "select" });
    }
  }

  const first = models[0];
  return {
    workbookName: (first?.title || "Workbook").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Workbook",
    tableauVersion: "2026.2",
    data: { fileName: primary.fileName, fields, calcs: [], rows },
    extraData: extraData.length ? extraData : undefined,
    worksheets: ctx.worksheets,
    dashboards,
    actions: ctx.actions,
    includeActions: ctx.actions.some((a) => a.kind !== "navigate"),
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
  };
}

export function imageOnlySpec(models: FaithfulModel[]): WorkbookSpec {
  const usedImgNames = new Set<string>();
  const dashboards: DashboardSpec[] = models.map((m, i) => {
    const name = (m.title || "Dashboard").slice(0, 80) || "Dashboard";
    const dashName = (() => {
      let n = name, j = 2;
      while (usedImgNames.has(n)) n = `${name.slice(0, 76)} ${j++}`;
      usedImgNames.add(n);
      return n;
    })();
    const zones: ZoneSpec[] = m.zones
      .filter((z) => z.kind === "image" && z.imagePng)
      .map((z) => ({
        id: nextId("z"),
        kind: "image" as const,
        friendlyName: z.name,
        x: 0, y: 0, w: Math.round(m.width), h: Math.round(m.height),
        image: z.imagePng,
        imageFile: z.name === "Background" ? `background_${i}.png` : `${slugFile(z.name || "img")}_${i}.png`,
        scaled: true,
      }));
    const safeZones = zones.length > 0 ? zones : [
      { id: nextId("z"), kind: "rect" as const, friendlyName: "Empty", x: 0, y: 0,
        w: Math.round(m.width), h: Math.round(m.height), bg: "#F4F5FB" },
    ];
    return {
      id: nextId("db"),
      name: dashName,
      widthPx: Math.round(m.width),
      heightPx: Math.round(m.height),
      bg: m.background || "#FFFFFF",
      zones: safeZones,
      layoutMode: "floating" as const,
    };
  });

  const first = models[0];
  const dummyWs: WorksheetSpec = {
    id: nextId("ws"),
    name: "Background Image",
    mark: "Text",
    measures: [],
    dualAxis: false,
    showLabels: false,
  };
  return {
    workbookName: (first?.title || "Workbook").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Workbook",
    tableauVersion: "2026.2",
    data: { fileName: "data.csv", fields: [], calcs: [], rows: [] },
    worksheets: [dummyWs],
    dashboards,
    actions: [],
    includeActions: false,
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
  };
}

export type FaithfulLayout = "flow" | "floating" | "image";

export function faithfulSpec(model: FaithfulModel, layout: FaithfulLayout = "floating"): WorkbookSpec {
  if (layout === "image") return imageOnlySpec([model]);
  return assembleFaithfulWorkbook([model], { layout });
}

export function faithfulSpecMulti(models: FaithfulModel[], layout: FaithfulLayout = "floating"): WorkbookSpec {
  if (layout === "image") return imageOnlySpec(models);
  return assembleFaithfulWorkbook(models, { layout });
}
