# Figma → Tableau

A Figma plugin that turns selected dashboard frames into a downloadable
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
- **Bring your own sheets.** Upload an existing `.twb`/`.twbx` and swap your
  *real* worksheets — with their real data — in place of the sample charts. The
  upload is remembered between plugin sessions.
- **Prototype your navigation in Figma.** Wire a Figma "Navigate to" prototype
  interaction from a `Nav/` layer to another frame (or a `SHEET/` layer), and the
  export becomes a working Tableau navigation button that switches dashboard or
  worksheet — no Tableau actions to set up by hand. Multiple selected frames
  export as multiple linked dashboards in one workbook.
- **15 domain dashboard templates.** Searchable, ready-made layouts (clinical,
  sales, finance, executive, operations, marketing, HR, supply chain, support,
  product, IT ops, manufacturing, retail, project, ESG) — each with its own
  accent palette and layout archetype, inserted straight onto the Figma canvas
  with all layers pre-tagged.
- **Component library.** Drag-and-drop pre-named building blocks — chart
  worksheets, KPI cards, filter cards, nav buttons, text/image/web placeholders —
  so you never have to type a prefix by hand.
- **Domain-aware output.** The frame's wording is matched against domain
  keywords; the detected domain drives the placeholder field names, the chart
  mark colour, and — in a mixed-domain multi-dashboard export — a separate
  datasource per domain.
- **Interactive objects.** Quick-filter cards, web page objects, worksheet
  titles, and dashboard filter / highlight actions — all driven by simple layer
  names.
- **100 % local.** No network access; all parsing, generation and zipping happen
  in the browser sandbox. Your design never leaves your machine.

---

## Plugin UI

Three tabs:

| Tab | What's there |
| --- | --- |
| **Dashboard** | Live selection card (N frames → N dashboards), workbook name, export options (filters / legends / titles), the `.twb`/`.twbx` upload for the worksheet swap, and the **Export to Tableau** button |
| **Library** | Three sub-tabs: **Components** (drag-and-drop pre-tagged building blocks), **Templates** (15 searchable domain dashboards), **Syntax** (in-plugin reference for every layer-name prefix, `[type]` alias, and `:option`) |
| **Account** | Your Figma profile, plan card, usage stats (exports / imported sheets / frames selected), and **Data & storage** — see and clear the workbook stored for the real-data swap |

The window is resizable via the corner grip.

---

## Layer naming conventions

Prefix a Figma layer name to map it explicitly to a Tableau object. The prefix
always wins over auto-detection, and the text after the slash becomes the
object's name. (The Library → Syntax tab carries this same reference in-plugin.)

| Layer name | Becomes |
| --- | --- |
| `SHEET/Sales by Region[bar]` | A **worksheet** "Sales by Region" with a Bar mark |
| `SHEET/Trend[line]` · `[area]` · `[pie]` · `[scatter]` · `[heatmap]` · `[table]` | A worksheet with that mark type |
| `KPI/Revenue` | A "big number" worksheet |
| `FILTER/Region` | A real **quick-filter card** on that dimension |
| `URL/example.com` · `WEB/https://…` | A **web page object** loading that URL |
| `IMAGE/` · `IMG/` · `LOGO/` | A **bitmap image** zone (rasterised from Figma) |
| `Nav/Open Details` | A **navigation button** whose target is the layer's Figma prototype "Navigate to" interaction (a frame → that dashboard, a `SHEET/` layer → that worksheet) |
| `BUTTON/Go to Sales > Sales` | A **navigation button** that switches to the named dashboard (or, with two frames selected and no target, toggles to the other) |
| `TEXT/Title` · `CONTAINER/Row` · `GROUP/Row` | A text zone / layout container |

### Chart types

The `[type]` tag in a `SHEET/` name picks the Tableau mark. Aliases are
accepted; anything unrecognised defaults to Bar:

| Tag | Mark |
| --- | --- |
| `bar` · `bar-hor` · `bar-vert` · `column` *(default)* | Bar (horizontal) |
| `line` · `trend` | Line (time trend) |
| `area` | Area (time trend) |
| `pie` · `donut` · `doughnut` | Pie |
| `scatter` · `bubble` · `circle` | Circle |
| `heatmap` · `square` · `map` | Square (matrix) |
| `table` · `text` · `crosstab` | Text table |

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
> images — so the design always comes through. A heuristic classifier also
> auto-detects obvious charts, filters, and KPIs from layer names and geometry;
> tagging a layer `SHEET/…` is what *guarantees* it becomes a live worksheet.

---

## Templates & components

The **Library** tab gets you from a blank canvas to an export-ready design:

- **Templates** — 15 domain dashboards, each a distinct layout archetype (funnel
  tower, right sidebar, stacked bands, quadrant + KPI row, split hero, status
  board, kanban lanes, …) coloured with that domain's accent palette. Search by
  name or keyword, click **Apply**, and the template is drawn onto the canvas in
  the empty space beside your work — every layer already tagged with the right
  `SHEET/` / `KPI/` / `FILTER/` name, ready to restyle or export as-is.
