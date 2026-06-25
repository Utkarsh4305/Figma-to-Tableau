# Figma → Tableau (.twbx) plugin

A production-ready Figma plugin that analyzes a selected dashboard frame and
generates a downloadable **Tableau Packaged Workbook (`.twbx`)** — bridging UI
design and Tableau dashboard development.

The generated `.twb` follows the exact construction recipe that is **confirmed
to open in Tableau 2026.2** (workbook version `18.1`), ported from this repo's
proven Python generator. That recipe — the mandatory `<windows>` section, the
2026 object-model data source, `RT2026` type codes, plain `rows`/`cols` pills,
and pane-level color encoding — is what separates a workbook that opens from
the opaque *"Internal Error 501CF476"*.

---

## What it does

1. **Analyze** the selected Figma frame → a structured `DashboardModel`
   (frames, text, charts, KPI cards, filters, colors, fonts, layout).
2. **Detect** dashboard parts heuristically (KPI cards, charts, tables,
   filters, headers/footers, nav) from layer names, structure, and size.
3. **Map** each element to a Tableau object (configurable in the UI).
4. **Generate** valid Tableau XML (`.twb`) with a placeholder data source.
5. **Package** the `.twb` + placeholder CSV into a `.twbx` and download it.

### Layer naming convention (LaDataViz-style)

Prefix a Figma layer name to map it explicitly — the prefix wins over the
heuristics, and the text after the slash becomes the Tableau object's name:

| Prefix              | Becomes                          |
| ------------------- | -------------------------------- |
| `SHEET/Sales`       | Worksheet named **Sales**        |
| `IMAGE/` `IMG/` `LOGO/` | Image (bitmap) zone          |
| `BUTTON/Next`       | Navigation button zone           |
| `FILTER/Region`     | Filter placeholder               |
| `TEXT/Title`        | Text zone                        |
| `CONTAINER/Row`     | Layout container                 |

Unprefixed layers are still classified heuristically (below).

### Element mapping

| Figma element            | Tableau object                         |
| ------------------------ | -------------------------------------- |
| Chart mockup (bar/line/…)| Worksheet (`Bar`/`Line` mark)          |
| KPI card                 | Text zone (label + value)              |
| Filter panel             | Text zone placeholder                  |
| Heading / label (TEXT)   | Text zone                              |
| Image fill / logo        | **Image (bitmap) zone**, embedded under `Image/` |
| Rectangle / Auto Layout  | Layout container / styled zone         |
| Dashboard frame          | Tableau dashboard                      |

> Specialty visuals (pie, area, scatter, heat map, table) are emitted as
> load-safe **bar/line stand-ins** to swap inside Tableau — the same approach
> this project uses for its wireframes.

### Export layouts

Choose one in the **Export** tab:

- **Floating** (default) — every object keeps its exact x/y position from Figma
  (pixel-perfect, absolute zones in a `layout-basic` root).
- **Tiled** — Figma **Auto Layout** frames become nested Tableau containers
  (`layout-flow`, horizontal/vertical inferred from the frame).
- **Background image** — the whole frame is rendered to a PNG and set as the
  dashboard background (a `bitmap` zone), with only the worksheets floating on
  top. Text/decoration live in the image.

Images (logos and background renders) are exported from Figma as PNGs and
packaged inside the `.twbx` under `Image/`, referenced by `bitmap` zones whose
schema is confirmed against a real Tableau 2026.2 workbook.

---

## Architecture

```
src/
 ├── plugin/                 # generation pipeline (TypeScript)
 │   ├── parser.ts           #   runs in the Figma SANDBOX (figma API, no DOM)
 │   ├── mapper.ts           #   Figma model -> Tableau intermediate model
 │   ├── tableauGenerator.ts #   intermediate model -> .twb XML (the recipe)
 │   ├── twbxBuilder.ts      #   .twb + CSV -> .twbx (JSZip + FileSaver)
 │   ├── exporter.ts         #   orchestration + validation
 │   └── code.ts             #   sandbox entry: parse selection, post to UI
 │
 ├── ui/                     # React UI (runs in the iframe: DOM + Blob)
 │   ├── App.tsx
 │   ├── DashboardPreview.tsx
 │   ├── MappingPanel.tsx
 │   ├── ExportPanel.tsx
 │   ├── main.tsx / index.html / styles.css
 │
 └── shared/                 # types + Tableau 2026.2 constants (both contexts)
     ├── types.ts
     └── constants.ts
```

**Why the split:** a Figma plugin runs in two contexts. The **sandbox**
(`code.ts`) has the `figma` API but no DOM, so it does the parsing. The **UI
iframe** has the DOM (and therefore `Blob`, JSZip, FileSaver), so it does the
mapping, XML generation, zipping, and download. They talk via `postMessage`.

---

## Build & install

Requires Node 18+.

```bash
cd figma-tableau-plugin
npm install
npm run build        # builds dist/index.html (UI) + dist/code.js (sandbox)
```

Then in Figma desktop:

1. **Plugins → Development → Import plugin from manifest…**
2. Select `figma-tableau-plugin/manifest.json`.
3. Run **Plugins → Development → Figma to Tableau**.

For iterative development:

```bash
npm run watch:ui     # rebuild UI on change
npm run watch:code   # (separate terminal) rebuild sandbox on change
```

Type-check without emitting: `npm run typecheck`.

---

## Export workflow

1. Select a dashboard frame in Figma (the plugin auto-parses the selection).
2. **Preview** tab — verify the detected structure, palette, and layout.
3. **Mapping** tab — adjust any element's Tableau role / chart kind.
4. **Export** tab — set workbook/dashboard name, Tableau version, layout size.
5. Click **Generate & Download .twbx**.

---

## Validation

`exporter.validateTwb` runs the cheap structural checks that mirror the known
Tableau 2026.2 failure modes:

- XML well-formedness (`DOMParser`, in the UI),
- the mandatory `<windows>` section is present,
- every worksheet has a matching `<window>`,
- worksheet names are unique.

Run the headless end-to-end check (also writes a real `.twbx` to `test-out/`):

```bash
npm test
```

---

## Known limitation — verify the `.twbx` in Tableau

The `.twb` XML recipe is confirmed to open in Tableau 2026.2. **`.twbx`
packaging** (bundling the CSV inside the ZIP and resolving its path) has **not
yet been verified on the target machine.** The `textscan` connection points at
the package-relative `Data/` folder where `twbxBuilder` stores the CSV. If
Tableau cannot find the data on open, adjust `DATA_DIR` / the connection
`directory` in `twbxBuilder.ts` + `tableauGenerator.ts` and re-test against a
reference `.twbx` exported from your Tableau.
