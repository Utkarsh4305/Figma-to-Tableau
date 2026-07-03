// ---------------------------------------------------------------------------
// faithful.ts — runs INSIDE the Figma sandbox. A FAITHFUL transpiler: instead
// of classifying charts and binding them to sample data, it recreates the whole
// Figma frame as native Tableau dashboard zones (the LaDataViz approach):
//   - TEXT layers          -> text zones (real content, font, color)
//   - shapes / cards / bars -> colored `empty` zones (rect)
//   - icons / vectors / images -> bitmap zones (rasterized PNG)
// The output LOOKS like the design; it carries no live data.
// ---------------------------------------------------------------------------

import type { FaithfulModel, FaithfulTextRun, FaithfulZone, Rect } from "../shared/types";
import { matchLayerPrefix } from "../shared/constants";
import { markFromTag, parseLayerOptions, parseButtonName, dominantChartColor, navDestination, firstTextStyle, parseSheetTag } from "./faithful/zoneParsers";
import { PT_PER_PX, hh, toHex, toHex8, fillOf, solidHex, firstSolidStroke, hasImageFill, VECTORISH, FILLABLE, rectOf, MAX_ZONES, isBoldStyle } from "./faithful/colorGeometry";
import { styledRuns, TextLine, linesWithSizes, alignOf } from "./faithful/textRuns";
import { SEGOE_EMS, PX_PER_PT, TABLEAU_TEXT_SCALE, LINE_BOX, estLineWidthPx, zoneNeedW, scaleZoneFont, fitFaithfulText } from "./faithful/textFitting";
export { attachFaithfulImages, buildImageOnlyModel, attachBackgroundImage } from "./faithful/rasterization";







/**
 * Walk every visible node back-to-front (parent emitted before its children, so
 * children draw on top — matching Figma z-order). Pushes a FaithfulZone for any
 * node that has its own visual (text / fill / image / vector).
 */
