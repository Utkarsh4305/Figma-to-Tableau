// ---------------------------------------------------------------------------
// dashboardXml.ts — dashboard XML generation (layout zones + containers).
// ---------------------------------------------------------------------------

import type { DashboardSpec, ZoneSpec, ContainerSpec, LayoutNode, ExportOptions } from "../shared/spec";
import { isContainer } from "../shared/spec";
import type { DsCtx } from "./datasourceXml";
import { esc, uid, dimInstance, clampN, safeFont } from "./xmlUtils";

function zoneStyle(
  bg: string | undefined,
  bc: string,
  bs: string,
  bw: string,
  margin: string,
  padding?: string,
  corner?: number
): string {
  const s: string[] = ["          <zone-style>\n"];
  s.push(`            <format attr='border-color' value='${bc}' />\n`);
  s.push(`            <format attr='border-style' value='${bs}' />\n`);
  s.push(`            <format attr='border-width' value='${bw}' />\n`);
  s.push(`            <format attr='margin' value='${margin}' />\n`);
  if (padding) s.push(`            <format attr='padding' value='${padding}' />\n`);
  if (bg) s.push(`            <format attr='background-color' value='${bg}' />\n`);
  s.push(cornerXml(corner));
  s.push("          </zone-style>\n");
  return s.join("");
}

function cornerXml(radius: number | undefined): string {
  const r = radius == null ? 0 : Math.max(0, Math.round(radius));
  if (r <= 0) return "";
  const p = "            <_.fcp.DashboardRoundedCorners.true...format attr=";
  return (
    `${p}'corner-radius' value='${r}' />\n` +
    `${p}'corner-radius-top-right' value='${r}' />\n` +
    `${p}'corner-radius-bottom-left' value='${r}' />\n` +
    `${p}'corner-radius-bottom-right' value='${r}' />\n`
  );
}

function containerStyle(margin = "8"): string {
  return (
    "          <zone-style>\n" +
    "            <format attr='border-style' value='none' />\n" +
    "            <format attr='border-width' value='0' />\n" +
    `            <format attr='margin' value='${margin}' />\n` +
    "          </zone-style>\n"
  );
}

