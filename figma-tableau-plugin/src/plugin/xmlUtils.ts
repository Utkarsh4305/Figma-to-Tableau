// ---------------------------------------------------------------------------
// xmlUtils.ts — shared utility functions for workbook XML generation.
// ---------------------------------------------------------------------------

import type { FieldType } from "../shared/types";
import type { SpecField, WorkbookSpec } from "../shared/spec";

export interface GenField {
  display: string;
  local: string;
  base: string;
  type: FieldType;
  role: "dimension" | "measure";
  isCalc: boolean;
}

export function uid(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw =
    g && typeof g.randomUUID === "function"
      ? g.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
  return `{${raw.toUpperCase()}}`;
}

export function hex32(): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += ((Math.random() * 16) | 0).toString(16);
  return s.toUpperCase();
}

export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");
}

export function hasNavAction(spec: WorkbookSpec): boolean {
  return spec.actions.some((a) => a.kind === "navigate");
}

export function dimInstance(base: string): string {
  return `[none:${base}:nk]`;
}

export function measInstance(base: string, aggPfx: string): string {
  return `[${aggPfx}:${base}:qk]`;
}

export function instanceLine(f: GenField, derivation: string, instName: string): string {
  const pivotType = f.role === "measure" ? "quantitative" : "nominal";
  return `            <column-instance column='${f.local}' derivation='${derivation}' name='${instName}' pivot='key' type='${pivotType}' />\n`;
}

export function filterBlock(dsName: string, f: GenField, members: string[]): string {
  const inst = dimInstance(f.base);
  const o: string[] = [];
  o.push(`          <filter class='categorical' column='[${dsName}].${inst}'>\n`);
  o.push(
    "            <groupfilter function='union' user:ui-domain='database' user:ui-enumeration='inclusive' user:ui-marker='enumerate'>\n"
  );
  for (const m of members)
    o.push(`              <groupfilter function='member' level='${inst}' member='&quot;${esc(m)}&quot;' />\n`);
  o.push("            </groupfilter>\n");
  o.push("          </filter>\n");
  return o.join("");
}

export function relationColumns(indent: string, cols: SpecField[]): string {
  const o: string[] = [
    `${indent}<columns character-set='UTF-8' header='yes' locale='en_US' separator=','>\n`,
  ];
  cols.forEach((c, i) => {
    o.push(`${indent}  <column datatype='${c.type}' name='${esc(c.name)}' ordinal='${i}' />\n`);
  });
  o.push(`${indent}</columns>\n`);
  return o.join("");
}

export function clampN(v: number, fw: number): number {
  if (!Number.isFinite(v) || !Number.isFinite(fw) || fw <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100000, (v / fw) * 100000)));
}

export const WINDOWS_SAFE_FONTS = new Set([
  "segoe ui", "segoe ui semibold", "segoe ui light", "arial", "arial black",
  "calibri", "cambria", "candara", "consolas", "constantia", "corbel",
  "courier new", "franklin gothic medium", "gabriola", "georgia", "impact",
  "lucida console", "lucida sans unicode", "palatino linotype", "tahoma",
  "times new roman", "trebuchet ms", "verdana",
]);

export function safeFont(family: string | undefined): string {
  if (!family) return "Segoe UI";
  return WINDOWS_SAFE_FONTS.has(family.trim().toLowerCase()) ? family : "Segoe UI";
}

export function tableauType(t: FieldType): string {
  return t === "string" ? "nominal" : t === "date" ? "ordinal" : "quantitative";
}