function walk(node: SceneNode, origin: { x: number; y: number }, zones: FaithfulZone[]): void {
  if (zones.length >= MAX_ZONES) return;
  if (node.visible === false) return;
  const opacity = (node as SceneNode & { opacity?: number }).opacity;
  if (typeof opacity === "number" && opacity < 0.02) return;

  const rect = rectOf(node, origin);
  // Skip nodes with no resolvable geometry (would emit a "NaN" attr otherwise).
  if (![rect.x, rect.y, rect.w, rect.h].every((n) => Number.isFinite(n))) return;
  if (rect.w <= 0 || rect.h <= 0) return;
  const t = node.type;

  // SHEET/-tagged layer -> a REAL Tableau worksheet (bound to sample data) sits
  // here instead of the static design. Emit one sheet zone and DON'T recurse:
  // the worksheet replaces whatever the designer drew inside the frame. This is
  // exactly how LaDataViz produced the live charts in Template.twbx.
  // Nav/Label -> a native Tableau navigation button whose TARGET comes from the
  // layer's Figma prototype interaction (its "Navigate to" reaction), resolved to
  // a worksheet or dashboard window by expandNavTargets + seed.ts. The caption is
  // the inner text (or the label after "Nav/"); colors/shape come from the layer.
  // Like BUTTON/ we don't recurse — the native button replaces the inner design.
  const navRe = /^\s*nav\s*\/\s*/i;
  if (navRe.test(node.name || "")) {
    const clean = (node.name || "").replace(navRe, "").trim();
    const { label } = parseButtonName(clean);
    const ts = firstTextStyle(node);
    const fill = fillOf(node);
    const cr = (node as SceneNode & { cornerRadius?: number | symbol }).cornerRadius;
    zones.push({
      id: node.id,
      name: node.name || "Nav",
      kind: "button",
      ...rect,
      label: ts.text || label,
      isNav: true,
      navTargetId: navDestination(node),
      fill: fill && fill.a > 0.01 ? fill.hex : undefined,
      fontColor: ts.color,
      fontSize: ts.sizePt,
      cornerRadius: typeof cr === "number" ? cr : undefined,
    });
    return;
  }

  const pfx = matchLayerPrefix(node.name || "");
  if (pfx && pfx.role === "worksheet") {
    const opts = parseLayerOptions(pfx.clean);
    const { sheetName, chart } = parseSheetTag(opts.name);
    zones.push({
      id: node.id,
      name: node.name || sheetName,
      kind: "sheet",
      ...rect,
      sheetName,
      chart,
      showTitle: opts.showTitle || undefined,
      markColor: dominantChartColor(node),
      actionKind: opts.action,
    });
    return;
  }
  // FILTER/Field -> a real Tableau quick-filter card on that dimension (the
  // LaDataViz convention). Confirmed schema (type-v2='filter' in DM_Dashboards).
  // We don't recurse: the card replaces whatever placeholder the designer drew.
  if (pfx && pfx.role === "filter") {
    zones.push({
      id: node.id,
      name: node.name || "Filter",
      kind: "filter",
      ...rect,
      filterField: parseLayerOptions(pfx.clean).name || pfx.clean,
    });
    return;
  }
  // IMAGE/<label> -> a rasterised bitmap zone (type-v2='bitmap').
  // The IMAGE/ prefix forces image handling regardless of the node's fills,
  // so a solid-colour rect tagged IMAGE/ still becomes a bitmap (it gets
  // rasterised in attachFaithfulImages). We don't recurse.
  if (pfx && pfx.role === "image") {
    zones.push({ id: node.id, name: node.name || "Image", kind: "image", ...rect });
    return;
  }
  // URL/<page> -> a real Tableau web page object (type-v2='web'). Confirmed
  // schema (see "Using Web Page Object in Tableau.twb"). The text after URL/ is
  // the page address; bare hosts get an https:// scheme. We don't recurse.
  if (pfx && pfx.role === "web") {
    const raw = pfx.clean.trim();
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    zones.push({ id: node.id, name: node.name || "Web", kind: "web", ...rect, url });
    return;
  }
  // BUTTON/Label[ > Target] -> a native Tableau navigation button
  // (type-v2='dashboard-object' + <button action='tabdoc:goto-sheet'>). Confirmed
  // from LaDataViz's multi.twbx. We don't recurse: the native button replaces the
  // inner label/background the designer drew (like SHEET/ and FILTER/). The
  // caption/colors come from the layer name + the button's own fill + its label.
  if (pfx && pfx.role === "button") {
    const { label, target } = parseButtonName(pfx.clean);
    const ts = firstTextStyle(node);
    const fill = fillOf(node);
    const cr = (node as SceneNode & { cornerRadius?: number | symbol }).cornerRadius;
    zones.push({
      id: node.id,
      name: node.name || "Button",
      kind: "button",
      ...rect,
      // Caption = the text the designer actually drew inside the button (so it
      // matches Figma); fall back to the layer-name label if there's no inner
      // text. The TARGET still comes from the layer name's "> Target" part.
      label: ts.text || label,
      target,
      fill: fill && fill.a > 0.01 ? fill.hex : undefined,
      fontColor: ts.color,
      fontSize: ts.sizePt,
      cornerRadius: typeof cr === "number" ? cr : undefined,
    });
    return;
  }

  if (t === "TEXT") {
    const tn = node as TextNode;
    const chars = typeof tn.characters === "string" ? tn.characters : "";
    if (chars.trim()) {
      const fam = tn.fontName !== figma.mixed ? (tn.fontName as FontName).family : undefined;
      const style = tn.fontName !== figma.mixed ? (tn.fontName as FontName).style : "";
      const runs = styledRuns(tn); // run sizes already px->pt converted
      // Flat fallback in POINTS (used for single-style text and by consumers that
      // ignore `runs`). With mixed styles, fall back to the run covering the most
      // characters instead of a hardcoded 14.
      let flatPt = tn.fontSize !== figma.mixed ? (tn.fontSize as number) * PT_PER_PX : undefined;
      if (flatPt == null && runs) {
        flatPt = runs.reduce((a, b) => (b.text.length > a.text.length ? b : a)).fontSize;
      }
      const sizePt = flatPt ?? 14;
      const lineInfo = linesWithSizes(chars, runs, sizePt);
      const align = alignOf(tn);
      const nodeColor = solidHex(node) || "#101828";
      const nodeBold = isBoldStyle(style);

      // Capture RAW zones here (exact Figma geometry); ALL size fitting happens
      // afterwards in fitFaithfulText, which knows the whole dashboard (cards,
      // neighbors) — growing a zone here in isolation pushed text past its card
      // edge, and a floating text zone that PARTIALLY overlaps another zone gets
      // mangled by Tableau (only the overhang renders: "Con..").
      if (lineInfo.length <= 1) {
        const l = lineInfo[0] || { text: chars, size: sizePt, runs: [] };
        zones.push({
          id: node.id,
          name: node.name || "Text",
          kind: "text",
          ...rect,
          text: l.text,
          fontSize: l.size,
          fontFamily: fam,
          fontColor: nodeColor,
          bold: nodeBold,
          align,
          runs: runs && runs.length > 1 ? runs : undefined,
        });
      } else {
        // MULTI-LINE text (e.g. a KPI card's label / value / delta in one Figma
        // node): one zone PER LINE. Tableau fits a multi-line <formatted-text>
        // by whole lines and replaces the overflow with an ellipsis — on the
        // user's machine a 3-row KPI zone rendered ONLY the small first row and
        // "..", losing the big value. Single-line zones always draw their line.
        // Slice the Figma bbox proportionally to each line's font size; the
        // per-line ids share a `#L` suffix so fitFaithfulText can re-fit the
        // stack as one block.
        const sumSize = lineInfo.reduce((a, l) => a + l.size, 0) || 1;
        let yCursor = rect.y;
        for (let li = 0; li < lineInfo.length; li++) {
          const l = lineInfo[li];
          const lineH = rect.h * (l.size / sumSize);
          const lrect: Rect = { x: rect.x, y: yCursor, w: rect.w, h: lineH };
          yCursor += lineH;
          if (!l.text.trim()) continue; // blank spacer line — keeps the offset
          const lineRuns = l.runs.length > 1 ? l.runs : undefined;
          const first = l.runs[0];
          zones.push({
            id: `${node.id}#L${li}`,
            name: node.name || "Text",
            kind: "text",
            ...lrect,
            text: l.text,
            fontSize: l.size,
            fontFamily: (first && first.fontFamily) || fam,
            fontColor: (first && first.fontColor) || nodeColor,
            bold: first ? !!first.bold : nodeBold,
            align,
            runs: lineRuns,
          });
        }
      }
    }
    return; // text has no children we care about
  }

  // Opaque visuals we rasterize (icons, logos, photos, line/curve charts).
  if (hasImageFill(node) || VECTORISH.indexOf(t) !== -1) {
    zones.push({ id: node.id, name: node.name || "Image", kind: "image", ...rect });
    return; // treat as a single bitmap; don't descend into path internals
  }

  // A shape/card/bar with a fill becomes a colored `empty` zone. The 8-digit
  // fill preserves alpha so a low-opacity layer stays faint instead of rendering
  // as a solid (this is what turned the progress-bar track into a black bar).
  const fill = fillOf(node);
  const stroke = firstSolidStroke(node);
  if ((fill && fill.a > 0.01) || stroke) {
    if (FILLABLE.indexOf(t) !== -1) {
      const cr = (node as SceneNode & { cornerRadius?: number | symbol }).cornerRadius;
      zones.push({
        id: node.id,
        name: node.name || "Rectangle",
        kind: "rect",
        ...rect,
        fill: fill && fill.a > 0.01 ? fill.hex : undefined,
        cornerRadius: typeof cr === "number" ? cr : undefined,
        strokeColor: stroke?.hex,
        strokeWidth: stroke?.w,
      });
    }
  }

  // Recurse so inner text / bars / icons are captured and drawn on top.
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) walk(c as SceneNode, origin, zones);
  }
}

