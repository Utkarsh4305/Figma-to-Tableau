// ---------------------------------------------------------------------------
// exporter.ts — orchestration (UI side). Ties the WorkbookSpec model, the
// Tableau XML generator, and the .twbx packager together, with validation.
// ---------------------------------------------------------------------------

import type { WorkbookSpec, ImportPayload } from "../shared/spec";
import { generateWorkbookXml } from "./workbookGenerator";
import { rowsToCsv } from "./csv";
import { buildTwbxBlob, downloadTwbx, DATA_DIR } from "./twbxBuilder";
import type { ImageAsset, RawAsset } from "./twbxBuilder";

/** The slice of a parsed import the swap needs (matches twbImport's ParsedImport). */
export interface SwapSource {
  worksheetNames: string[];
  payloadFor: (names: string[]) => ImportPayload;
}

export interface SwapResult {
  swapped: number; // how many imported worksheets were spliced in
  unmatched: string[]; // SHEET/ placeholder names that matched no imported worksheet
}

/** Normalize a worksheet/placeholder name for tolerant matching: trimmed,
 * case-folded, and inner whitespace collapsed. So a Figma layer "SHEET/ Query
 * Aging " matches an imported worksheet "Query Aging" (and "query aging"). */
function normName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Rename a spliced `<worksheet name='from'>` block to `name='to'` (opening tag
 * only — a worksheet never references its own name elsewhere in its XML). Both
 * names are the REAL (decoded) worksheet names; inside the XML the name is stored
 * XML-escaped, so we escape `from` to match the opening tag and escape `to` so the
 * result stays consistent with how the generator escapes the zone/window refs. */
