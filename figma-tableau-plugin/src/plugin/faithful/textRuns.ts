// ---------------------------------------------------------------------------
// textRuns.ts — styled text segments, line splitting, alignment.
// ---------------------------------------------------------------------------

import type { FaithfulTextRun } from "../../shared/types";
import { PT_PER_PX, toHex, isBoldStyle } from "./colorGeometry";

/**
 * Split a text layer into styled runs (size / font / color spans). A KPI card
 * is frequently ONE text node mixing an 11pt label with a 20pt value; flattening
 * that to a single fallback size makes the big number render tiny. Reading the
 * per-character styles preserves each run's real size — exactly how the
 * LaDataViz reference emits separate sized <run>s.
 */
export function styledRuns(tn: TextNode): FaithfulTextRun[] | undefined {
  const getSeg = (tn as unknown as {
    getStyledTextSegments?: (fields: string[]) => Array<{
      characters: string;
      fontSize: number;
      fontName: FontName | symbol;
      fills: readonly Paint[] | symbol;
    }>;
  }).getStyledTextSegments;
  if (typeof getSeg !== "function") return undefined;
  let segs: ReturnType<NonNullable<typeof getSeg>>;
  try {
    segs = getSeg.call(tn, ["fontSize", "fontName", "fills"]);
  } catch (e) {
    console.warn("getStyledTextSegments failed:", e);
    return undefined;
  }
  if (!segs || segs.length <= 1) return undefined;
  const runs: FaithfulTextRun[] = [];
  for (const s of segs) {
    if (!s.characters) continue;
    const fam = s.fontName !== figma.mixed ? (s.fontName as FontName).family : undefined;
    const style = s.fontName !== figma.mixed ? (s.fontName as FontName).style : "";
    let color: string | undefined;
    if (Array.isArray(s.fills)) {
      const solid = s.fills.find((f) => f.type === "SOLID" && f.visible !== false) as
        | SolidPaint
        | undefined;
      if (solid) color = toHex(solid.color);
    }
    runs.push({
      text: s.characters,
      fontSize: typeof s.fontSize === "number" ? s.fontSize * PT_PER_PX : undefined,
      fontFamily: fam,
      fontColor: color,
      bold: isBoldStyle(style),
    });
  }
  return runs.length > 1 ? runs : undefined;
}

/** One visual line of a text layer: its text, the LARGEST font size (pt) on it,
 * and its styled runs (newline-free — the line split consumes the breaks). */
export interface TextLine {
  text: string;
  size: number;
  runs: FaithfulTextRun[];
}

/**
 * Break the text into its visual lines. Each line becomes its OWN text zone
 * (see the TEXT branch in walk): Tableau renders a single-line zone reliably,
 * but a multi-line <formatted-text> gets cut down to whatever lines fully fit —
 * on the user's Tableau a 3-row KPI zone showed only the small first row and an
 * ellipsis, swallowing the big value entirely. Splitting per line sidesteps
 * Tableau's multi-line fitting completely. Uses the styled runs when present
 * (mixed-size KPI text), else the flat size.
 */
export function linesWithSizes(
  chars: string,
  runs: FaithfulTextRun[] | undefined,
  flatPt: number
): TextLine[] {
  const clean = chars.replace(/\n+$/, "");
  if (!runs || runs.length === 0) {
    return (clean ? clean.split("\n") : [""]).map((text) => ({ text, size: flatPt, runs: [] }));
  }
  const lines: TextLine[] = [{ text: "", size: 0, runs: [] }];
  for (const r of runs) {
    const size = r.fontSize ?? flatPt;
    const parts = r.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push({ text: "", size: 0, runs: [] });
      const cur = lines[lines.length - 1];
      if (parts[i]) {
        cur.text += parts[i];
        cur.size = Math.max(cur.size, size);
        cur.runs.push({ ...r, text: parts[i] });
      }
    }
  }
  if (lines.length > 1 && lines[lines.length - 1].text === "") lines.pop();
  return lines.map((l) => ({ ...l, size: l.size || flatPt }));
}

export function alignOf(node: TextNode): number {
  switch (node.textAlignHorizontal) {
    case "CENTER":
      return 1;
    case "RIGHT":
      return 2;
    default:
      return 0;
  }
}
