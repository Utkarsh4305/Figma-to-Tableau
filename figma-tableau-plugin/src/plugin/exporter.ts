// ---------------------------------------------------------------------------
// exporter.ts — orchestration (UI side). Ties the WorkbookSpec model, the
// Tableau XML generator, and the .twbx packager together, with validation.
// ---------------------------------------------------------------------------

import type { WorkbookSpec } from "../shared/spec";
import { generateWorkbookXml } from "./workbookGenerator";
import { rowsToCsv } from "./csv";
import { buildTwbxBlob, downloadTwbx, DATA_DIR } from "./twbxBuilder";
import type { ImageAsset, RawAsset } from "./twbxBuilder";

/** Gather every PNG referenced by the spec (logo zones + dashboard backgrounds). */
export function collectImageAssets(spec: WorkbookSpec): ImageAsset[] {
  const byFile = new Map<string, string>();
  for (const d of spec.dashboards) {
    if (d.backgroundImage && d.backgroundImageFile) byFile.set(d.backgroundImageFile, d.backgroundImage);
    for (const z of d.zones) {
      if (z.kind === "image" && z.image && z.imageFile) byFile.set(z.imageFile, z.image);
    }
  }
  return [...byFile.entries()].map(([file, base64]) => ({ file, base64 }));
}

// --- spec-driven path (the editor) ------------------------------------------

export interface ExportResult {
  twbXml: string;
  csvFile: string;
  csvText: string;
  worksheetCount: number;
  zoneCount: number;
  warnings: string[];
}

/**
 * Guarantee unique worksheet names so an export NEVER blocks or breaks on
 * duplicates. Tableau maps windows/viewpoints by worksheet name, so two sheets
 * called "Sales" corrupt the workbook; LaDataViz refuses to export in that case.
 * We instead auto-rename ("Sales" → "Sales 2", "Sales 3", …) and carry on.
 *
 * No-op (returns the SAME object) when names are already unique — the faithful
 * path already dedupes at creation, so its output stays byte-identical. Sheet/
 * filter zone `worksheet` references are remapped positionally (zones are emitted
 * in worksheet order) so each zone still points at its own renamed worksheet.
 *
 * Import-aware: a swapped-in worksheet keeps its REAL name (it's matched by name,
 * and its XML is spliced verbatim). We seed `used` with the imported names so a
 * generated demo sheet can never (a) collide with an imported window name, nor
 * (b) be the one that gets renamed out from under a SHEET/ zone — i.e. the swap
 * changes the sheet BY NAME and dedupe never silently repoints a zone at some
 * other (renamed) sheet. Imported names carry no queue entry, so a zone bound to
 * an imported sheet is returned unchanged by `remap`.
 */
export function dedupeWorksheetNames(spec: WorkbookSpec): WorkbookSpec {
  const importedNames = spec.imports ? [...spec.imports.worksheetXml.keys()] : [];
  const used = new Set<string>(importedNames);
  const queues = new Map<string, string[]>(); // original name -> assigned names, in order
  let changed = false;
  const worksheets = spec.worksheets.map((ws) => {
    let name = ws.name;
    if (used.has(name)) {
      let i = 2;
      while (used.has(`${ws.name} ${i}`)) i++;
      name = `${ws.name} ${i}`;
      changed = true;
    }
    used.add(name);
    const q = queues.get(ws.name) ?? [];
    q.push(name);
    queues.set(ws.name, q);
    return name === ws.name ? ws : { ...ws, name };
  });
  if (!changed) return spec;
  const cursor = new Map<string, number>();
  const remap = (original: string): string => {
    const q = queues.get(original);
    if (!q || q.length === 0) return original;
    const i = cursor.get(original) ?? 0;
    cursor.set(original, i + 1);
    return q[Math.min(i, q.length - 1)];
  };
  const dashboards = spec.dashboards.map((d) => ({
    ...d,
    zones: d.zones.map((z) =>
      (z.kind === "sheet" || z.kind === "filter") && z.worksheet
        ? { ...z, worksheet: remap(z.worksheet) }
        : z
    ),
  }));
  return { ...spec, worksheets, dashboards };
}

/** Generate the .twb XML from the editable WorkbookSpec, with validation. */
export function generateSpecWorkbook(spec: WorkbookSpec): ExportResult {
  // Worksheet swap: when an imported (real) worksheet replaces a SHEET/ name,
  // drop the generated demo worksheet of that name so the two don't collide on
  // the windows mapping. The dashboard zone keeps the name → now resolves to the
  // imported sheet (its XML is spliced in by the generator).
  if (spec.imports && spec.imports.worksheetXml.size) {
    const imported = spec.imports.worksheetXml;
    spec = { ...spec, worksheets: spec.worksheets.filter((w) => !imported.has(w.name)) };
  }
  spec = dedupeWorksheetNames(spec); // auto-rename any duplicate sheet names
  const twbXml = generateWorkbookXml(spec, DATA_DIR);
  const warnings = validateTwb(
    twbXml,
    spec.worksheets.map((w) => w.name)
  );
  // soft checks specific to the editor
  if (spec.worksheets.length === 0) warnings.push("No worksheets defined.");
  if (spec.includeActions && spec.actions.some((a) => a.kind === "filter"))
    warnings.push("Filter actions write a sheet_link group — confirm the workbook opens in Tableau.");

  const zoneCount = spec.dashboards.reduce((n, d) => n + d.zones.length, 0);
  return {
    twbXml,
    csvFile: spec.data.fileName,
    csvText: rowsToCsv(spec.data.fields, spec.data.rows),
    worksheetCount: spec.worksheets.length,
    zoneCount,
    warnings,
  };
}

