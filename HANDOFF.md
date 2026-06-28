# Wireframe → Tableau — Project Handoff

> Self-contained context for any AI/engineer picking this up, **including on a
> device without the local Claude memory**. It folds in the essential facts from
> the private memory files (the Tableau 2026.2 recipe, the reference-export
> workflow, and project state). Last updated: **2026-06-28**, build
> `multi-dashboard-37`.

---

## 1. What this project is

`D:\wireframe` converts **dashboard designs into Tableau workbooks**. Two
independent tracks live here:

1. **Python generators** (older, standalone) — turn an HTML wireframe / a static
   `image.png` mock into a hand-authored `.twb`. See `generate_twb.py`
   (clinical-trial, 26 dashboards / 78 worksheets) and `generate_image_twb.py`
   (generic image → dashboard). These are the original proof that we can
   hand-author a `.twb` that opens in Tableau 2026.2.
2. **`figma-tableau-plugin/`** (the ACTIVE work) — a production Figma plugin
   (TypeScript + React + Vite) that converts a selected **Figma frame** into a
   downloadable Tableau **`.twbx`**. This is where all recent effort goes and is
   the focus of this handoff.

The plugin's goal is **parity with the LaDataViz "Figma to Tableau" plugin**: an
exported dashboard that *looks like the Figma design*, where the text stays text
and the chart layers become **real, editable Tableau worksheets** bound to sample
data — exactly how LaDataViz's output works.

**Target Tableau:** **2026.2** (`version='18.1'`, source-build
`2026.2.0 (20262.26.0603.1643)`), Windows. The user's machine runs this version.

---

## 2. The user & reference files

- The user designs in **Figma** and exports via the plugin, then opens the
  `.twbx` in **Tableau 2026.2** to judge fidelity. They cannot read code; give
  plain-language status and always say whether something is *Tableau-confirmed*
  vs *only generated/well-formed*.
- **The authoritative reference is LaDataViz's own output.** Key example files in
  `examples/`:
  - `multi.twbx` / `Template.twbx` / `Template (1).twbx` — **LaDataViz exports**.
    Decompile these to learn the exact XML LaDataViz emits. THIS is how every
    fidelity fix was found — *decompile the reference and compare zone-by-zone,
    never guess from a screenshot.*
  - `Our.twbx`, `Overview Dashboard Collapse.twbx` — **our** exports kept as
    debug artifacts (the user overwrites these each round). They are OURS, not
    references.
  - `Adult LGBTQ+ … VOTD.twbx`, `Clinical Trials*.twbx`, `DM_Dashboards.twbx` —
    other confirmed-opening 2026.2 workbooks used to confirm schema patterns.
- A `.twbx` is a ZIP: `unzip x.twbx -d out` → `out/<name>.twb` (the XML) +
  `out/Data/...` (the .hyper or .csv) + `out/Image/...` (bitmaps).

---

## 3. Plugin architecture (READ THIS BEFORE EDITING)

The plugin runs in **two isolated JS contexts** — mixing them up is the #1 way to
break it:

| Context | Has | Files | Role |
|---|---|---|---|
| **Figma sandbox** (`code.ts`) | the `figma` API, **no DOM**, no Blob/btoa | `plugin/code.ts`, `plugin/parser.ts`, `plugin/faithful.ts` | Read the selected frame → build a model → `postMessage` to the UI |
| **UI iframe** (React) | DOM, Blob, JSZip, FileSaver, **no `figma`** | everything in `ui/`, plus `plugin/seed.ts`, `workbookGenerator.ts`, `exporter.ts`, `twbxBuilder.ts`, `csv.ts`, `xlsx.ts`, `mapper.ts`, `tableauGenerator.ts` | Turn the model into `.twb` XML, zip into `.twbx`, download |

They communicate only via `postMessage` with typed messages in
`shared/types.ts` (`PluginToUi` / `UiToPlugin`). `shared/` files must stay
DOM-free and `figma`-free (imported by both).

### Message flow (current)
- UI → sandbox: `request-parse`, `request-faithful`, `apply-tags`, `resize`,
  `notify`.
- sandbox → UI: `model-ready` (the heuristic parse), `faithful-ready` (the
  faithful transpile).
- **Removed this session:** the whole `request-background` / `background-ready`
  "background-image export" path (and `parser.exportFramePng`,
  `DashboardModel.backgroundPng`) — it was dead code after the export was
  consolidated. Don't reintroduce it.

