// ---------------------------------------------------------------------------
// csv.ts — CSV parsing / type inference / sample generation (UI side).
// Lets users "bring their own data": upload a CSV, we infer field types and
// keep the rows so worksheets bind to real columns.
// ---------------------------------------------------------------------------

import type { FieldType } from "../shared/types";
import type { SpecField } from "../shared/spec";

const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d*\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?$/;

/** Parse a CSV string into a header-aware table (simple, quote-aware). */
export function parseCsvText(text: string): { header: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { header, rows };
}

function inferType(values: string[]): FieldType {
  const sample = values.filter((v) => v !== "" && v != null).slice(0, 50);
  if (sample.length === 0) return "string";
  if (sample.every((v) => INT_RE.test(v))) return "integer";
  if (sample.every((v) => INT_RE.test(v) || FLOAT_RE.test(v))) return "real";
  if (sample.every((v) => DATE_RE.test(v))) return "date";
  return "string";
}

export function inferFields(header: string[], rows: string[][]): SpecField[] {
  return header.map((name, i) => {
    const type = inferType(rows.map((r) => r[i] ?? ""));
    return {
      name: name || `Field ${i + 1}`,
      type,
      role: type === "integer" || type === "real" ? "measure" : "dimension",
    };
  });
}

export function rowsToCsv(fields: SpecField[], rows: string[][]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const header = fields.map((f) => esc(f.name)).join(",");
  const body = rows.map((r) => fields.map((_, i) => esc(r[i] ?? "")).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

/** Deterministic sample data when the user hasn't uploaded a CSV. */
export function generateSampleRows(fields: SpecField[]): string[][] {
  const cats = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
  const segs = ["North", "South", "East", "West"];
  const rows: string[][] = [];
  let v = 30;
  for (let i = 0; i < cats.length; i++) {
    v = ((v * 7 + 13) % 90) + 20;
    rows.push(
      fields.map((f, idx) => {
        if (f.type === "string") return idx === 0 ? cats[i] : segs[i % segs.length];
        if (f.type === "date") return `2026-0${(i % 9) + 1}-01`;
        return String(((v * (idx + 2)) % 120) + 15);
      })
    );
  }
  return rows;
}