export function dashboardXml(
  dash: DashboardSpec,
  primaryCtx: DsCtx,
  wsToDs: Map<string, DsCtx>,
  opts?: ExportOptions
): { xml: string; sheetNames: string[] } {
  const fw = dash.widthPx || 1280;
  const fh = dash.heightPx || 800;
  const sheetNames: string[] = [];
  let zid = 2;
  const nid = () => ++zid;
  const zoneById = new Map(dash.zones.map((z) => [z.id, z] as const));

  const zoneFlexible = (z: ZoneSpec): boolean => z.kind === "sheet" && !z.isKpi && !z.pinned;
  const nodeFlexible = (node: LayoutNode): boolean => {
    if (!isContainer(node)) {
      const z = zoneById.get(node.zone);
      return !!z && zoneFlexible(z);
    }
    return node.children.some(nodeFlexible);
  };

  const boundsOf = (node: LayoutNode): { x: number; y: number; w: number; h: number } | null => {
    if (!isContainer(node)) {
      const z = zoneById.get(node.zone);
      return z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null;
    }
    const bs = node.children
      .map(boundsOf)
      .filter((b): b is { x: number; y: number; w: number; h: number } => !!b);
    if (!bs.length) return null;
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    const x2 = Math.max(...bs.map((b) => b.x + b.w));
    const y2 = Math.max(...bs.map((b) => b.y + b.h));
    return { x, y, w: x2 - x, h: y2 - y };
  };

  const pinCandidate = (node: LayoutNode, dir: "horz" | "vert"): number => {
    if (!isContainer(node)) {
      const z = zoneById.get(node.zone);
      if (!z || zoneFlexible(z)) return 0;
      return Math.round(dir === "horz" ? z.w : z.h);
    }
    if (!nodeFlexible(node)) {
      const nb = boundsOf(node);
      return nb ? Math.round(dir === "horz" ? nb.w : nb.h) : 0;
    }
    return 0;
  };

  const emitZone = (z: ZoneSpec, tiled = false, parentDir?: "horz" | "vert", allowPin = true): string => {
    if (z.kind === "filter" && opts && !opts.showFilters) return "";
    const X = clampN(z.x, fw);
    const Y = clampN(z.y, fh);
    const W = Math.max(1, clampN(z.w, fw));
    const H = Math.max(1, clampN(z.h, fh));
    const o: string[] = [];
    const fn = z.friendlyName ? ` friendly-name='${esc(z.friendlyName)}'` : "";
    const fixedPx = zoneFlexible(z) ? 0 : Math.round(parentDir === "horz" ? z.w : z.h);
    const fix = tiled && parentDir && fixedPx > 0 && allowPin ? ` fixed-size='${fixedPx}' is-fixed='true'` : "";

    if (z.kind === "sheet" && z.worksheet) {
      sheetNames.push(z.worksheet);
      const showTitle = opts && opts.showTitles === false ? "false" : z.showTitle ? "true" : "false";
      if (tiled) {
        o.push(`        <zone${fn}${fix} h='${H}' id='${nid()}' name='${esc(z.worksheet)}' show-title='${showTitle}' w='${W}' x='${X}' y='${Y}'>\n`);
        o.push("          <layout-cache cell-count-h='1' cell-count-w='1' type-h='cell' type-w='cell' />\n");
        o.push(zoneStyle(z.bg || "#FFFFFF", "#000000", "none", "0", "6", "8", z.cornerRadius ?? 10));
        o.push("        </zone>\n");
      } else {
        o.push(`        <zone${fn} h='${H}' id='${nid()}' name='${esc(z.worksheet)}' show-title='${showTitle}' w='${W}' x='${X}' y='${Y}'>\n`);
        o.push("          <layout-cache cell-count-h='1' cell-count-w='1' type-h='cell' type-w='cell' />\n");
        o.push(zoneStyle(z.bg || "#FFFFFF", "#000000", "none", "0", "0", "8", z.cornerRadius ?? 10));
        o.push("        </zone>\n");
      }
    } else if (z.kind === "image" && z.imageFile) {
      const sc = z.scaled === false ? "is-centered='1' is-scaled='0'" : "is-centered='0' is-scaled='1'";
      o.push(
        `        <zone${fn}${fix} h='${H}' id='${nid()}' ${sc} param='Image/${esc(z.imageFile)}' type-v2='bitmap' w='${W}' x='${X}' y='${Y}' />\n`
      );
    } else if (z.kind === "filter" && z.worksheet && (z.field || z.filterParam)) {
      const ctx = (z.worksheet && wsToDs.get(z.worksheet)) || primaryCtx;
      const f = z.field ? ctx.reg.get(z.field) : undefined;
      const param = z.filterParam
        ? z.filterParam
        : f
        ? `[${ctx.dsName}].${dimInstance(f.base)}`
        : `[${ctx.dsName}].[none:${z.field ?? "?"}:nk]`;
      o.push(
        `        <zone${fn}${fix} h='${H}' id='${nid()}' mode='checkdropdown' name='${esc(z.worksheet)}' param='${param}' type-v2='filter' w='${W}' x='${X}' y='${Y}'>\n`
      );
      o.push(zoneStyle(z.bg || "#FFFFFF", z.fg || "#D7DAEC", "solid", "1", "3", "6"));
      o.push("        </zone>\n");
    } else if (z.kind === "web" && z.url) {
      o.push(
        `        <zone${fn}${fix} forceUpdate='' h='${H}' id='${nid()}' param='${esc(z.url)}' type-v2='web' w='${W}' x='${X}' y='${Y}'>\n`
      );
      o.push(zoneStyle(undefined, "#000000", "none", "0", "4"));
      o.push("        </zone>\n");
    } else if (z.kind === "rect") {
      o.push(`        <zone${fn}${fix} h='${H}' id='${nid()}' type-v2='empty' w='${W}' x='${X}' y='${Y}'>\n`);
      const hasStroke = !!z.strokeColor && (z.strokeWidth ?? 0) > 0;
      o.push(
        zoneStyle(
          z.bg,
          z.strokeColor || "#000000",
          hasStroke ? "solid" : "none",
          hasStroke ? String(Math.max(1, Math.round(z.strokeWidth || 1))) : "0",
          "0",
          undefined,
          z.cornerRadius
        )
      );
      o.push("        </zone>\n");
    } else {
      const isButton = z.kind === "button";
      o.push(`        <zone${fn}${fix} h='${H}' id='${nid()}' type-v2='text' w='${W}' x='${X}' y='${Y}'>\n`);
      o.push("          <formatted-text>\n");
      const runXml = (
        text: string,
        opt: { size?: number; family?: string; color?: string; bold?: boolean }
      ): string => {
        let attrs = "";
        if (opt.bold || isButton) attrs += " bold='true'";
        if (opt.family) attrs += ` fontname='${esc(safeFont(opt.family))}'`;
        attrs += ` fontsize='${opt.size || (isButton ? 13 : 14)}'`;
        attrs += ` fontcolor='${opt.color || (isButton ? "#FFFFFF" : "#101828")}'`;
        if (z.align != null) attrs += ` fontalignment='${z.align}'`;
        else if (isButton) attrs += " fontalignment='1'";
        return `            <run${attrs}>${esc(text)}</run>\n`;
      };
      if (z.runs && z.runs.length > 1) {
        for (const r of z.runs)
          if (r.text)
            o.push(
              runXml(r.text, {
                size: r.fontSize ? Math.round(r.fontSize) : z.fontSize,
                family: r.fontFamily || z.fontFamily,
                color: r.fontColor || z.fg,
                bold: r.bold ?? z.bold,
              })
            );
      } else {
        const label = z.text || (isButton ? z.targetDashboard || "Button" : "");
        if (label)
          o.push(runXml(label, { size: z.fontSize, family: z.fontFamily, color: z.fg, bold: z.bold }));
      }
      o.push("          </formatted-text>\n");
      const bg = z.bg || (isButton ? "#2563EB" : undefined);
      o.push(
        zoneStyle(
          bg,
          isButton ? "#1E4FBF" : "#000000",
          isButton ? "solid" : "none",
          isButton ? "1" : "0",
          isButton ? "3" : tiled ? "0" : "1",
          isButton ? "10" : "0"
        )
      );
      o.push("        </zone>\n");
    }
    return o.join("");
  };

  const emitContainer = (
    c: ContainerSpec,
    placed: Set<string>,
    parentDir?: "horz" | "vert",
    allowPin = true
  ): string => {
    const b = boundsOf(c);
    if (!b) return "";
    const X = clampN(b.x, fw);
    const Y = clampN(b.y, fh);
    const W = Math.max(1, clampN(b.w, fw));
    const H = Math.max(1, clampN(b.h, fh));
    const fn = c.name ? ` friendly-name='${esc(c.name)}'` : "";
    let de = "";
    if (c.children.length > 1) {
      if (c.direction === "horz") {
        de = ` layout-strategy-id='distribute-evenly'`;
      } else {
        const extents = c.children
          .map((ch) => {
            const cb = boundsOf(ch);
            return cb ? cb.h : 0;
          })
          .filter((v) => v > 0);
        const even = extents.length > 1 && Math.max(...extents) <= Math.min(...extents) * 1.25;
        if (even) de = ` layout-strategy-id='distribute-evenly'`;
      }
    }
    const fixPx = parentDir && allowPin ? pinCandidate(c, parentDir) : 0;
    const fix = fixPx > 0 ? ` fixed-size='${fixPx}' is-fixed='true'` : "";
    const o: string[] = [
      `        <zone${fn}${fix}${de} h='${H}' id='${nid()}' param='${c.direction}' type-v2='layout-flow' w='${W}' x='${X}' y='${Y}'>\n`,
    ];
    const childPinOk = new Map<LayoutNode, boolean>();
    if (c.direction === "horz") {
      const extentPx = Math.max(1, b.w);
      const widths = c.children
        .map((ch) => {
          const cb = boundsOf(ch);
          return cb ? cb.w : 0;
        })
        .filter((v) => v > 0);
      const evenRow = widths.length > 1 && Math.max(...widths) <= Math.min(...widths) * 1.25;
      if (evenRow) {
        for (const ch of c.children) childPinOk.set(ch, false);
      } else {
        const cands = c.children.map((ch) => pinCandidate(ch, "horz"));
        const ok = cands.map((v) => v > 0 && v <= extentPx * 0.45);
        for (;;) {
          const sum = cands.reduce((s, v, i) => s + (ok[i] ? v : 0), 0);
          if (sum <= extentPx * 0.8) break;
          let maxI = -1;
          for (let i = 0; i < cands.length; i++)
            if (ok[i] && (maxI < 0 || cands[i] > cands[maxI])) maxI = i;
          if (maxI < 0) break;
          ok[maxI] = false;
        }
        c.children.forEach((ch, i) => childPinOk.set(ch, ok[i]));
      }
    }
    for (const ch of c.children) {
      const pinOk = c.direction === "horz" ? childPinOk.get(ch) === true : true;
      if (isContainer(ch)) o.push(emitContainer(ch, placed, c.direction, pinOk));
      else {
        const z = zoneById.get(ch.zone);
        if (z) {
          placed.add(z.id);
          o.push(emitZone(z, true, c.direction, pinOk));
        }
      }
    }
    o.push(containerStyle());
    o.push("        </zone>\n");
    return o.join("");
  };

  const x: string[] = [`    <dashboard name='${esc(dash.name)}'>\n`];
  x.push("      <style />\n");
  const isTiled = dash.layoutMode === "tiled" && !!dash.root;
  x.push(
    `      <size maxheight='${fh}' maxwidth='${fw}' minheight='${fh}' minwidth='${fw}' sizing-mode='fixed' />\n`
  );
  x.push("        <zones>\n");
  x.push(`          <zone h='100000' id='2' type-v2='layout-basic' w='100000' x='0' y='0'>\n`);

  if (isTiled && dash.root) {
    const placed = new Set<string>();
    x.push(emitContainer(dash.root, placed));
    for (const z of dash.zones) if (!placed.has(z.id)) x.push(emitZone(z));
  } else {
    for (const z of dash.zones) x.push(emitZone(z));
  }

  x.push(zoneStyle(dash.bg || "#F4F5FB", "#C8CCE4", "solid", "2", "8"));
  x.push("          </zone>\n        </zones>\n");
  x.push(`      <simple-id uuid='${uid()}' />\n`);
  x.push("    </dashboard>\n");
  return { xml: x.join(""), sheetNames };
}