---

## 4. The two model paths

### A. Heuristic parse → `DashboardModel` (`parser.ts` → `seed.seedSpecFromModel`)
Classifies each Figma node into a role (worksheet/kpi/text/image/button/filter/
container) via keywords + the `SHEET/`-prefix convention, then `seed.ts` builds an
editable `WorkbookSpec`. Drives the editor tabs (Preview/Data/Sheets/Layout).
This path makes real worksheets from *detected* charts. It still exists but is
**not** the primary export anymore.

### B. Faithful transpile → `FaithfulModel` (`faithful.ts` → `seed.faithfulSpec`) — THE PRIMARY PATH
`parseFaithful()` walks every visible node back-to-front and emits a flat
`FaithfulZone[]` at absolute Figma px. **Multi-dashboard (`multi-dashboard-37`):**
`parseFaithfulAll()` resolves **every selected frame** (children collapse to their
frame, deduped, reading-order sorted) and returns one `FaithfulModel` PER frame;
the `faithful-ready` message now carries `models: FaithfulModel[]`, and
`seed.faithfulSpecMulti(models)` builds ONE `WorkbookSpec` with **one dashboard
per frame** (shared sample dataset; worksheet names + image filenames kept unique
across all dashboards). Select N frames → N Tableau dashboards. `parseFaithful()`
/ `faithfulSpec(model)` remain as the single-frame path (byte-identical output;
still used by the capture/feature tests).

Per-frame `FaithfulZone[]`:
- `TEXT` → `text` zone (real content, per-style `runs[]`, px→pt fonts).
- shape/card/bar with a fill → `rect` zone (`type-v2='empty'` + 8-digit
  `#RRGGBBAA` bg).
- icon/vector/image-fill → `image` zone (rasterized to PNG via `exportAsync`).
- **a layer named `SHEET/Name[charttype]` → a `sheet` zone** → becomes a **real
  Tableau worksheet bound to sample data** (this is the LaDataViz move).

`faithfulSpec(model)` then builds a **floating** `WorkbookSpec`: text/rect/image
zones reproduce the design; each `sheet` zone gets a `WorksheetSpec` on the
sample dataset (Region/Sales/Profit) with the mark class from the `[type]` tag.

**This is the recommended path and the only export button now.**

---

## 5. The `SHEET/` convention (how charts become worksheets)

Defined in `shared/constants.ts` (`LAYER_PREFIXES` + `matchLayerPrefix`):

| Figma layer name | Becomes |
|---|---|
| `SHEET/Sales by Region[bar-hor]` | worksheet "Sales by Region", **Bar** mark |
| `SHEET/Trend[line]` / `[area]` / `[pie]` / `[scatter]` | worksheet with that mark |
| `KPI/…`, `IMAGE/`/`IMG/`/`LOGO/`, `BUTTON/`, `FILTER/`, `TEXT/`, `CONTAINER/`/`GROUP/` | corresponding role |

**LaDataViz-style options on a SHEET/ name** (build `filter-action-show-title-32`,
all lowered to CONFIRMED Tableau XML — verified against `DM_Dashboards.twb` /
`Clinical Trials.twb`). Append `:option` suffixes (order-independent):

| Layer name | Effect |
|---|---|
| `FILTER/Region` | a **real quick-filter card** (`type-v2='filter'`, `mode='checkdropdown'`) bound to the first chart sheet, on a sample string dimension (`Region`, or `Period` if the name hints time) |
| `URL/en.wikipedia.org/...` or `WEB/https://...` | a **real web page object** (`type-v2='web'` + `forceUpdate='' param='<URL>'`); a bare host gets an `https://` scheme. Confirmed from `Using Web Page Object in Tableau.twb` |
| `SHEET/Sales[bar]:showTitle` | the worksheet zone shows its **title bar** (`show-title='true'`); default stays `false` |
| `SHEET/Sales[bar]:filter` | clicking that sheet runs a **dashboard filter action** (`tsc:tsl-filter`, `special-fields='all'`) |
| `SHEET/Trend[line]:highlight` | clicking that sheet runs a **highlight action** (`tsc:brush` on its dimension) |

Parsing lives in `faithful.ts parseLayerOptions()`; only these confirmed-safe
options are recognised (an unknown `:foo` is left attached, never silently
dropped). The faithful walk now also special-cases `FILTER/` (like `SHEET/`):
it emits one filter zone and does **not** recurse.

