// ---------------------------------------------------------------------------
// twbImport.ts — parses an EXISTING Tableau workbook (.twbx or .twb) uploaded by
// the user, and lifts out the pieces needed to splice their REAL worksheets into
// our export (the "worksheet swap" feature): the <worksheet> XML blocks, the
// <datasource> blocks they depend on, the document-format-change-manifest
// entries those need, and the Data/Image asset bytes. Runs in the UI iframe
// (has JSZip + DOMParser).
//
// Why string-slicing, not DOM: a real Tableau worksheet/datasource is a large,
// deeply-nested, namespaced XML subtree. Re-serializing it through DOMParser is
// lossy and risks subtle corruption (attribute order, entity escaping, the
// `_.fcp.*` feature-control element names). We instead carry each block
// BYTE-FOR-BYTE and only reposition it. Tableau pretty-prints its output with
// stable 4-space indentation, so anchoring on `\n    <tag …>` … `\n    </tag>`
// extracts each top-level block exactly (worksheets/datasources never self-nest
// at that indent).
// ---------------------------------------------------------------------------

import JSZip from "jszip";
import type { ImportPayload, ImportAsset } from "../shared/spec";

/** What we hand back to the UI after parsing an upload (before any matching). */
export interface ParsedImport {
  worksheetNames: string[]; // every worksheet found, for the user to map against
  payloadFor: (names: string[]) => ImportPayload; // build a payload for a subset
}

/** Read the `name='…'` (or another attr) off a block's opening tag. */
function attrOf(openingTag: string, attr: string): string | undefined {
  const m = openingTag.match(new RegExp(`\\b${attr}='([^']*)'`));
  return m ? m[1] : undefined;
}

/**
 * Extract every top-level `<tag …>…</tag>` block at 4-space indentation.
 * Returns the verbatim slice plus the value of its `name` attribute. Non-greedy
 * to the FIRST `\n    </tag>`, which is correct because these blocks don't nest
 * at this indent in Tableau output.
 */
function extractBlocks(xml: string, tag: string): Array<{ name?: string; xml: string }> {
  const re = new RegExp(`\\n {4}<${tag}\\b[\\s\\S]*?\\n {4}</${tag}>`, "g");
  const out: Array<{ name?: string; xml: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[0].replace(/^\n/, ""); // drop the leading newline anchor
    const openEnd = block.indexOf(">");
    const openingTag = block.slice(0, openEnd + 1);
    out.push({ name: attrOf(openingTag, "name"), xml: block });
  }
  return out;
}

/** The XML inside a region delimited by a wrapper element (e.g. <datasources>). */
function sectionOf(xml: string, wrapper: string): string {
  const open = xml.indexOf(`<${wrapper}`);
  const close = xml.indexOf(`</${wrapper}>`);
  if (open < 0 || close < 0) return "";
  return xml.slice(open, close + wrapper.length + 3);
}

/** Datasource names a worksheet block references (dependencies + view ds list). */
function datasourceNamesIn(worksheetXml: string): string[] {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  const reDep = /\bdatasource='([^']+)'/g; // <datasource-dependencies datasource='X'>
  while ((m = reDep.exec(worksheetXml))) names.add(m[1]);
  const reDs = /<datasource\b[^>]*\bname='([^']+)'/g; // <datasources><datasource name='X'/>
  while ((m = reDs.exec(worksheetXml))) names.add(m[1]);
  return [...names];
}

/** Child element names inside <document-format-change-manifest> (for unioning). */
function manifestEntriesIn(xml: string): string[] {
  const sec = sectionOf(xml, "document-format-change-manifest");
  if (!sec) return [];
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  const re = /<([A-Za-z_][\w.]*)\s*\/>/g;
  while ((m = re.exec(sec))) names.add(m[1]);
  return [...names];
}

/** Locate the single `.twb` entry inside a `.twbx` zip (or the file itself). */
function findTwbName(zip: JSZip): string | undefined {
  return Object.keys(zip.files).find((n) => /\.twb$/i.test(n) && !zip.files[n].dir);
}

/**
 * Parse an uploaded workbook. Accepts a `.twbx` (zip) or a bare `.twb` XML. The
 * returned `payloadFor(names)` builds an ImportPayload carrying ONLY the chosen
 * worksheets, the datasources they need, the manifest entries those need, and
 * the asset files — so we never bloat the export with unused sheets.
 */
export async function parseImport(buf: ArrayBuffer, fileName: string): Promise<ParsedImport> {
  let twb: string;
  const assets: ImportAsset[] = [];

  if (/\.twb$/i.test(fileName)) {
    twb = new TextDecoder("utf-8").decode(new Uint8Array(buf));
  } else {
    const zip = await JSZip.loadAsync(buf);
    const twbName = findTwbName(zip);
    if (!twbName) throw new Error("No .twb workbook found inside that .twbx.");
    twb = await zip.files[twbName].async("string");
    // Carry every Data/ + Image/ asset verbatim (paths preserved so the imported
    // datasource connections — filename='Data/…' — still resolve in the output).
    for (const name of Object.keys(zip.files)) {
      const f = zip.files[name];
      if (f.dir) continue;
      if (/^Data\//i.test(name) || /^Image\//i.test(name)) {
        assets.push({ path: name, bytes: await f.async("uint8array") });
      }
    }
  }

  const worksheets = extractBlocks(twb, "worksheet").filter((w) => w.name);
  const datasources = extractBlocks(twb, "datasource").filter((d) => d.name);
  const wsByName = new Map(worksheets.map((w) => [w.name!, w.xml] as const));
  const dsByName = new Map(datasources.map((d) => [d.name!, d.xml] as const));
  const allManifest = manifestEntriesIn(twb);

  const payloadFor = (names: string[]): ImportPayload => {
    const worksheetXml = new Map<string, string>();
    const datasourceXml = new Map<string, string>();
    const neededDs = new Set<string>();
    for (const nm of names) {
      const wx = wsByName.get(nm);
      if (!wx) continue;
      worksheetXml.set(nm, wx);
      for (const dn of datasourceNamesIn(wx)) neededDs.add(dn);
    }
    for (const dn of neededDs) {
      const dx = dsByName.get(dn);
      if (dx) datasourceXml.set(dn, dx);
    }
    // Only carry assets referenced by a chosen datasource (keeps the package
    // lean); fall back to all assets if we can't tell.
    const dsBlob = [...datasourceXml.values()].join("\n");
    const usedAssets = assets.filter((a) => dsBlob.includes(a.path) || dsBlob.includes(a.path.replace(/^Data\//i, "")));
    return {
      worksheetXml,
      datasourceXml,
      manifestEntries: allManifest,
      assets: usedAssets.length ? usedAssets : assets,
    };
  };

  return { worksheetNames: worksheets.map((w) => w.name!), payloadFor };
}
