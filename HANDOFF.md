# Wireframe → Tableau — Project Handoff

> Self-contained context for any AI/engineer picking this up, **including on a
> device without the local Claude memory**. It folds in the essential facts from
> the private memory files (the Tableau 2026.2 recipe, the reference-export
> workflow, and project state). Last updated: **2026-06-30**, build
> `swap-match-clone-48`.
>
> ✅ **TABLEAU-2026.2-CONFIRMED by the user (2026-06-30): worksheet SWAP and
> prototype-NAVIGATION both work end-to-end.** Uploading a `.twbx` and swapping in
> the user's real worksheets renders their real sheets + data in the opened
> workbook (not demo), and a `Nav/` layer wired with a Figma "Navigate to"
> prototype interaction exports as a working nav button that switches
> dashboards/worksheets in Tableau. These were the two biggest remaining
> "generated-but-not-confirmed" items — both are now load-confirmed, joining the
> already-confirmed **multi-dashboard** export and **nav-action** mechanism (build
> 46/47). Build 47 fixed three reported swap/nav bugs (worksheet-swap shares ONE
> imported sheet across every copy of a placed `SHEET/` via `applyImportedSwap` in
> `exporter.ts`; a Nav/ link to a SHEET adds ONLY that worksheet via
> `FaithfulModel.sheetOnly` + `materializeSheetOnly`); build 48 made swap matching
> case/space-tolerant (`normName`) so real sheets stop falling back to demo data.

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
  `notify`, `add-sheets` (stage imported sheets as `SHEET/` frames),
  `insert-default` (Defaults tab — drop a ready-made tagged starter component).
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
| `BUTTON/Go to Sales > Sales` (or `->`) | a **navigation button** that switches to the named dashboard; no target / 2 frames → toggles to the other. Emitted as a **button-worksheet + `<nav-action>`** (NOT the native `<button>` object — that's rejected in floating dashboards). See §10 |
| `Nav/Open Details` | a navigation button whose target = the layer's Figma PROTOTYPE INTERACTION (its "Navigate to" reaction), not the layer name. Destination is a `SHEET/` node → navigates to that **worksheet**; else → its **dashboard** (auto-included in the export if unselected). Also a button-worksheet + `<nav-action>`. Build 43/45; see §10 |
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

9. **Unique `<windows>` identity** — every `<window>` name AND every `<simple-id
   uuid>` inside `<windows>` must be UNIQUE, or load fails with **D2E8DA72**
   ("element 'windows' declares duplicate identity constraint unique values").
   Hit when several selected frames share a name (e.g. 5 "Data Metrics"): they'd
   make duplicate dashboard-window names, and — because the nav feature keys the
   per-dashboard window uuid by NAME — duplicate uuids too. Fixed in
   `seed.uniqueDashNames()` (dashboard names deduped up front: "X", "X 2", …,
   flowing into the spec/actions/nav-targets/window-uuid consistently). Belt-and-
   braces: `exporter.validateTwb` now THROWS on any duplicate window name/uuid.

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
- **The native `<button>` dashboard-object** (`type-v2='dashboard-object'` + a
  `<button action='tabdoc:goto-sheet'>` child) → **D2E8DA72** "no declaration found
  for element 'button'" in a FLOATING dashboard (`nav-action-buttons-45`,
  Tableau-confirmed by the user). multi.twbx uses this element but only as a TILED
  object inside a `layout-flow`; a floating zone's content model
  `(formatted-text,layout-cache?,zone,flipboard,zone-style?)` doesn't permit it.
  We DON'T use it — navigation is `<nav-action>` + button-worksheets (see §10).
  `exporter.validateTwb` now THROWS if a `<button` element ever reappears.