- `faithful.ts markFromTag()` maps the `[type]` tag → Tableau mark class
  (default Bar). `parseSheetTag()` strips the `[type]` from the worksheet **name**
  but the full original layer name is kept as the zone's `friendly-name`
  (matches LaDataViz: `friendly-name='SHEET/Sales[bar-hor]'`, `name='Sales'`).
- **The user can't hand-name every layer.** The **🏷 Auto-tag layers** button
  (Export tab) calls `apply-tags` → `parser.applyAutoTags()` which renames
  detected chart/KPI/image layers in Figma with the right prefix, so a later
  export is deterministic. Run it before exporting if layers aren't `SHEET/`-named.

---

## 6. Generating LaDataViz-quality worksheets (`workbookGenerator.ts`)

This is the heart of the recent work. A `sheet` zone produces both a
**worksheet definition** and a **dashboard zone**, styled to match `multi.twbx`:

### Worksheet (`worksheetXml`)
- **Orientation by mark type** (LaDataViz puts the category where it reads best):
  - **single-measure Bar → horizontal**: dimension on `<rows>`, measure on
    `<cols>` (categories list down the left, no truncated `B..`/`D..` x-labels).
  - **Line/Area** → measure on `<rows>` (Y), dimension on `<cols>` (X / time).
  - multi-measure Bar keeps the established measures-on-rows layout.
- **Clean worksheet `<style>`** (`worksheetStyleXml`): transparent table bg,
  hidden axis lines, hidden gridlines + zero lines, hidden shelf **field labels**
  (kills the stray "Region" title), and for bars the measure-axis numbers are
  hidden (the value labels carry magnitude).

### Pane (`markPaneStyle`) — the "polish & color", ALL in the pane `<style>`
- `marks-scaling-off` + a large mark **`size`** (0.9 bars / 0.5 line-area) → fat
  marks that **fill the container** instead of thin defaults floating in space.
- `mark-color='#898989'` — the exact neutral gray LaDataViz uses on every sheet.
- Data labels: bars `all`, line/area `line-ends` (only the end value). A bold,
  color-matched `datalabel` rule.
- Line/area get point markers; **area gets `mark-transparency='65'`** — higher
  than the reference's 27 because our area is standalone (no opaque line layered
  on top like LaDataViz), so 27 washed out to near-white.

### Sample data (`seed.ts sampleData`) — what the charts bind to
- `Region × Period` (4 regions × 12 quarters `2021 Q1…2023 Q4`, 48 rows),
  **integer** Sales/Profit (clean labels, no `.00`). Bars sum over Region → big
  differentiated numbers (`West 549,600` …); **line/area bind to `Period`** so
  they render as real upward trends, not flat blobs over nominal categories.
  `faithfulSpec` picks the dimension by mark: Line/Area → `Period`, else `Region`.

### Dashboard sheet zone (floating)
`<zone friendly-name='SHEET/…' name='<worksheet>' show-title='false'>` +
`<layout-cache>` + a white **rounded** card `<zone-style>` (border none,
**padding 8**, `corner-radius` from the Figma container or 10) so the fat marks
fill edge-to-edge. (`faithfulSpec` sets `markColor:'#898989'` and
`showLabels:true` on every sheet.)

### Sheet fills its container (`faithfulSpec` pre-pass)
When a `SHEET/` layer sits inside a Figma card rect, a pre-pass **grows the sheet
to the card's bounds, inherits the card's corner radius, and drops the card** so
the chart's own rounded card fills the container edge-to-edge. Conservative: only
a card-sized rect (<50% of the dashboard) that actually encloses the sheet.

### Rounded corners (`cornerXml` + manifest)
Figma `cornerRadius` → Tableau via `<_.fcp.DashboardRoundedCorners.true...format
attr='corner-radius' value='N'/>` (+ the three named-corner variants) inside a
`<zone-style>`. **Requires** the feature declared in the manifest
(`_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners`, in
`constants.ts MANIFEST_ENTRIES`). Applied to sheet cards and rect/card zones.

