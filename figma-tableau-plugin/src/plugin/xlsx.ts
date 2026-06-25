// ---------------------------------------------------------------------------
// xlsx.ts — minimal Excel (.xlsx) reader (UI side). Lets users bring an Excel
// workbook as the data source: we unzip it with JSZip (already a dependency),
// read the first worksheet + shared strings, and return a header-aware table
// that reuses csv.ts's type inference. The generated Tableau workbook still
// embeds the data as CSV (the proven load-safe textscan path) — Excel is only
// a way to fetch fields + rows.
//
// Limitations (documented, acceptable for wireframing): reads the FIRST sheet
// only; Excel date serials come through as numbers (change the type/role in the
// Data grid if needed); formulas surface their cached value.
// ---------------------------------------------------------------------------

import JSZip from "jszip";

/** "B" -> 1, "AA" -> 26. Column letters from a cell ref like "B7". */
function colToIndex(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(el: Element): string {
  // concatenate every <t> under the element (handles rich-text runs)
  const ts = el.getElementsByTagName("t");
  if (ts.length === 0) return el.textContent ?? "";
  let s = "";
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent ?? "";
  return s;
}

function parseXml(s: string): Document {
  return new DOMParser().parseFromString(s, "application/xml");
}

/** Pick the worksheet file backing the workbook's FIRST visible sheet tab. */
async function firstSheetPath(zip: JSZip): Promise<string> {
  const wbFile = zip.file("xl/workbook.xml");
  const relFile = zip.file("xl/_rels/workbook.xml.rels");
  if (wbFile && relFile) {
    const wb = parseXml(await wbFile.async("string"));
    const rels = parseXml(await relFile.async("string"));
    const sheet = wb.getElementsByTagName("sheet")[0];
    const rid = sheet?.getAttribute("r:id") || sheet?.getAttribute("id");
    if (rid) {
      const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid);
      const target = rel?.getAttribute("Target");
      if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    }
  }
  // fallback: the conventional first sheet
  return "xl/worksheets/sheet1.xml";
}

export async function parseXlsx(buf: ArrayBuffer): Promise<{ header: string[]; rows: string[][] }> {
  const zip = await JSZip.loadAsync(buf);

  // shared strings table (cells with t="s" index into this)
  const shared: string[] = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const doc = parseXml(await ssFile.async("string"));
    const sis = doc.getElementsByTagName("si");
    for (let i = 0; i < sis.length; i++) shared.push(textOf(sis[i]));
  }

  const path = await firstSheetPath(zip);
  const sheetFile = zip.file(path) ?? zip.file("xl/worksheets/sheet1.xml");
  if (!sheetFile) throw new Error("No worksheet found in the Excel file.");
  const doc = parseXml(await sheetFile.async("string"));

  const cellValue = (c: Element): string => {
    const t = c.getAttribute("t");
    if (t === "s") {
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      return shared[parseInt(v, 10)] ?? "";
    }
    if (t === "inlineStr") return textOf(c);
    if (t === "str") return c.getElementsByTagName("v")[0]?.textContent ?? "";
    if (t === "b") return c.getElementsByTagName("v")[0]?.textContent === "1" ? "TRUE" : "FALSE";
    return c.getElementsByTagName("v")[0]?.textContent ?? "";
  };

  const table: string[][] = [];
  const rowEls = doc.getElementsByTagName("row");
  for (let i = 0; i < rowEls.length; i++) {
    const cells = rowEls[i].getElementsByTagName("c");
    const arr: string[] = [];
    for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      const ci = colToIndex(c.getAttribute("r") ?? "");
      while (arr.length < ci) arr.push("");
      arr[ci] = cellValue(c).trim();
    }
    table.push(arr);
  }

  // drop fully-empty leading rows, then split header / body
  const nonEmpty = table.filter((r) => r.some((v) => v !== ""));
  if (nonEmpty.length === 0) return { header: [], rows: [] };
  const header = nonEmpty[0].map((h, i) => h || `Field ${i + 1}`);
  const rows = nonEmpty.slice(1).map((r) => {
    const out = header.map((_, i) => r[i] ?? "");
    return out;
  });
  return { header, rows };
}