- **Components** — individual pre-tagged pieces (all chart types, large/small
  KPI cards, filter card, nav buttons, text/image/web placeholders) you drag
  onto the canvas.

Each domain has a fixed accent colour (`DOMAIN_ACCENTS`) used both in the
template's Figma styling *and* as the exported chart mark colour, so what you
see in Figma is what Tableau renders.

---

## Worksheet swap — use your real Tableau sheets

By default `SHEET/` worksheets bind to a built-in sample dataset. To export
*your* actual analysis instead:

1. In the **Dashboard** tab, upload an existing **`.twb` / `.twbx`**.
2. A checklist of its worksheets appears — tick the ones you want.
3. Click **Add to Figma**. The plugin drops a labelled `SHEET/<name>` card into
   an empty area beside your dashboard frame.
4. **Drag each card onto your dashboard** where you want it.
5. **Export.** Each card is matched by name (case/space-tolerant) to your real
   worksheet — its sheet, datasource, and backing data file are lifted from your
   upload and repackaged into the new `.twbx`, replacing the demo chart.

The imported worksheet XML is carried byte-for-byte (never regenerated), and its
data files are repackaged at their original paths so the connections resolve.
Using the same imported sheet on several dashboards shares one worksheet; using
it twice on *one* dashboard splices in a renamed clone. The uploaded workbook is
persisted in Figma's plugin storage across sessions — clear it any time from the
**Account** tab.

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
| **Sandbox** (`src/plugin/code.ts`, `parser.ts`, `faithful.ts`) | the `figma` API, no DOM | Read the selected frames → build a model → `postMessage` to the UI |
| **UI iframe** (`src/ui/*`, plus the generators) | DOM, `Blob`, JSZip, FileSaver | Turn the model into `.twb` XML → zip into `.twbx` → download |

The generated `.twb` follows the exact construction recipe confirmed to open in
Tableau 2026.2 (workbook version `18.1`): the mandatory `<windows>` section, the
2026 object-model datasource, native type codes, plain `rows`/`cols` pills, and
pane-level styling. Getting any of these wrong yields the opaque
*"Internal Error 501CF476"* — so the generator is deliberately conservative and
guards against the known load-killers (`<shelf-sorts>`, `NaN` coordinates).

Text gets special care, because Tableau draws text ~1.5× wider than the design
and mangles floating text zones that partially overlap another zone: every text
layer's font size is normalised so the rendered text occupies its designed
space, and a fitting pass grows or shrinks each text zone within its enclosing
card so no zone is clipped or overhangs a neighbour.

```
src/
├── shared/        types + Tableau 2026.2 constants + layer-prefix / domain tables (both contexts)
├── plugin/
│   ├── code.ts            sandbox entry — message switch, frame parsing, template insertion
│   ├── faithful.ts        primary transpiler: frame → native zones + SHEET/ worksheets + text fitting
│   ├── parser.ts          heuristic classifier + auto-tagging + domain detection
│   ├── seed.ts            model → editable WorkbookSpec + per-domain sample dataset
│   ├── workbookGenerator.ts   WorkbookSpec → .twb XML (worksheet/zone/action styling)
│   ├── exporter.ts        orchestration, worksheet swap, multi-datasource packaging, load-safety validation
│   ├── twbImport.ts       parse an uploaded .twb/.twbx (the worksheet-swap feature)
│   ├── twbxBuilder.ts     zip .twb + Data/ + Image/ → .twbx
│   └── csv.ts / xlsx.ts   CSV serialisation + type inference (+ minimal .xlsx reader)
└── ui/
    ├── App.tsx            React UI — Dashboard / Library / Account tabs
    ├── components/        ComponentLibrary (drag-and-drop building blocks)
    ├── templates/         DashboardTemplates (15 domain templates + search)
    └── icons.tsx          shared SVG icon set
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
> re-import the manifest; the Dashboard tab footer shows a build marker so you
> can confirm the latest version is loaded. (The manifest declares the
> `currentuser` permission for the Account tab — re-import it if you change it.)

### Export workflow

1. Select one or more dashboard frames in Figma (or start from a Library
   template).
2. *(Optional)* tag chart layers `SHEET/Name[type]`, or upload a `.twbx` to swap
   in real sheets.
3. Set the workbook name and export options (filters / legends / titles) in the
   **Dashboard** tab.
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
  a built-in placeholder dataset whose fields match the detected domain (e.g.
  Site/Visit/Randomized for clinical, Stage/Rep/Deals for sales).
- **Fonts:** design fonts not installed on Windows (Roboto, Inter, Poppins, …)
  are mapped to **Segoe UI**, and font sizes are normalised so Tableau renders
  text at the designed visual size.
- **Layout:** the design is exported at absolute pixel positions (floating
  layout), faithful to the Figma frame.

The faithful design transpile, multi-dashboard export, **worksheet swap** (your
real sheets + data), and **prototype-driven navigation** are all confirmed to open
and work in Tableau 2026.2. Generated workbooks are always *well-formed*; for a
brand-new design it's still worth a final visual check in Tableau.

---

## License

MIT.