### Entire-View fit (`windowsXml`)
Every graph fills its pane/card by default via `<zoom type='entire-view'/>` in
TWO places (confirmed from `Our.twb`/`DM_Dashboards.twb`): each **worksheet
window** gets `<viewpoint><zoom type='entire-view'/></viewpoint>` after its
`<cards>`; each **dashboard viewpoint** becomes
`<viewpoint name='Sheet'><zoom type='entire-view'/></viewpoint>`.

### Font: maintain size, never overflow (`faithful.ts`)
Fonts are kept (px→pt ×0.75) and non-Windows families mapped to **Segoe UI**
(`safeFont`). The width-grow safety uses a realistic Segoe UI advance (`~0.62×`
the pt size, was a wildly-too-big `1.15×` that overflowed cards) — text only
nudges wider when genuinely too narrow, so it fits without spilling past its box.

---

## 7. The Tableau 2026.2 `.twb` recipe — load-critical structures

These are **hard requirements**; getting them wrong yields opaque errors. (Ported
from the proven Python generator and confirmed against the example workbooks.)

1. **`<windows>` is MANDATORY.** Its absence = silent **Internal Error 501CF476**
   (not a schema error). Worksheet windows need `<cards>` (pages/filters/marks/
   columns/rows/title); dashboard windows need `<viewpoints>` (one
   `<viewpoint name='Sheet'/>` per placed sheet) + `<active id='-1'/>`. Each
   window + each `<worksheet>`/`<dashboard>` carries its own `<simple-id uuid/>`.
   Dashboard windows use `maximized='true'` so the workbook opens fit-to-window.
2. **2026 object model**: datasource needs an `<object-graph><objects><object>`
   block, and the workbook header needs `<document-format-change-manifest>` with
   `AnimationOnByDefault, MarkAnimation, ObjectModelEncapsulateLegacy,
   ObjectModelTableType, SchemaViewerObjectModel, SheetIdentifierTracking,
   WindowsPersistSimpleIdentifiers` and (for rounded corners)
   `_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners`.
3. **CSV/textscan datasource**: `<columns character-set='UTF-8' header='yes'
   locale='en_US' separator=','>`. metadata remote-type codes: **string=129,
   date=133, integer=20, real=5**. String cols add `<scale>1</scale><width>
   1073741823</width><collation flag='0' name='LEN_RGB'/>`; every column
   metadata-record needs `<object-id>` matching the object-graph id. Default
   aggregations: string=Count, date=Year, numeric=Sum. (All in
   `constants.ts` `RT2026`/`AGG2026`/`MANIFEST_ENTRIES`.)
4. **Worksheet `<datasource-dependencies>`**: ALL `<column>` first, THEN all
   `<column-instance>` (not interleaved). Pills like `[ds].[none:Region:nk]`
   (string dim), `[ds].[sum:Sales:qk]` (measure).
5. **Dashboard zones**: root `<zone type-v2='layout-basic'>`; containers
   `<zone param='horz|vert' type-v2='layout-flow'>`; worksheet tile
   `<zone name='Sheet'>`; bitmap `<zone type-v2='bitmap' param='Image/x.png'/>`
   (self-closing, no zone-style); text `type-v2='text'`; rect `type-v2='empty'`;
   filter `type-v2='filter'`. Coords normalized to a 100000-unit space via
   `clampN(v,fw)=(v/fw)*100000` (guard non-finite → 0, else you emit `NaN` and
   the file won't load).
6. **`.twbx` packaging** (`twbxBuilder.ts`): the `.twb` + `Data/data.csv` +
   `Image/*` zipped; datasource connection `directory='Data'`.
7. **Entire-View fit** (so a graph fills its zone): `<zoom type='entire-view'/>`
   inside each worksheet window's `<viewpoint>` (after `<cards>`) AND inside each
   dashboard `<viewpoint name='Sheet'>`. Confirmed from `Our.twb`/`DM_Dashboards`.
8. **Rounded corners**: `<_.fcp.DashboardRoundedCorners.true...format
   attr='corner-radius' value='N'/>` (+ `-top-right`/`-bottom-left`/
   `-bottom-right`) inside a `<zone-style>`, gated by the manifest entry above.
   Confirmed schema-valid (declared in `multi.twbx`; only `shelf-sorts` was
   rejected there).

### Known LOAD-KILLERS (do not emit)
- **`<shelf-sorts>`** → **error D2E8DA72** (`no declaration found for element
  'shelf-sorts'`). It is NOT in the 2026.2 `<view>` content model
  `(datasources?, mapsources?, datasource-dependencies*, filter, sort,
  perspectives, slices?, aggregation)`. **Even LaDataViz's `multi.twbx` hits this
  in the user's Tableau.** We removed our shelf-sort (bars now render in natural
  data order) and added a guard in `exporter.validateTwb` that throws if
  `<shelf-sorts` ever reappears. *Consequence:* no descending bar sort. To add
  sorting back you'd need Tableau's actual `<sort>` element — validate against a
  known-good export first.