function xmlEscapeName(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&apos;");
}
function renameWorksheetXml(xml: string, from: string, to: string): string {
  const escFrom = xmlEscapeName(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return xml.replace(new RegExp(`(<worksheet\\b[^>]*\\bname=')${escFrom}(')`), `$1${xmlEscapeName(to)}$2`);
}

/**
 * Worksheet swap: replace placed SHEET/ demo charts with the user's REAL imported
 * worksheets, matched by BASE name. Mutates `spec` in place (sets `spec.imports`,
 * repoints zones, prunes orphaned demo worksheets, drops imported filter cards).
 *
 * Matching by base name is the fix for "the same sheet placed on several
 * dashboards shows different sheets": seed dedupes repeats to "X"/"X 2", so only
 * "X" matched the import before — every other copy stayed a demo. Here we repoint
 * EVERY copy at the imported sheet:
 *   - the FIRST copy on each dashboard points at the one imported worksheet "X";
 *   - a REPEAT on the SAME dashboard can't reuse that name (Tableau won't load two
 *     dashboard zones bound to one worksheet — duplicate viewpoint identity), so
 *     it gets a renamed CLONE of the imported worksheet ("X (copy)", sharing the
 *     imported datasource) — real data on every copy instead of a leftover demo.
 */
export function applyImportedSwap(spec: WorkbookSpec, imp: SwapSource): SwapResult {
  // Tolerant lookup: normalized placeholder name -> the REAL imported worksheet
  // name (case/whitespace differences must not silently fall back to a demo).
  const importedByNorm = new Map<string, string>();
  for (const n of imp.worksheetNames) if (!importedByNorm.has(normName(n))) importedByNorm.set(normName(n), n);
  // Nav button-worksheets are also `sheet` zones — never treat them as swap targets.
  const navWs = new Set(spec.worksheets.filter((w) => w.navButton).map((w) => w.name));

  const swappedSet = new Set<string>(); // REAL imported names matched
  const unmatched = new Set<string>();
  // Repeats on the SAME dashboard that need a renamed clone of the imported sheet.
  const cloneNeeds: Array<{ z: { worksheet?: string; showTitle?: boolean }; realName: string }> = [];
  for (const d of spec.dashboards) {
    const usedOnDash = new Set<string>(); // real imported names already placed here
    for (const z of d.zones) {
      if (z.kind !== "sheet" || !z.worksheet || navWs.has(z.worksheet)) continue;
      const baseName = z.baseSheetName ?? z.worksheet;
      const real = importedByNorm.get(normName(baseName));
      if (!real) {
        unmatched.add(baseName);
        continue;
      }
      swappedSet.add(real);
      if (usedOnDash.has(real)) {
        // a second+ placement of the same imported sheet on this dashboard
        cloneNeeds.push({ z, realName: real });
        continue;
      }
      z.worksheet = real; // point this copy at the one imported sheet (REAL name)
      z.showTitle = true; // show the imported sheet's real title bar
      usedOnDash.add(real);
    }
  }
  // Remove FILTER/ zones bound to the swapped sheets — Tableau provides its
  // own filter UI, so the Figma-placed filter cards are redundant after swap.
  for (const d of spec.dashboards) {
    d.zones = d.zones.filter((z) => !(z.kind === "filter" && z.worksheet && swappedSet.has(z.worksheet)));
  }
  const matches = [...swappedSet];
  if (matches.length === 0) return { swapped: 0, unmatched: [...unmatched] };

  spec.imports = imp.payloadFor(matches);

  // Materialize a renamed clone of the imported worksheet for each same-dashboard
  // repeat, so every placement shows the user's REAL sheet (not a demo). Clones
  // are spliced verbatim (with the name changed) and bound to the same imported
  // datasource the original references.
  const wsXml = spec.imports.worksheetXml;
  const usedNames = new Set<string>([...wsXml.keys(), ...spec.worksheets.map((w) => w.name)]);
  for (const { z, realName } of cloneNeeds) {
    const src = wsXml.get(realName);
    if (!src) continue; // shouldn't happen — leave the demo in place
    let copyName = `${realName} (copy)`;
    for (let i = 2; usedNames.has(copyName); i++) copyName = `${realName} (copy ${i})`;
    usedNames.add(copyName);
    wsXml.set(copyName, renameWorksheetXml(src, realName, copyName));
    z.worksheet = copyName;
    z.showTitle = true;
  }

  // Drop demo worksheets no longer referenced by any zone (the deduped "X 2"
  // copies we just repointed away). Keep button-worksheets; the generator itself
  // replaces the base-name demo with the imported XML.
  const referenced = new Set<string>();
  for (const d of spec.dashboards)
    for (const z of d.zones)
      if (z.kind === "sheet" && z.worksheet) referenced.add(z.worksheet);
  spec.worksheets = spec.worksheets.filter((w) => w.navButton || referenced.has(w.name));

  return { swapped: matches.length, unmatched: [...unmatched] };
}

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
  const allWsNames = [
    ...spec.worksheets.map((w) => w.name),
    ...(spec.imports ? [...spec.imports.worksheetXml.keys()] : []),
  ];
  const warnings = validateTwb(twbXml, allWsNames);
  // soft checks specific to the editor
  if (spec.worksheets.length === 0 && !(spec.imports && spec.imports.worksheetXml.size))
    warnings.push("No worksheets defined.");
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

  // 2c. The native <button> dashboard-object is rejected by the user's Tableau
  // ("no declaration found for element 'button'", D2E8DA72) in a floating
  // dashboard. Navigation is done with <nav-action> + button-worksheets instead;
  // guard so an accidental native button never ships an unloadable file again.
  if (/<button[\s>]/.test(xml)) {
    throw new Error("Generated .twb contains a native <button> object, which this Tableau rejects (D2E8DA72). Navigation must use <nav-action>.");
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

  // 2d. The <worksheets> section also enforces a unique-identity constraint:
  // duplicate worksheet names OR duplicate <simple-id> uuids inside it trigger
  // D2E8DA72 ("element 'worksheets' declares duplicate identity constraint").
  // This is separate from the <windows> check — both must pass.
  const wsMatch = xml.match(/<worksheets[\s\S]*?<\/worksheets>/);
  if (wsMatch) {
    const wsec = wsMatch[0];
    const wsNames = [...wsec.matchAll(/<worksheet\b[^>]*name='([^']*)'/g)].map((m) => m[1]);
    const dupWsName = wsNames.find((n, i) => wsNames.indexOf(n) !== i);
    if (dupWsName != null) {
      throw new Error(`Duplicate worksheet name "${dupWsName}" in <worksheets> — Tableau rejects this (D2E8DA72).`);
    }
    const wsUuids = [...wsec.matchAll(/<simple-id uuid='([^']+)'/g)].map((m) => m[1]);
    const dupWsUuid = wsUuids.find((u, i) => wsUuids.indexOf(u) !== i);
    if (dupWsUuid != null) {
      throw new Error(`Duplicate worksheet simple-id ${dupWsUuid} — Tableau rejects this (D2E8DA72).`);
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

  // 4. Duplicate worksheet names break the windows/viewpoints mapping.  The
  // XML-level check (2d) catches this from the generated XML; the spec-level
  // check here provides a clearer error message that points at the source.
  const seen = new Set<string>();
  for (const n of worksheetNames) {
    if (seen.has(n)) throw new Error(`Duplicate worksheet name "${n}" — names must be unique. Rename the colliding SHEET/ layer(s) in Figma.`);
    seen.add(n);
  }

  return warnings;
}