- **`<actions>` in the wrong position** → D2E8DA72 "element 'actions' is not
  allowed". The `<workbook>` content model fixes child ORDER: `…datasources?,
  datasource-relationships?, mapsources?, shared-views?, **actions?**, worksheets?,
  dashboards?, windows…`. So `<actions>` MUST be emitted AFTER `</datasources>`
  and BEFORE `<worksheets>` — NOT at the end (`nav-action-order-46`). (The old
  filter/highlight actions had this latent bug but it never fired because they
  were opt-in + off; nav-actions always emit, so it surfaced.) Locked by an order
  assertion in `faithful_nav_smoke.ts`.
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
- `faithful_flow_smoke.ts` — `faithfulSpec(model, 'flow')`: tiled root + nested
  `layout-flow`, all content zones placed, enclosing card/bg rects dropped, NO
  container background (confirmed-XML discipline), load-safe; and the default
  (no layout arg) stays floating with no layout-flow.
- `faithful_nav_smoke.ts` — `BUTTON/` named-target nav buttons (explicit `>`,
  A↔B toggle, unresolvable→text fallback, `window-id`==dashboard `simple-id`).
- `faithful_navlink_smoke.ts` — `Nav/` interaction nav (`nav-interactions-tabs-43`):
  a Nav→frame resolves to a dashboard window, a Nav→SHEET node resolves to a
  worksheet window, an unresolvable destination falls back to a plain button.
- `faithful_navsheet_smoke.ts` — (build 47) a Nav→SHEET whose frame wasn't
  selected adds ONLY the worksheet (a `sheetOnly` model) — NO extra dashboard;
  the nav-action targets that worksheet.
- `twb_import_smoke.ts` — worksheet swap from `examples/DM_Dashboards.twbx`; also
  (build 43) asserts the verbatim imported filter param + swapped-sheet title.
- `twb_import_share_smoke.ts` — (build 47) the SAME imported sheet on TWO
  dashboards swaps to ONE worksheet on both (match by `baseSheetName`); the
  deduped demo copy is pruned and both dashboard windows show the imported sheet.

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
table. Build tag is in `App.tsx` `const BUILD` (currently `swap-match-clone-48`).
The export covers **all selected frames** (one dashboard each), **always
pixel-exact floating**. The **"Responsive layout (flow containers)"** checkbox was
**REMOVED from the UI** (`floating-only-42`): flow mode reflows the design via the
guillotine engine so it can NEVER match Figma pixel-for-pixel, and the user kept
hitting it by accident and seeing a "messed" layout. The export now hard-codes
`faithfulSpecMulti(models)` (floating). The flow code path (`applyFlowLayout`,
`faithfulSpec(model,'flow')`, the tiled generator) still EXISTS and is still
tested by `faithful_flow_smoke.ts` — it's just not reachable from the UI, so it
can be re-exposed later if a real responsive use-case appears. Build tag is now
`floating-only-42` (native nav buttons + design-color marks + dup-name fix +
flow toggle removed — see §10 and §7.9).

**Tabs added (`nav-interactions-tabs-43`).** `App.tsx` now has a 3-tab bar under
the brand block — **Export** (the existing workflow), **Syntax**, **Defaults**:
- **Syntax** is static documentation of every layer-name convention (`SHEET/`,
  `Nav/`, `BUTTON/`, `FILTER/`, `KPI/`, `Image/`, `URL/`, `TEXT/`, `CONTAINER/`)
  with the `[type]` tags and `:option` suffixes. Pure reference, no plugin calls.
- **Defaults** inserts ready-made, correctly-named **starter components**: a grid
  of cards (`Worksheet`, `KPI`, `Nav button`, `Named button`, `Filter`, `Image`,
  `Web object`, `Text`) that send `insert-default` → `code.ts insertDefault(kind)`,
  which drops a `SHEET/New Sheet[bar]` / `Nav/Go to…` / `FILTER/Region` / … frame
  in the empty area beside the dashboard (same staging spot as `add-sheets`). The
  user drags it onto the design and restyles freely — the NAME carries the Tableau
  mapping. Syntax/Defaults render with or without a frame selected; the footer +
  export button show only on the Export tab.

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

**Responsive layout-flow — BUILT but REMOVED FROM THE UI (`floating-only-42`).**
⚠️ The checkbox is GONE — flow reflows the design and can't match Figma exactly,
and the user kept hitting it accidentally (two "messed layout" reports were just
this toggle being on). The code below still exists and is tested, but the export
always uses floating now. (Re-expose only with a real responsive use-case + a
clearer UX.) A **"Responsive layout (flow containers)"** checkbox (Export card,
default OFF) used to map
the faithful export onto nested Tableau `layout-flow` containers — the LaDataViz
structure (its `multi.twbx` nests 31). `seed.applyFlowLayout(dash)` reuses the
PROVEN guillotine engine (`inferLayoutTree`) + the generator's existing tiled path
(both already shipped on the heuristic `seedSpecFromModel` path), so no new
load-risky XML. Because flow containers TILE and — **confirmed from EVERY
reference (0 hits)** — a `layout-flow` zone may NOT carry a background (in
`multi.twb` every background lives on a LEAF zone: worksheet card, `empty` rect,
or button — never on a flow/basic container), enclosing card rects are dropped
but their **colour is PRESERVED** (`flow-cards-40`): `applyFlowLayout` now
**propagates** each enclosing panel card's `bg`+`cornerRadius` onto the content
tiles it encloses (a leaf tile DOES render a bg in tiled mode), instead of letting
the card go transparent. The full-frame **page** background (a rect ≥80% of the
dashboard area) is skipped — the page colour stays via the dashboard's outer
zone-style; smaller inner cards are applied last so they win; image tiles are
left alone (bitmaps draw their own pixels); a tile that already has its own
distinct colour is not overwritten. Pure-leaf decorative rects (dividers/chips
that enclose nothing) stay as `empty` tiles. **Default stays floating** (the
Tableau-confirmed pixel-exact path) and `applyFlowLayout` falls back to floating
on any failure, so flow mode can never regress exact mode. Covered by
`test/faithful_flow_smoke.ts` (tiled root, nested layout-flow, all content zones
placed, NO container background, **a colored KPI panel's colour propagated to its
tile**, load-safe; floating default unchanged). The toggle is wired through a
`flowRef` in `App.tsx` (the once-registered handler reads the latest choice).
⚠️ **Generated + well-formed + DOMParser-clean, NOT yet opened in the user's
Tableau** — first real test: tick the box, export an Auto-Layout design, open in
2026.2, compare reflow vs the floating export. The remaining flow imperfection vs
floating: a panel colour is reproduced per-tile (the gaps BETWEEN tiles aren't
coloured), and tiles don't move with the panel on manual window-resize. v2 for
exact panels would wrap a card region in a nested `layout-basic` (confirmed
nestable inside `layout-flow` in `Navigation Menu Example.twb`) carrying the bg as
a filling leaf `empty` zone + the content as absolute children.

**Navigation — BUILT (`nav-button-39`), via the NATIVE button object.** The
authoritative mechanism is **LaDataViz's own `multi.twbx`**, NOT the older
`Navigation Menu Example.twb`: LaDataViz uses a **native Tableau navigation
button** — a `<zone type-v2='dashboard-object'>` whose child is
`<button action='tabdoc:goto-sheet window-id=&quot;{UUID}&quot;' button-type='text'>`
+ `<button-visual-state>` (caption / `button-caption-font-style` / background-
color) + a borderless margin-only `<zone-style>`. The `window-id` is the TARGET
dashboard window's `<simple-id uuid>`. (The `nav-action` worksheet-as-button
approach in `Navigation Menu Example.twb` is the OLD technique and was NOT used.)

How our build works:
- `faithful.ts walk()` now has a `BUTTON/` branch (like SHEET//FILTER/): a layer
  named **`BUTTON/anything > TargetDashboard`** (or `->`) emits a `button`
  FaithfulZone and does NOT recurse. **The caption is the text the designer drew
  INSIDE the button** (`firstTextStyle()` reads the child TEXT's characters +
  color + size), falling back to the layer-name label only when there's no inner
  text; the **target** comes from the layer name's `> Target` part
  (`parseButtonName()`). The button's own fill is the background.
- `seed.ts buildFaithfulDashboard` maps it to a `button` ZoneSpec; a post-pass in
  `assembleFaithfulWorkbook` **resolves the target** once all dashboards exist:
  explicit `> Target` honored only on a real (case-insensitive) dashboard match;
  no explicit target + exactly 2 dashboards → the OTHER one (A↔B toggle); >2 →
  next with wrap. A button never targets its own dashboard. Unresolvable → target
  cleared → renders as a **styled text zone** (load-safe, just non-navigating).
- `workbookGenerator.ts`: `generateWorkbookXml` assigns each dashboard a **STABLE
  window uuid** (`dashUuid`) up front, threaded into BOTH the button
  (`window-id`) and the dashboard window's `<simple-id>` (`windowsXml`).
  `emitZone` emits the native `dashboard-object` button **only when the target
  resolves**; `manifestXml` adds **`BasicButtonObject` + `BasicButtonObjectText
  Support`** (required feature flags, confirmed in `multi.twbx`) only when a nav
  button is present (button-free workbooks stay byte-identical).
- Covered by `test/faithful_nav_smoke.ts`: 2 frames, a button targets the other
  dashboard, the `goto-sheet window-id` matches that dashboard window's
  `simple-id` exactly, the manifest flags are present, an unresolvable target
  falls back to a text zone, load-safe (windows / no shelf-sorts / no NaN).

⚠️ **Generated + well-formed + structurally byte-identical to LaDataViz's
confirmed `multi.twbx` button, but NOT YET opened in the user's Tableau.** First
real test: make a button frame whose inner text is the caption, name the frame
`BUTTON/x > <other frame name>` (or just `BUTTON/x` with 2 frames selected),
export both frames, open in 2026.2, click the button — it should switch
dashboards.

**Navigation by Figma INTERACTION + nav-to-worksheet + auto-include — BUILT
(`nav-interactions-tabs-43`).** A new **`Nav/Label`** prefix drives navigation
from the layer's **Figma prototype interaction** instead of its name (the user's
explicit ask). End-to-end:
- `faithful.ts walk()` has a `Nav/` branch (mirrors `BUTTON/`): it reads the
  layer's `reactions[]` via `navDestination()` (first `actions[].type==='NODE'`
  → `destinationId`) and records it as `FaithfulZone.navTargetId` on a button
  zone (caption = inner text or the label after `Nav/`).
- New async **`expandNavTargets(models)`** (in `faithful.ts`, called from
  `code.ts sendFaithful` BEFORE `attachFaithfulImages`): resolves each
  `navTargetId` via `getNodeByIdAsync`, finds its enclosing frame, and **appends
  that frame as an extra model if the user didn't select it** (one level deep, so
  a single link can't drag in the whole prototype graph). Sets `navTargetFrameId`
  + `navTargetIsSheet`. `buildModelForFrame` now treats a frame whose OWN name is
  `SHEET/…` as a single worksheet (so a Nav target that's a standalone SHEET frame
  becomes one worksheet, id == frame id).
- `seed.ts assembleFaithfulWorkbook`: a nav-resolution pass (using `ctx.sheetIdToWs`
  = Figma sheet-node-id → worksheet name, and `frameIdToDash` = frame id →
  dashboard name) runs BEFORE the `BUTTON/` name-convention loop (which now skips
  nav-resolved zones). A SHEET destination → `ZoneSpec.targetWorksheet`; any other
  → `targetDashboard`; unresolved → plain button.
- `workbookGenerator.ts`: a new **stable `wsUuid` map** (mirrors `dashUuid`) gives
  every worksheet window a fixed `<simple-id>`, so a nav button can point its
  `goto-sheet window-id` at a **worksheet** window, not just a dashboard. The
  button branch emits whichever target resolved.
- Covered by `test/faithful_navlink_smoke.ts`: a Nav→frame resolves to the
  dashboard window, a Nav→SHEET node resolves to the worksheet window, an
  unresolvable destination falls back to a plain button, and each `window-id`
  matches its target window's `simple-id`.

✅ **TABLEAU-CONFIRMED (2026-06-30).** The user wired a `Nav/` layer with a Figma
"Navigate to" prototype interaction, exported, and the resulting nav button
switches dashboards/worksheets in Tableau 2026.2. The full chain works:
*prototype the navigation in Figma → working navigation in the exported workbook.*
(The Figma-side reaction reading `navDestination`/`expandNavTargets` runs in the
real plugin sandbox; the smoke test feeds the post-resolution fields directly.)
This rides on the nav-action mechanism (build 45/46) — not the dead native
`<button>` object.

**Navigation REWRITTEN to `<nav-action>` (`nav-action-buttons-45`, 2026-06-29).**
⚠️ The native `<button>` dashboard-object (above, builds 39–44) **does NOT load in
the user's Tableau** — confirmed: `D2E8DA72` "no declaration found for element
'button'". multi.twbx uses that element but only as a TILED object inside a
`layout-flow`; in our FLOATING dashboard the button zone's content model
`(formatted-text,layout-cache?,zone,flipboard,zone-style?)` forbids it (the user
confirmed multi.twbx itself opens, so it's a tiled-vs-floating limitation). Fix:
navigation now uses the **`<nav-action>` worksheet-as-button** mechanism, ported
from `examples/Navigation Menu Example.twb` (manifest flag `NavigationAction`):
- Each `Nav/`/`BUTTON/` layer becomes a **button-WORKSHEET** (`WorksheetSpec.navButton`):
  a Text-mark sheet showing the caption via a string-literal calc
  (`<calculation class='tableau' formula='&quot;Caption&quot;'/>`) on the text
  encoding + a `<customized-label>`, with the button colour as the table
  background. Generated by `workbookGenerator.buttonWorksheetXml` (verbatim from
  the reference's "base" sheets). It's placed as a normal floating **sheet zone**.
- Each resolved button gets a navigate `ActionSpec` (`kind:'navigate'`) →
  `actionsXml` emits a `<nav-action caption='Go to X' name='[ActionN]'>` with
  `<activation type='on-select'/>`, `<source dashboard='<button's dash>' type='sheet'>`
  EXCLUDING every other sheet on that dashboard (so only the button fires), and
  `<params><param name='sheet' value='<target>'/></params>`. Target = a dashboard
  name (Nav→frame / BUTTON name) or a worksheet name (Nav→SHEET node).