- **`enable-sort-zone-taborder` on `<dashboard>`** → also D2E8DA72 (attribute not
  declared), even though Tableau's own exports include it. We omit it.
- **NaN coords** → `value 'NaN' does not match … facet '[+\-]?[0-9]+'`. Guarded.

> **Validation ≠ loading.** `minidom`/DOMParser only catch well-formedness. A
> schema-clean file can still throw 501CF476. Only opening in Tableau confirms.

---

## 8. Build / dev / test

From `figma-tableau-plugin/` (Windows; Git-Bash or PowerShell):

```
npm install
npm run build      # build:ui (scripts/build-ui.mjs, esbuild → dist/index.html) + build:code (esbuild → dist/code.js)
npm run dev        # Vite dev server :5173, ui/devMock.ts impersonates the Figma sandbox (browser-testable)
npx tsc --noEmit   # typecheck (strict, noUnusedLocals/Parameters ON — remove dead vars or it fails)
npm test           # tsx smoke suite: smoke + spec_smoke + lds_smoke + faithful_smoke + faithful_capture_smoke
```

**The Figma UI MUST be a single esbuild classic-IIFE HTML file.** Figma loads the
dev UI from a `file:` origin where `<script type="module">` is BLOCKED. Hence
`scripts/build-ui.mjs` inlines JS+CSS into a hand-written `dist/index.html`
(`vite.config.ts` is DEV-ONLY — never `vite build` the UI). After build verify:
`type="module"`=0, `<link`=0, `crossorigin`=0, `#root` before the final script.

**Figma caches the UI aggressively.** The footer shows a `build <tag>` marker. If
the user's footer tag is stale, their export used an OLD build — they must **quit
Figma, remove + re-import the manifest**, and confirm the footer reads the
current tag. Many "it's still broken" reports were just a stale build.

### Tests
- `smoke.ts` — old `DashboardModel` path (`test-out/Clinical_Trial_Dashboard.twbx`).
- `spec_smoke.ts` — editor `WorkbookSpec` features (calcs, color, actions,
  filters). **Asserts multi-measure bars keep measures on rows** — that's why the
  horizontal-bar flip is gated to single-measure.
- `lds_smoke.ts` — tiled/bitmap/layout-flow/prefix matcher/geometric layout.
- `faithful_smoke.ts` — faithful transpile (real text, empty zones, bitmap,
  friendly-name, no `[sum:` pills, font mapping, sizing-mode/maximized).
- `faithful_capture_smoke.ts` — mocks a `figma` global, runs `parseFaithful()`,
  asserts px→pt fonts, grown short titles, 8-digit alpha fills, gradient
  resolution, rotated-bar fix, SemiBold-not-bold.
- `faithful_multi_smoke.ts` — `faithfulSpecMulti([m1,m2])`: 2 frames → 2
  dashboards, worksheet names + image filenames unique across dashboards, two
  dashboard windows with the right per-window viewpoints, `:filter` action scoped
  to its own dashboard, load-safe (windows/no-shelf-sorts/no-NaN).

Floating `.twb` output was historically kept **byte-identical** across refactors,
but the byte counts have since shifted intentionally as features landed (the
rounded-corners manifest entry + corner/zoom XML add bytes to every workbook).
Current reference sizes: smoke ~15346, spec_smoke ~18010. Don't treat a byte-count
change as a regression by itself — confirm via the assertions instead.

---

## 9. Current UI state (after this session)

The Export tab + footer were consolidated. There is now **ONE export button**:

> **⬇ Export to Tableau (exact design + live sheets)** → `App.exportFaithful()`

It sends `request-faithful`; the `faithful-ready` handler builds `faithfulSpec` +
`exportSpecTwbx`. The two older buttons ("Export as data sheets",
"Export with current layout options") and their functions
(`exportRealComponents`, `handleExport`) were **removed**, along with the
background-image export mode and all its plumbing. The Export tab still has:
workbook name, Tableau version, a re-read/auto-tag source card, and a summary
table. Build tag is in `App.tsx` `const BUILD` (currently `multi-dashboard-37`).
The export now covers **all selected frames** (one dashboard each); the status
line reports the dashboard count.