function isFrameLike(n: BaseNode): boolean {
  return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "COMPONENT_SET" || n.type === "INSTANCE";
}

function findFrame(): SceneNode | undefined {
  const sel = figma.currentPage.selection[0];
  if (sel) {
    if (isFrameLike(sel)) return sel;
    let p: BaseNode | null = sel.parent;
    while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
      if (isFrameLike(p)) return p as SceneNode;
      p = p.parent;
    }
    if ("children" in sel) return sel;
  }
  return figma.currentPage.children.find((n) => n.type === "FRAME" || n.type === "COMPONENT") as
    | SceneNode
    | undefined;
}

/** Faithfully transpile ONE frame into a FaithfulModel (one dashboard). */


function buildModelForFrame(frame: SceneNode): FaithfulModel {
  const bb =
    (frame as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox ?? {
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
    };
  const origin = { x: bb.x, y: bb.y };
  const zones: FaithfulZone[] = [];

  // A frame whose OWN name is SHEET/… is a single worksheet (not a dashboard of
  // its inner parts). This makes a Nav/ destination that points straight at a
  // SHEET/ frame become one Tableau worksheet we can navigate to. The whole frame
  // is the sheet zone (id === frame id, so seed maps the nav target to it).
  const framePfx = matchLayerPrefix(frame.name || "");
  if (framePfx && framePfx.role === "worksheet") {
    const { sheetName, chart } = parseSheetTag(framePfx.clean);
    const sheetBg = fillOf(frame);
    return {
      id: frame.id,
      title: frame.name || sheetName,
      width: bb.w || frame.width,
      height: bb.h || frame.height,
      background: sheetBg?.hex,
      zones: [
        { id: frame.id, name: frame.name || sheetName, kind: "sheet", x: 0, y: 0, w: bb.w || frame.width, h: bb.h || frame.height, sheetName, chart, markColor: dominantChartColor(frame) },
      ],
    };
  }

  // The frame's own background first (so it sits behind everything).
  const bg = fillOf(frame);
  if (bg && bg.a > 0.01) {
    zones.push({ id: frame.id + ":bg", name: frame.name || "Background", kind: "rect", x: 0, y: 0, w: bb.w, h: bb.h, fill: bg.hex });
  }
  if ("children" in frame) {
    for (const c of (frame as ChildrenMixin).children) walk(c as SceneNode, origin, zones);
  }

  // Fit every captured text zone (grow within its card / shrink font to fit) —
  // must run AFTER the whole walk so it can see cards and neighbors.
  const fw = bb.w || frame.width;
  const fh = bb.h || frame.height;
  try {
    fitFaithfulText(zones, fw, fh);
  } catch (e) {
    console.warn("fitFaithfulText failed:", e);
  }

  return {
    id: frame.id,
    title: frame.name || "Dashboard",
    width: fw,
    height: fh,
    background: bg?.hex,
    zones,
  };
}

export function parseFaithful(): FaithfulModel {
  const frame = findFrame();
  if (!frame) throw new Error("Select a frame (or have at least one frame on the page) to convert.");
  return buildModelForFrame(frame);
}

/**
 * Resolve a selected node to the OUTERMOST frame-like ancestor — i.e. the
 * dashboard it belongs to. A top-level frame resolves to itself; a frame NESTED
 * in another frame (e.g. a `SHEET/` card the user dragged INTO their dashboard,
 * or staged sheets dropped inside it) resolves UP to that dashboard, so the
 * dashboard — with the sheet as a child — is what gets exported, not the lone
 * card. (Previously a frame-like node returned itself, which made a selected
 * inner `SHEET/` frame export as its own stray single-sheet dashboard.)
 */
function resolveFrame(node: SceneNode): SceneNode | undefined {
  let outer: SceneNode | undefined = isFrameLike(node) ? node : undefined;
  let p: BaseNode | null = node.parent;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    if (isFrameLike(p)) outer = p as SceneNode;
    p = p.parent;
  }
  if (outer) return outer;
  // A bare group selection with no frame ancestor: transpile it as-is.
  return "children" in node ? node : undefined;
}