- nav-actions emit ALWAYS; `includeActions` now only gates the tsc filter/highlight
  actions (`includeActions = actions.some(a=>a.kind!=='navigate')`).
- Removed: the `dashboard-object`/`<button>` emit branch, the `BasicButtonObject`
  manifest flags, and the per-button `dashUuid`/`wsUuid` window-id wiring (the
  stable `wsUuid` is still used for worksheet-window simple-ids). `validateTwb`
  throws on any `<button` (safety net). Tests: `faithful_nav_smoke.ts` (BUTTON/) +
  `faithful_navlink_smoke.ts` (Nav/) rewritten to assert the nav-action structure.

⚠️ **Reference-backed (Navigation Menu Example uses exactly this) + smoke-tested,
but the nav-action element itself is NOT yet confirmed in the user's 2026.2.** The
reference is a 2019 file; `<nav-action>` is long-standing and far more likely to
load than the rejected `<button>`, but confirm by exporting + clicking. If it
fails, get a reference: have the user build a 2-dashboard workbook with a working
navigation button in THEIR Tableau and export it (`tableau-get-reference-twb`).

**Bug-fix round (`nav-fixes-titles-44`, 2026-06-29) — from user testing:**
1. **Nav/ wasn't navigating / always went to a dashboard.** Root cause: the
   prototype link is usually wired on a CHILD of the `Nav/` frame, so
   `navDestination` (reading only the frame's own `reactions`) returned nothing →
   the button fell through to the `BUTTON/` A↔B *dashboard* toggle. Fixes:
   `navDestination` now **searches the subtree** for the first NODE reaction;
   `sendFaithful` calls **`figma.loadAllPagesAsync()`** first (dynamic-page docs);
   and `FaithfulZone.isNav` marks Nav/ buttons so seed **never** applies the
   BUTTON/ name-toggle to them (an unreadable link → plain button, never a wrong
   jump). A `SHEET/` destination correctly resolves to a worksheet window now that
   the destination id is actually captured.
2. **Swapped/added sheets weren't exported.** `addSheets` staged `SHEET/` frames
   as SIBLINGS (and selected them); `resolveFrame` returned a frame-like node
   as-is, so export saw the lone cards, not the dashboard. Fixes: `addSheets` now
   appends the `SHEET/` frames **INSIDE the dashboard frame**, below the content
   (frame grown taller, no overlap), and leaves the DASHBOARD selected;
   `resolveFrame` now returns the **OUTERMOST** frame ancestor, so a selected
   nested `SHEET/` frame resolves to its dashboard. The sheets are children → the
   walk picks them up → they swap in their real data.
3. **Workbook-name box ignored.** The faithful export rebuilt the name from the
   frame title. `App.tsx` now mirrors `spec.workbookName` into `workbookNameRef`
   and applies it to the faithful spec before export, so the downloaded `.twbx`
   (and the inner `.twb`) match the typed name.
4. **Sheet titles.** Every faithful SHEET zone now exports with
   `show-title='true'` by default (the "Show Title" checkbox stays checked), and a
   `seed.dropFigmaTitles()` post-pass removes each chart's redundant Figma heading
   text — a SHORT text zone whose width fits within the sheet and which sits in its
   title band (≈60px above the top down into its top quarter), inside the card or
   just above it. Wide section/page titles spanning multiple charts and unrelated
   body text are kept. Covered by `test/faithful_features_smoke.ts`.

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

✅ **TABLEAU-CONFIRMED (2026-06-30).** The user uploaded a real `.twbx`, staged
the `SHEET/<name>` layers, dragged them onto the design, exported, and the
imported worksheets render with their **real data** in Tableau 2026.2 (not the
Region/Sales demo). This clears the long-standing ⚠️ on what was **the
highest load-risk feature in the project** — merging foreign `<datasource>` /
`<worksheet>` XML verbatim + repackaging the imported `Data/` assets. Builds 34→48
got it there (the build-48 `normName` case/space-tolerant match was the final fix
— before it, a `SHEET/` layer that differed from the imported worksheet by case or
spacing silently fell back to demo data). Known gaps still open for a future pass
(none block the confirmed happy path): extract/`.hyper` connection-path edge
cases; an imported sheet referencing a parameter/extract our manifest union
misses; collision if a generated sheet and an imported sheet share a name with
different data (today the import wins); and the in-memory `importedRef` isn't
remembered across plugin sessions, so the `.twbx` must be re-uploaded in the same
session as the export (App.tsx warns when no workbook is loaded).

**Swap improvements — BUILT (`nav-interactions-tabs-43`):**
- **De-dupe by NAME, not position (bug fix).** `exporter.dedupeWorksheetNames` now
  seeds its used-set with the **imported worksheet names**, so a generated demo
  sheet can never collide with — or get its zone repointed onto — an imported one.
  This fixes the reported "swap takes some other sheet" (dedupe was renaming /
  positionally remapping across the import boundary). The swap changes the sheet
  strictly by name; an imported-bound zone is left untouched.
- **Swapped sheets show their REAL title.** On swap, `App.tsx` sets
  `show-title='true'` on each matched SHEET/ zone, so Tableau renders the imported
  worksheet's actual name in the zone's title bar instead of leaving it hidden.
- **Filters lifted from the imported sheets.** `twbImport.filtersFor(names)` parses
  each imported worksheet's `<slices>` and returns its quick-filter columns
  verbatim (`[datasource].[field-instance]`, skipping internal Measure-Names /
  object-id pseudo-columns). On swap, `App.tsx` drops one **real filter card per
  filter** onto the dashboard just above the sheet it controls, carrying the
  verbatim param on `ZoneSpec.filterParam`. The generator's filter branch uses that
  param directly (so the card filters the IMPORTED datasource, not our sample one),
  and `filtersByWs` skips `filterParam` zones (imported sheets already carry their
  filters internally). Covered by the extended `test/twb_import_smoke.ts` (asserts
  the verbatim `[federated.*]` param + `show-title='true'` on the swapped sheet).

**Swap sharing — BUILT (`swap-share-navsheet-47`).** The whole swap step moved out
of `App.tsx` into a pure, tested `applyImportedSwap(spec, imp)` in `exporter.ts`.
The match is now by **base name**, not the deduped worksheet name: seed records the
pre-dedupe `baseSheetName` on each sheet `ZoneSpec`, and the swap repoints **every
copy** of a placed `SHEET/X` (across all dashboards) at the one imported worksheet
`X`, then prunes the orphaned `X 2`/`X 3` demo worksheets. This fixes the reported
"swapped sheets don't export, only the defaults do" + "duplicate sheet names show
different sheets despite placing the same sheet" — those were the dedupe suffix
(`uniqNameIn` is workbook-global) breaking the exact-name match for every copy
after the first. A same-name repeat on the SAME dashboard still keeps its deduped
demo name (Tableau can't place one worksheet on a dashboard twice). The demo-only
multi/dupname dedup (Revenue/Revenue 2) is unchanged — sharing only happens on the
swap path. Test: `test/twb_import_share_smoke.ts`.

**Unconfirmed (needs the user to open in Tableau after a manifest re-import):**
- Whether `entire-view-29` visually matches `multi.twbx`/their `Our.twb` in
  Tableau. The user's reports have repeatedly come from STALE Figma builds — ALWAYS
  have them confirm the footer reads the current tag before trusting a screenshot.

**Deferred / known limits:**
- **Sample data only.** SHEET/ worksheets bind to the built-in Region/Sales/
  Profit dataset, not the user's real data (Tableau needs a data source; bind via
  the Data tab or a future feature). This is inherent to the approach.
- **No descending bar sort** (shelf-sorts is a load-killer; see §7).
- **Mark color: design-color route is BUILT (`nav-button-39`).** `faithful.ts
  dominantChartColor()` samples the most vivid solid/gradient fill the designer
  drew INSIDE each `SHEET/` layer (skipping the card's white/near-black/low-sat
  background) and passes it as `FaithfulZone.markColor`; `seed.ts` uses it as the
  worksheet mark color, **falling back to the LaDataViz gray `#898989` only when
  no confident colored fill is found**. So a blue mock now exports a blue chart.
  Covered by an assertion in `test/faithful_capture_smoke.ts` (a blue bar inside
  a `SHEET/` → mark color `#2166DB`, not gray). ⚠️ Generated/well-formed; the
  visual result still wants a Tableau eyeball, but it's load-identical to the gray
  path (only the `mark-color` hex differs).
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
  faithful.ts       parseFaithful → FaithfulModel (the primary transpiler); Nav/ reaction read (navDestination) + expandNavTargets (auto-include destinations); attachFaithfulImages
  seed.ts           seedSpecFromModel + faithfulSpec + blankSpec; sample dataset; Nav/ target resolution (sheet vs dashboard window)
  workbookGenerator.ts  WorkbookSpec → .twb XML  ← worksheet/pane/zone styling lives here
  exporter.ts       generateSpecWorkbook/exportSpecTwbx + validateTwb (the load guards)
  twbxBuilder.ts    zip .twb + Data/ + Image/ → .twbx blob, download
  csv.ts / xlsx.ts  data upload/parse/type-infer/sample rows
  tableauGenerator.ts / mapper.ts  OLD DashboardModel→.twb path (legacy, still tested)
src/ui/
  App.tsx           Export/Syntax/Defaults tabs, message handler, the export button + import-swap (title/filter injection), SyntaxTab/DefaultsTab, BUILD tag
  editor/*          DataPanel, SheetsPanel, LayoutPanel, LayoutCanvas (legacy editor panels, not wired into the current App)
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