---

## 10. What works vs what's unconfirmed / deferred

**Working & verified (typecheck + smoke + XML inspection):**
- Faithful transpile: text stays text; `SHEET/Name[type]` → real worksheet on
  sample data; rect/image faithful zones; px→pt fonts; 8-digit alpha fills;
  rotated-bar fix; font substitution mapped to Segoe UI; **text width-grow gentle
  (~0.62×) so text fits without overflowing its card**.
- LaDataViz-style worksheets: horizontal single-measure bars, gray `#898989`
  fat marks that fill the card, value labels (bars `all` / line-area `line-ends`),
  hidden axes/gridlines/field-labels, area transparency 65, `show-title='false'`
  card zones.
- **Rich sample data**: `Region × Period` (48 rows, integer measures); bars sum to
  big differentiated numbers, line/area bind to `Period` → real quarterly trends.
- **Rounded cards** (corner-radius from Figma, default 10) + the manifest entry.
- **Sheet fills its container** (pre-pass grows the sheet to a containing card rect
  and drops the card).
- **Entire-View fit** by default (`<zoom type='entire-view'/>` in worksheet windows
  + dashboard viewpoints) — matches the user's `Our.twb` reference exactly.
- **Duplicate sheet names auto-renamed** (`Sales` → `Sales 2` …) so an export never
  blocks/breaks (LaDataViz refuses to export on dup names; we don't). Two layers:
  `faithfulSpec`'s `uniqName` dedupes at creation, AND `exporter.dedupeWorksheetNames`
  is a generator-level safety net for ANY spec (no-op when already unique, so
  byte-identical; remaps sheet/filter zone refs positionally).
- `.twb` well-formed, `<windows>` present, no `<shelf-sorts>`/`NaN`, images
  packaged under `Image/`.
- **NEW (`filter-web-action-33`) — LaDataViz layer conventions, all on CONFIRMED
  XML**: `FILTER/Field` → real quick-filter card; `URL/`·`WEB/` → real web page
  object (`type-v2='web'`, confirmed from the new `Using Web Page Object in
  Tableau.twb` / `Background Image Map with Web Object.twb` references);
  `:showTitle` → worksheet title shown; `:filter`/`:highlight` on a SHEET → real
  dashboard filter/highlight actions (`tsc:tsl-filter` / `tsc:brush`,
  reference-confirmed in `Clinical Trials.twb`). Covered by
  `test/faithful_features_smoke.ts`.

**Multi-dashboard export — BUILT (`multi-dashboard-37`).** One Tableau dashboard
per SELECTED Figma frame, all in one `.twbx` on the shared sample dataset.
`faithful.ts parseFaithfulAll()` → `models: FaithfulModel[]` → `seed.faithfulSpecMulti`
→ a `WorkbookSpec` with `dashboards[]` (the generator + `windowsXml` already
emitted a `<dashboard>` + dashboard `<window>`/viewpoints per spec, so downstream
needed no change). Worksheet names and `Image/` filenames are deduped GLOBALLY
across dashboards; each dashboard's FILTER/ cards bind to a sheet on its OWN
dashboard; `:filter` actions are scoped to the dashboard their source sheet lives
on (`actionsXml` now resolves the source dashboard per action). Covered by
`test/faithful_multi_smoke.ts` (2 frames → 2 dashboards, unique names, correct
per-window viewpoints). ✅ **TABLEAU-CONFIRMED (2026-06-28):** the user selected
2+ frames, exported, and both dashboards opened correctly in Tableau 2026.2 with
their own sheets. This is a load-confirmed feature, not just well-formed.

**Navigation — schema known, NOW UNBLOCKED by multi-dashboard, next up.** The
`Navigation Menu Example.twb` reveals the mechanism: navigation is a
**`<nav-action>`** sourced from a *worksheet zone* acting as a button, with
`<params><param name='sheet' value='<target dashboard>' /></params>` (NOT a
native `type-v2='navigation'` object — that appears nowhere). Now that an export
can contain **>1 dashboard** to move between, `BUTTON/`→navigation is the natural
next feature: emit a `<nav-action>` per `BUTTON/` layer whose label/target names
another dashboard frame. (BUTTON/ still renders faithfully as its styled
text/rect today — no nav-action yet.)

**Worksheet swap = import the user's REAL sheets — BUILT (`import-swap-34`).**
"Swap" means: import worksheets the user already built (in an existing `.twbx`)
and substitute them for the demo SHEET/ placeholders, so the export carries their
real sheets + data instead of the Region/Sales sample. How it works:
- `src/plugin/twbImport.ts` (UI) `parseImport(buf, fileName)` unzips the upload
  (JSZip), then **string-slices** (never re-serializes — keeps the namespaced XML
  byte-exact) the `<worksheet>` blocks, the `<datasource>` blocks they depend on,
  the `document-format-change-manifest` entries those need, and every `Data/` +
  `Image/` asset. Returns `worksheetNames` + a `payloadFor(names)` that builds an
  `ImportPayload` (in `spec.ts`) for a chosen subset. Extraction anchors on
  Tableau's stable 4-space indentation (`\n    <tag …>…\n    </tag>`).
- `spec.ts`: `WorkbookSpec.imports?: ImportPayload` (worksheetXml/datasourceXml
  maps, manifestEntries, assets).
- `workbookGenerator.ts`: `manifestXml(spec)` UNIONS imported manifest entries;
  imported `<datasource>`/`<worksheet>` blocks are spliced verbatim into their
  sections; imported worksheet names join `wsNames` so each gets a standard
  worksheet `<window>` and shows in dashboard viewpoints.
- `exporter.generateSpecWorkbook`: DROPS any generated demo worksheet whose name
  an import replaces (so the windows mapping doesn't collide); the SHEET/ zone
  keeps the name → now resolves to the imported sheet.
- `twbxBuilder` + `exporter`: imported `Data/`/`Image/` files are repackaged at
  their EXACT paths (so `filename='Data/…'` connections resolve); our sample CSV
  stays at `Data/data.csv` — no collision.
- UI (`App.tsx`): a file input under Export uploads the `.twbx`, then shows a
  **checklist** of its worksheets (all pre-checked). **"Add N sheet(s) to Figma"**
  sends `add-sheets` → sandbox `code.ts addSheets()` creates a `SHEET/<name>`
  placeholder frame (labelled card) for each checked sheet in an **empty staging
  area to the RIGHT of the dashboard frame** (as a SIBLING, `frame.parent`, at
  `frame.x+frame.width+80` — NOT inside the frame, so it never overlaps the
  design); skips already-staged names. The user then **drags each card onto the
  dashboard** where they want it; once it's inside the frame it's exported and
  name-matched to its real sheet. So no hand-naming — check the list, the layers
  are created, drag into place (`import-staging-36`).
- Test `test/twb_import_smoke.ts`: imports from `examples/DM_Dashboards.twbx`,
  swaps `Sheet 15` (Excel-backed federated ds), asserts the foreign
  datasource/worksheet/window are spliced, the `.xlsx` is packaged, the demo of
  that name is dropped, and the 192 KB merged `.twb` is well-formed (minidom).

⚠️ Generated + well-formed + minidom-clean, but **merging foreign XML is the
highest load-risk thing in the project** — NOT yet opened in the user's Tableau.
First real test: upload a real `.twbx`, name a layer `SHEET/<exact sheet name>`,
export, open in 2026.2. If a swapped sheet errors, decompile and compare the
spliced datasource block against a known-good standalone export of that sheet.
Known gaps for a future pass: extract/`.hyper` connection-path edge cases;
imported sheet that references a parameter/extract our manifest union misses;
collision if a generated sheet and an imported sheet share a name with different
data (today the import wins).

**Unconfirmed (needs the user to open in Tableau after a manifest re-import):**
- Whether `entire-view-29` visually matches `multi.twbx`/their `Our.twb` in
  Tableau. The user's reports have repeatedly come from STALE Figma builds — ALWAYS
  have them confirm the footer reads the current tag before trusting a screenshot.

**Deferred / known limits:**
- **Sample data only.** SHEET/ worksheets bind to the built-in Region/Sales/
  Profit dataset, not the user's real data (Tableau needs a data source; bind via
  the Data tab or a future feature). This is inherent to the approach.
- **No descending bar sort** (shelf-sorts is a load-killer; see §7).
- **Mark color is uniform gray** to match `multi.twbx`. An open offer to the user:
  pull the *actual fill color from each Figma layer* so a blue chart exports blue
  (design-color route) instead of LaDataViz's gray. Not yet done.
- Floating layout (absolute Figma px) won't perfectly match LaDataViz's nested
  `layout-flow` spacing; minor cosmetic quirks remain (e.g. detached area-axis
  label strip). Routing faithful zones through the container/geometric-layout
  engine is the bigger rework if pixel-spacing parity is needed.

---

## 11. Key files (plugin)

```
src/shared/
  types.ts          DashboardModel, FaithfulModel/FaithfulZone, message types
  spec.ts           WorkbookSpec/WorksheetSpec/DashboardSpec/ZoneSpec, LayoutMode
  constants.ts      TABLEAU build consts, RT2026/AGG2026/MANIFEST, LAYER_PREFIXES, matchLayerPrefix
src/plugin/        (sandbox: code/parser/faithful; UI: the rest)
  code.ts           sandbox entry; message switch; parseAndSend/sendFaithful/applyTagsAndResend
  parser.ts         heuristic parse → DashboardModel; applyAutoTags; exportPng/attachImages
  faithful.ts       parseFaithful → FaithfulModel (the primary transpiler); attachFaithfulImages
  seed.ts           seedSpecFromModel + faithfulSpec + blankSpec; sample dataset
  workbookGenerator.ts  WorkbookSpec → .twb XML  ← worksheet/pane/zone styling lives here
  exporter.ts       generateSpecWorkbook/exportSpecTwbx + validateTwb (the load guards)
  twbxBuilder.ts    zip .twb + Data/ + Image/ → .twbx blob, download
  csv.ts / xlsx.ts  data upload/parse/type-infer/sample rows
  tableauGenerator.ts / mapper.ts  OLD DashboardModel→.twb path (legacy, still tested)
src/ui/
  App.tsx           tabs, message handler, the single export button, BUILD tag
  editor/*          DataPanel, SheetsPanel, LayoutPanel, LayoutCanvas
  devMock.ts        browser stand-in for the Figma sandbox
  main.tsx/index.html/styles.css
scripts/build-ui.mjs  the esbuild single-file UI build (do not use vite build for UI)
```

---

## 12. Working agreements (from the user)

- **Make only the specific change requested.** Don't add backgrounds/tooltips/
  badges/animations unless asked. Less is more.
- For UI/visual work, change incrementally and verify rendering — never sweeping
  CSS that risks a black screen.
- When an export looks wrong: **decompile the actual generated `.twbx` and compare
  zone-by-zone to the LaDataViz reference** — don't guess from a screenshot. (A
  regex splitting on `(?=<zone)` truncates leaf bodies; match
  `(<zone…>)(.*?)</zone>` or read raw bytes near a `friendly-name`.)
