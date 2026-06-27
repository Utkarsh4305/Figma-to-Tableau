// ---------------------------------------------------------------------------
// twbxBuilder.ts — packages a .twb + its data CSV into a .twbx (a ZIP) and
// triggers a browser download. Runs in the UI iframe (needs Blob/JSZip/DOM).
//
// .twbx layout produced here:
//   <WorkbookName>.twb        (workbook XML, at the zip root)
//   Data/<csvFile>            (the placeholder data source)
//   Image/<file>              (logos / background images, when present)
//
// NOTE: the .twb recipe itself is confirmed to open in Tableau 2026.2, but
// .twbx *packaging* (bundled-CSV path resolution) has not yet been verified on
// the target machine. The textscan connection's `directory` is set to the
// package-relative folder DATA_DIR below to match where the CSV is stored.
// ---------------------------------------------------------------------------

import JSZip from "jszip";
import { saveAs } from "file-saver";

/** Package-relative folder the .twb connection points at (see note above). */
export const DATA_DIR = "Data";
/** Package-relative folder bitmap zones (logos / backgrounds) resolve against. */
export const IMAGE_DIR = "Image";

/** A binary image asset (PNG) to embed under Image/ in the package. */
export interface ImageAsset {
  file: string; // filename only, e.g. "logo.png"
  base64: string; // PNG bytes, base64-encoded (no data: prefix)
}

/** A raw binary file lifted from an imported .twbx, stored at its exact path. */
export interface RawAsset {
  path: string; // package-relative, e.g. "Data/DM/file.xlsx" — preserved verbatim
  bytes: Uint8Array;
}

export interface TwbxParts {
  workbookName: string; // without extension
  twbXml: string;
  csvFile: string; // e.g. "figma_sample.csv"
  csvText: string;
  images?: ImageAsset[]; // bitmap zones referenced by the .twb
  rawAssets?: RawAsset[]; // imported Data/Image files (the worksheet-swap feature)
}

/** Build the .twbx as a Blob (no download) — useful for tests/inspection. */
export async function buildTwbxBlob(parts: TwbxParts): Promise<Blob> {
  const zip = new JSZip();
  const safeName = parts.workbookName.replace(/[\\/:*?"<>|]+/g, "_") || "Workbook";
  zip.file(`${safeName}.twb`, parts.twbXml);
  zip.folder(DATA_DIR)!.file(parts.csvFile, parts.csvText);
  if (parts.images && parts.images.length) {
    const img = zip.folder(IMAGE_DIR)!;
    for (const a of parts.images) img.file(a.file, a.base64, { base64: true });
  }
  // Imported data/image files keep their EXACT package path so the imported
  // datasource connections (filename='Data/…') resolve. Our own sample CSV lives
  // at Data/<csvFile>, a different path, so they never collide.
  if (parts.rawAssets && parts.rawAssets.length) {
    for (const a of parts.rawAssets) zip.file(a.path, a.bytes);
  }
  // DEFLATE keeps the package small; Tableau accepts both stored and deflated.
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/octet-stream",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/** Build the .twbx and prompt the browser to download it. */
export async function downloadTwbx(parts: TwbxParts): Promise<void> {
  const blob = await buildTwbxBlob(parts);
  const safeName = parts.workbookName.replace(/[\\/:*?"<>|]+/g, "_") || "Workbook";
  saveAs(blob, `${safeName}.twbx`);
}
