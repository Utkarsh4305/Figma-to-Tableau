# Figma → Tableau

A Figma plugin that turns a selected dashboard frame into a downloadable
**Tableau Packaged Workbook (`.twbx`)** — preserving the design pixel-for-pixel
while turning the chart layers into real, editable Tableau worksheets.

It follows the approach popularised by LaDataViz's "Figma to Tableau": text stays
text, shapes become native Tableau zones, and any layer you tag as a chart
becomes a live worksheet. The output opens directly in **Tableau 2026.2** —
no manual rebuild.

---

## Highlights

- **Faithful design transpile.** The whole frame is recreated as native Tableau
  dashboard zones — text layers → text zones (real fonts, sizes, colours),
  shapes/cards → coloured zones, icons/logos/vectors → bitmap images. The export
  *looks like the Figma design*.
- **Real worksheets, not screenshots.** A layer named `SHEET/Sales[bar]` becomes
  an actual Tableau worksheet (correct mark type, styled like a polished
  dashboard) bound to a built-in sample dataset.
- **Bring your own sheets.** Upload an existing `.twbx` and swap your *real*
  worksheets — with their real data — in place of the sample charts.
- **Prototype your navigation in Figma.** Wire a Figma "Navigate to" prototype
  interaction from a `Nav/` layer to another frame (or a `SHEET/` layer), and the
  export becomes a working Tableau navigation button that switches dashboard or
  worksheet — no Tableau actions to set up by hand. Multiple selected frames
  export as multiple linked dashboards in one workbook.
- **Interactive objects.** Quick-filter cards, web page objects, worksheet
  titles, and dashboard filter / highlight actions — all driven by simple layer
  names.
- **100 % local.** No network access; all parsing, generation and zipping happen
  in the browser sandbox. Your design never leaves your machine.

---

## Layer naming conventions

Prefix a Figma layer name to map it explicitly to a Tableau object. The prefix
always wins over auto-detection, and the text after the slash becomes the
object's name.

| Layer name | Becomes |
| --- | --- |
| `SHEET/Sales by Region[bar]` | A **worksheet** "Sales by Region" with a Bar mark |
| `SHEET/Trend[line]` · `[area]` · `[pie]` · `[scatter]` | A worksheet with that mark type |
| `FILTER/Region` | A real **quick-filter card** on that dimension |
| `URL/example.com` · `WEB/https://…` | A **web page object** loading that URL |
| `IMAGE/` · `IMG/` · `LOGO/` | A **bitmap image** zone (rasterised from Figma) |
| `KPI/Revenue` | A "big number" worksheet |
| `Nav/Open Details` | A **navigation button** whose target is the layer's Figma prototype "Navigate to" interaction (a frame → that dashboard, a `SHEET/` layer → that worksheet) |
| `BUTTON/Go to Sales > Sales` | A **navigation button** that switches to the named dashboard (or, with two frames selected and no target, toggles to the other) |
| `TEXT/Title` · `CONTAINER/Row` | A text zone / layout container |

### Chart types

The `[type]` tag in a `SHEET/` name picks the Tableau mark: `bar` (default),
`line`, `area`, `pie`, `scatter`. Bars render horizontally, line/area render as
time trends — matching how a polished dashboard reads.

### Sheet options

Append one or more `:option` suffixes to a `SHEET/` layer name (order doesn't
matter):

| Option | Effect |
| --- | --- |
| `:showTitle` | Show the worksheet's title bar (hidden by default) |
| `:filter` | Clicking this sheet **filters** the rest of the dashboard |
| `:highlight` | Clicking this sheet **highlights** the rest of the dashboard |

Example: `SHEET/Sales by Region[bar]:showTitle:filter`

> **Untagged layers** are still exported faithfully — as static text, shapes, and
> images — so the design always comes through. Tagging a layer `SHEET/…` is what
> turns it into a *live* worksheet rather than a picture of one.

---

## Worksheet swap — use your real Tableau sheets

By default `SHEET/` worksheets bind to a built-in sample dataset
(Region × Period → Sales / Profit). To export *your* actual analysis instead:

1. In the plugin's **Export** panel, upload an existing **`.twbx`**.
2. A checklist of its worksheets appears — tick the ones you want.
3. Click **Add to Figma**. The plugin drops a labelled `SHEET/<name>` card into
   an empty area beside your dashboard frame.
4. **Drag each card onto your dashboard** where you want it.
5. **Export.** Each card is matched by name to your real worksheet — its sheet,
   datasource, and backing data file are lifted from your upload and repackaged
   into the new `.twbx`, replacing the demo chart.

The imported worksheet XML is carried byte-for-byte (never regenerated), and its
data files are repackaged at their original paths so the connections resolve.

---

## Navigation — prototype it in Figma

Select **multiple** dashboard frames and each one becomes its own dashboard in a
single workbook. To link them:

1. Add a button layer and name it **`Nav/Label`**.
2. In Figma's **Prototype** tab, drag a **"Navigate to"** interaction from that
   layer to the destination frame — or to a `SHEET/` layer to jump straight to a
   worksheet.
