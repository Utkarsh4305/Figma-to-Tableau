# Wireframe → Tableau — Project Handoff

> Self-contained context for any AI/engineer picking this up, **including on a
> device without the local Claude memory**. It folds in the essential facts from
> the private memory files (the Tableau 2026.2 recipe, the reference-export
> workflow, and project state). Last updated: **2026-06-26**, build
> `lds-polish-26`.

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
`FaithfulZone[]` at absolute Figma px:
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
- Line/area get point markers; area gets `mark-transparency='27'`.

### Dashboard sheet zone (floating)
`<zone friendly-name='SHEET/…' name='<worksheet>' show-title='false'>` +
`<layout-cache>` + a white card `<zone-style>` (border none, **padding 8**) so the
fat marks fill edge-to-edge. (`faithfulSpec` sets `markColor:'#898989'` and
`showLabels:true` on every sheet.)

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
   WindowsPersistSimpleIdentifiers`.
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

Floating `.twb` output has historically been kept **byte-identical** across
refactors (smoke 15277 / spec_smoke ~15336–17408 as features were added) — check
the byte counts didn't change unexpectedly when you mean a refactor to be inert.

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
table. Build tag is in `App.tsx` `const BUILD` (currently `lds-polish-26`).

---

## 10. What works vs what's unconfirmed / deferred

**Working & verified (typecheck + smoke + XML inspection):**
- Faithful transpile: text stays text; `SHEET/Name[type]` → real worksheet on
  sample data; rect/image faithful zones; px→pt fonts; 8-digit alpha fills;
  rotated-bar fix; font substitution mapped to Segoe UI.
- LaDataViz-style worksheets: horizontal single-measure bars, gray `#898989`
  fat marks that fill the card, value labels (bars `all` / line-area `line-ends`),
  hidden axes/gridlines/field-labels, area transparency, `show-title='false'`
  card zones.
- `.twb` well-formed, `<windows>` present, no `<shelf-sorts>`/`NaN`, images
  packaged under `Image/`.

**Unconfirmed (needs the user to open in Tableau after a manifest re-import):**
- Whether `lds-polish-26` visually matches `multi.twbx` in Tableau. The user's
  last few reports came from STALE builds — always have them confirm the footer
  tag first.

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
