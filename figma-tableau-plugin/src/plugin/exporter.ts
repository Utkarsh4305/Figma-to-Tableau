// ---------------------------------------------------------------------------
// exporter.ts — orchestration (UI side). Ties the mapping engine, the Tableau
// XML generator, and the .twbx packager together, with light validation.
// ---------------------------------------------------------------------------

import type { DashboardModel, ExportSettings, MappingRow } from "../shared/types";
import type { WorkbookSpec } from "../shared/spec";
import { buildTableauModel } from "./mapper";
import { generateTwb } from "./tableauGenerator";
import { generateWorkbookXml } from "./workbookGenerator";
import { rowsToCsv } from "./csv";
import { buildTwbxBlob, downloadTwbx, DATA_DIR } from "./twbxBuilder";
import type { ImageAsset } from "./twbxBuilder";

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

export interface ExportResult {
  twbXml: string;
  worksheetCount: number;
  zoneCount: number;
  warnings: string[];
}

/**
 * Generate the .twb XML for a model + settings + mapping overrides, running
 * the cheap structural validations the project relies on. Throws on a hard
 * failure; returns warnings for soft issues.
 */
export function generateWorkbook(
  model: DashboardModel,
  settings: ExportSettings,
  overrides: MappingRow[]
): ExportResult & { csvFile: string; csvText: string } {
  const tModel = buildTableauModel(model, settings, overrides);
  const twbXml = generateTwb(tModel, DATA_DIR);
  const warnings = validateTwb(twbXml, tModel.worksheets.map((w) => w.name));

  return {
    twbXml,
    csvFile: tModel.csvFile,
    csvText: tModel.csvText,
    worksheetCount: tModel.worksheets.length,
    zoneCount: tModel.dashboard.zones.length,
    warnings,
  };
}

/** Generate + package + download in one call. */
export async function exportTwbx(
  model: DashboardModel,
  settings: ExportSettings,
  overrides: MappingRow[]
): Promise<ExportResult> {
  const res = generateWorkbook(model, settings, overrides);
  await downloadTwbx({
    workbookName: settings.workbookName || model.title || "Workbook",
    twbXml: res.twbXml,
    csvFile: res.csvFile,
    csvText: res.csvText,
  });
  return res;
}

/** Build the .twbx Blob without downloading (used by tests). */
export async function buildBlob(
  model: DashboardModel,
  settings: ExportSettings,
  overrides: MappingRow[]
): Promise<Blob> {
  const res = generateWorkbook(model, settings, overrides);
  return buildTwbxBlob({
    workbookName: settings.workbookName || model.title || "Workbook",
    twbXml: res.twbXml,
    csvFile: res.csvFile,
    csvText: res.csvText,
  });
}

// --- spec-driven path (the editor) ------------------------------------------

export interface SpecExportResult extends ExportResult {
  csvFile: string;
  csvText: string;
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
 */
export function dedupeWorksheetNames(spec: WorkbookSpec): WorkbookSpec {
  const used = new Set<string>();
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
export function generateSpecWorkbook(spec: WorkbookSpec): SpecExportResult {
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

/** Generate + package + download a WorkbookSpec. */
export async function exportSpecTwbx(spec: WorkbookSpec): Promise<SpecExportResult> {
  const res = generateSpecWorkbook(spec);
  await downloadTwbx({
    workbookName: spec.workbookName || "Workbook",
    twbXml: res.twbXml,
    csvFile: res.csvFile,
    csvText: res.csvText,
    images: collectImageAssets(spec),
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