function bbTopLeft(n: SceneNode): { x: number; y: number } {
  const bb = (n as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox;
  return bb ? { x: bb.x, y: bb.y } : { x: n.x, y: n.y };
}

/**
 * Every distinct frame the export should cover — one Tableau dashboard each.
 * The user's SELECTION drives it: select N frames → N dashboards (LaDataViz's
 * multi-dashboard workflow). Children of the same frame collapse to that frame;
 * results are de-duplicated and ordered top-to-bottom, left-to-right (reading
 * order) so dashboards come out in a predictable sequence. With nothing usable
 * selected we fall back to the single-frame behaviour (first frame on the page).
 */
export function collectFrames(): SceneNode[] {
  const out: SceneNode[] = [];
  const seen = new Set<string>();
  for (const n of figma.currentPage.selection) {
    const f = resolveFrame(n as SceneNode);
    if (f && !seen.has(f.id)) {
      seen.add(f.id);
      out.push(f);
    }
  }
  if (out.length === 0) {
    const f = findFrame();
    if (f) out.push(f);
  }
  out.sort((a, b) => {
    const pa = bbTopLeft(a);
    const pb = bbTopLeft(b);
    return pa.y - pb.y || pa.x - pb.x;
  });
  return out;
}

/**
 * Transpile EVERY selected frame — one FaithfulModel (→ one Tableau dashboard)
 * per frame. This is the multi-dashboard entry point; `parseFaithful()` stays as
 * the single-frame transpile used by the capture tests.
 */
export function parseFaithfulAll(): FaithfulModel[] {
  const frames = collectFrames();
  if (!frames.length) throw new Error("Select one or more frames to convert.");
  return frames.map(buildModelForFrame);
}

/**
 * Build a SHEET-ONLY model from a node the designer wired a Nav/ link to: just
 * the one worksheet, no dashboard. This is what makes "navigate to a sheet" add
 * ONLY the sheet (not its enclosing dashboard). The zone id === the node id so
 * seed maps the nav target straight to this worksheet.
 */
function buildSheetOnlyModel(node: SceneNode): FaithfulModel {
  const pfx = matchLayerPrefix(node.name || "");
  const { sheetName, chart } = parseSheetTag(pfx ? pfx.clean : node.name || "Sheet");
  const bb =
    (node as SceneNode & { absoluteBoundingBox?: Rect | null }).absoluteBoundingBox ?? {
      x: node.x,
      y: node.y,
      w: node.width,
      h: node.height,
    };
  const w = bb.w || node.width || 600;
  const h = bb.h || node.height || 400;
  return {
    id: node.id,
    title: sheetName,
    sheetOnly: true,
    width: w,
    height: h,
    zones: [
      { id: node.id, name: node.name || sheetName, kind: "sheet", x: 0, y: 0, w, h, sheetName, chart, markColor: dominantChartColor(node) },
    ],
  };
}

/**
 * Resolve every Nav/ button's Figma interaction to a real export target, pulling
 * in any destination the user didn't select. For each Nav/ zone that carries a
 * `navTargetId` (the reaction's destination node):
 *   - if the destination is a SHEET (its own name is a SHEET/ layer, or it's
 *     already a placed sheet), navigate to that WORKSHEET. If its worksheet isn't
 *     already being exported, append a SHEET-ONLY model so just the sheet — NOT
 *     its whole dashboard — is added (the user's explicit ask);
 *   - otherwise navigate to the destination's enclosing DASHBOARD, appending that
 *     frame as a full dashboard model if it wasn't selected.
 * Only the directly-referenced destinations are pulled in (one level deep), so a
 * single Nav/ link can't drag the whole prototype graph into the export. Returns
 * the (possibly longer) model list. Runs in the sandbox (needs getNodeByIdAsync).
 */
export async function expandNavTargets(models: FaithfulModel[]): Promise<FaithfulModel[]> {
  const out = [...models];
  const haveFrame = new Set(out.map((m) => m.id).filter((id): id is string => !!id));
  const sheetNodeIds = new Set<string>();
  for (const m of out) for (const z of m.zones) if (z.kind === "sheet") sheetNodeIds.add(z.id);

  // Snapshot the nav zones from the USER-selected models only (one level deep).
  const navZones: FaithfulZone[] = [];
  for (const m of models) for (const z of m.zones) if (z.kind === "button" && z.navTargetId) navZones.push(z);

  for (const z of navZones) {
    let dest: BaseNode | null = null;
    try {
      dest = await figma.getNodeByIdAsync(z.navTargetId!);
    } catch (e) {
      console.warn("getNodeByIdAsync failed for nav target:", e);
      dest = null;
    }
    if (!dest || !("type" in dest)) continue;
    const destNode = dest as SceneNode;

    // SHEET destination -> navigate to a WORKSHEET. A destination is a sheet when
    // its OWN name carries a SHEET/ prefix, or it's already a placed sheet zone.
    const destPfx = matchLayerPrefix(destNode.name || "");
    const destIsSheet = (destPfx && destPfx.role === "worksheet") || sheetNodeIds.has(destNode.id);
    if (destIsSheet) {
      z.navTargetIsSheet = true;
      // If the worksheet isn't already in the export, add it ALONE (no dashboard).
      if (!sheetNodeIds.has(destNode.id) && !haveFrame.has(destNode.id)) {
        haveFrame.add(destNode.id);
        const sheetModel = buildSheetOnlyModel(destNode);
        out.push(sheetModel);
        sheetNodeIds.add(destNode.id);
      }
      continue;
    }

    // DASHBOARD destination -> navigate to the enclosing frame's window.
    const frame = resolveFrame(destNode);
    if (!frame) continue;
    z.navTargetFrameId = frame.id;
    z.navTargetIsSheet = false;
    if (!haveFrame.has(frame.id)) {
      haveFrame.add(frame.id);
      const model = buildModelForFrame(frame);
      out.push(model);
      for (const z2 of model.zones) if (z2.kind === "sheet") sheetNodeIds.add(z2.id);
    }
  }
  return out;
}