/** Imported Data/Image files (the worksheet-swap feature), if any. */
function importedRawAssets(spec: WorkbookSpec): RawAsset[] {
  return spec.imports ? spec.imports.assets.map((a) => ({ path: a.path, bytes: a.bytes })) : [];
}

/** Generate + package + download a WorkbookSpec. */
export async function exportSpecTwbx(spec: WorkbookSpec): Promise<ExportResult> {
  const res = generateSpecWorkbook(spec);
  await downloadTwbx({
    workbookName: spec.workbookName || "Workbook",
    twbXml: res.twbXml,
    csvFile: res.csvFile,
    csvText: res.csvText,
    images: collectImageAssets(spec),
    rawAssets: importedRawAssets(spec),
  });
  return res;
}

/** Build the WorkbookSpec .twbx Blob without downloading (tests). */
export async function buildSpecBlob(spec: WorkbookSpec): Promise<Blob> {
  const res = generateSpecWorkbook(spec);
  return buildTwbxBlob({
    workbookName: spec.workbookName || "Workbook",
    twbXml: res.twbXml,
    csvFile: res.csvFile,
    csvText: res.csvText,
    images: collectImageAssets(spec),
    rawAssets: importedRawAssets(spec),
  });
}

/**
 * Cheap structural checks. These mirror the failure modes documented for
 * Tableau 2026.2 — XML well-formedness PLUS the few invariants that cause the
 * opaque "Internal Error 501CF476" rather than a schema error. They do NOT
 * guarantee the workbook opens (only Tableau can confirm that), but they catch
 * the regressions we know about.
 */
export function validateTwb(xml: string, worksheetNames: string[]): string[] {
  const warnings: string[] = [];

  // 1. Well-formedness (DOMParser is available in the UI iframe).
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) throw new Error("Generated XML is not well-formed: " + err.textContent);
  }

  // 2. The <windows> section is mandatory (its absence => 501CF476).
  if (!/<windows[\s>]/.test(xml)) {
    throw new Error("Generated .twb is missing the required <windows> section.");
  }

  // 2b. <shelf-sorts> is NOT in the 2026.2 <view> content model and triggers
  // load error D2E8DA72 ("no declaration found for element 'shelf-sorts'").
  if (/<shelf-sorts[\s>]/.test(xml)) {
    throw new Error("Generated .twb contains <shelf-sorts>, which Tableau 2026.2 rejects (D2E8DA72).");
  }

  // 2c. The <windows> section enforces a UNIQUE-identity constraint: duplicate
  // window names OR duplicate <simple-id> uuids inside it trigger D2E8DA72
  // ("element 'windows' declares duplicate identity constraint unique values").
  // This bites when several selected Figma frames share a name (e.g. multiple
  // "Data Metrics" dashboards). Catch it here rather than ship an unloadable file.
  const winsMatch = xml.match(/<windows[\s\S]*?<\/windows>/);
  if (winsMatch) {
    const wins = winsMatch[0];
    const winNames = [...wins.matchAll(/<window class='(?:worksheet|dashboard)'[^>]*name='([^']*)'/g)].map((m) => m[1]);
    const dupName = winNames.find((n, i) => winNames.indexOf(n) !== i);
    if (dupName != null) {
      throw new Error(`Duplicate window name "${dupName}" — two dashboards/worksheets share a name; Tableau rejects this (D2E8DA72). Rename the colliding frame(s).`);
    }
    const winUuids = [...wins.matchAll(/<simple-id uuid='([^']+)'/g)].map((m) => m[1]);
    const dupUuid = winUuids.find((u, i) => winUuids.indexOf(u) !== i);
    if (dupUuid != null) {
      throw new Error(`Duplicate window simple-id ${dupUuid} — Tableau rejects this (D2E8DA72).`);
    }
  }

  // 3. Every worksheet must have a matching window + at least be referenced.
  for (const n of worksheetNames) {
    const needle = `class='worksheet' name='${n
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/'/g, "&apos;")}'`;
    if (!xml.includes(needle)) {
      warnings.push(`Worksheet "${n}" has no matching <window> — it may not render.`);
    }
  }

  // 4. Duplicate worksheet names break the windows/viewpoints mapping.
  const seen = new Set<string>();
  for (const n of worksheetNames) {
    if (seen.has(n)) warnings.push(`Duplicate worksheet name "${n}" — names must be unique.`);
    seen.add(n);
  }

  return warnings;
}