3. **Export.** The plugin reads the prototype interaction and emits a real Tableau
   navigation action, so clicking the button in Tableau switches to that
   dashboard or worksheet.

If a destination frame wasn't part of your selection, it's pulled into the export
automatically (one level deep). Prefer naming the target explicitly? Use
`BUTTON/Caption > Target Dashboard` instead — the text after `>` is the
destination, and with exactly two frames selected a bare `BUTTON/Caption` toggles
between them.

> Navigation is emitted as a Tableau `<nav-action>` driven by an invisible
> button-worksheet — the mechanism confirmed to load in Tableau 2026.2. (The
> native button object is *not* used: it's rejected in floating dashboards.)

---

## How it works

A Figma plugin runs in two isolated JavaScript contexts; this plugin keeps a
strict separation between them:

| Context | Has | Responsibility |
| --- | --- | --- |
| **Sandbox** (`src/plugin/code.ts`, `parser.ts`, `faithful.ts`) | the `figma` API, no DOM | Read the selected frame → build a model → `postMessage` to the UI |
| **UI iframe** (`src/ui/*`, plus the generators) | DOM, `Blob`, JSZip, FileSaver | Turn the model into `.twb` XML → zip into `.twbx` → download |

The generated `.twb` follows the exact construction recipe confirmed to open in
Tableau 2026.2 (workbook version `18.1`): the mandatory `<windows>` section, the
2026 object-model datasource, native type codes, plain `rows`/`cols` pills, and
pane-level styling. Getting any of these wrong yields the opaque
*"Internal Error 501CF476"* — so the generator is deliberately conservative and
guards against the known load-killers (`<shelf-sorts>`, `NaN` coordinates).

```
src/
├── shared/        types + Tableau 2026.2 constants + layer-prefix table (both contexts)
├── plugin/
│   ├── code.ts            sandbox entry — message switch, frame parsing
│   ├── faithful.ts        primary transpiler: frame → native zones + SHEET/ worksheets
│   ├── parser.ts          heuristic classifier + auto-tagging
│   ├── seed.ts            model → editable WorkbookSpec + sample dataset
│   ├── workbookGenerator.ts   WorkbookSpec → .twb XML (worksheet/zone/action styling)
│   ├── exporter.ts        orchestration + load-safety validation
│   ├── twbImport.ts       parse an uploaded .twbx (the worksheet-swap feature)
│   ├── twbxBuilder.ts     zip .twb + Data/ + Image/ → .twbx
│   └── csv.ts / xlsx.ts   data upload / parsing / type inference
└── ui/            React UI (App + editor panels), single-file build
```

---

## Getting started

Requires **Node 18+**.

```bash
cd figma-tableau-plugin
npm install
npm run build      # builds dist/index.html (UI) + dist/code.js (sandbox)
```

Then in Figma desktop:

1. **Plugins → Development → Import plugin from manifest…**
2. Select `figma-tableau-plugin/manifest.json`.
3. Run **Plugins → Development → Figma to Tableau**.

> Figma caches the plugin UI aggressively. After rebuilding, quit Figma and
> re-import the manifest; the footer shows a build marker so you can confirm the
> latest version is loaded.

### Export workflow

1. Select a dashboard frame in Figma.
2. *(Optional)* tag chart layers `SHEET/Name[type]`, or upload a `.twbx` to swap
   in real sheets.
3. Set the workbook name in the **Export** panel.
4. Click **Export to Tableau** — the `.twbx` downloads.
5. Open it in Tableau 2026.2.

---

## Development

| Command | What it does |
| --- | --- |
| `npm run build` | Build the UI single-file (`dist/index.html`) and the sandbox bundle (`dist/code.js`) |
| `npm run typecheck` | `tsc --noEmit` (strict; no unused locals/params) |
| `npm test` | Headless smoke suite — generates real `.twbx` files into `test-out/` and asserts structure |

The Figma UI **must** be a single esbuild classic-IIFE HTML file
(`scripts/build-ui.mjs`), because Figma loads the dev UI from a `file:` origin
where `<script type="module">` is blocked. Don't bundle the UI any other way.

---

## Compatibility & limitations

- **Target:** Tableau **2026.2** (workbook version `18.1`), Windows. The recipe
  is confirmed to open there.
- **Sample data:** unless you import your own sheets, `SHEET/` worksheets bind to
  the built-in Region/Sales/Profit dataset.
- **Fonts:** design fonts not installed on Windows (Roboto, Inter, Poppins, …)
  are mapped to **Segoe UI** so Tableau renders them at the intended width.
- **Layout:** the design is exported at absolute pixel positions (floating
  layout), faithful to the Figma frame.

The faithful design transpile, multi-dashboard export, **worksheet swap** (your
real sheets + data), and **prototype-driven navigation** are all confirmed to open
and work in Tableau 2026.2. Generated workbooks are always *well-formed*; for a
brand-new design it's still worth a final visual check in Tableau.

---

## License

MIT.