- When a `.twb` won't open and you can't run Tableau: get a **reference export
  from the user's exact Tableau version** rather than guessing the schema (we
  burned ~6 round trips guessing before a reference resolved it in 2). Ask them to
  Connect → Text file → CSV, **double-click** one dim + one measure (verify the
  chart is visible), add a Dashboard, **File → Save As → `.twb`**.

---

## 13. Memory note (for AIs without the local memory)

The local Claude memory for this project lives at
`C:\Users\utkar\.claude\projects\D--wireframe\memory\` (machine-local, not in the
repo). Its substance is captured here in §3–§12. The memory files are:
`wireframe-clinical-trial-project.md` (the running version log v1→present),
`tableau-twb-2026-format.md` (the recipe in §7), `tableau-get-reference-twb.md`
(the debug workflow in §12). On a device without that memory, **this file is the
source of truth** — keep it updated when the plugin changes (bump the build tag
and the "current state" sections).

---

## 14. Quick start for a new session

1. `cd figma-tableau-plugin && npm install`.
2. Read §3 (architecture) and §6–§7 (worksheet styling + load-killers).
3. `npm test` and `npx tsc --noEmit` — must be green before and after changes.
4. Make the change; re-run tests; `npm run build`; **bump `BUILD` in `App.tsx`**.
5. Tell the user the new build tag and that they must re-import the manifest in
   Figma (quit Figma, remove + re-import) before the change shows up.
6. State clearly what is *Tableau-confirmed* vs *only generated/well-formed*.
