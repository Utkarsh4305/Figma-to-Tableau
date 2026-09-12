# Graph Report - .  (2026-09-12)

## Corpus Check
- 58 files · ~60,463 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 554 nodes · 1169 edges · 35 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 440 · imports: 297 · calls: 164 · imports_from: 150 · PARENT_OF: 59 · ON_BRANCH: 56 · re_exports: 3


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 58 · Candidates: 64
- Excluded: 84 untracked · 1085 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `d5b8999`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `generateSpecWorkbook()` - 20 edges
2. `FaithfulModel` - 18 edges
3. `buildSpecBlob()` - 13 edges
4. `faithfulSpecMulti()` - 13 edges
5. `parseNode()` - 10 edges
6. `parseSelection()` - 10 edges
7. `parseImport()` - 10 edges
8. `WorkbookSpec` - 10 edges
9. `applyImportedSwap()` - 8 edges
10. `seedSpecFromModel()` - 8 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 34 - "Community 34"
Cohesion: 1.00
Nodes (1): root

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (17): root, u32(), crc32, chunk(), pixels, inRoundedRect(), blend(), fillRoundRect() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (14): actionsXml(), wsCardsXml(), windowsXml(), manifestXml(), generateWorkbookXml(), uid(), esc(), hasNavAction() (+6 more)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (46): LIBRARY_COMPONENTS, TEXT_CARD_IDS, KPI_ROWS, fillCaption(), fillKpiRows(), buildLibraryFrame(), DEFAULT_COMPONENTS, buildDefaultFrame() (+38 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (14): rowsToCsv(), generateSampleRows(), MarkType, Aggregation, SpecField, ColorRule, ActionKind, ActionRunOn (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (9): zoneStyle(), cornerXml(), dashboardXml(), DsCtx, clampN(), safeFont(), LayoutNode, DashboardSpec (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.24
Nodes (11): buildRegistryFields(), buildRegistry(), buildDsContexts(), colorStyleBlock(), actionGroupsXml(), datasourceXml(), GenField, hex32() (+3 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (22): sampleData(), DomainDataset, DOMAIN_DATASETS, buildDomainDataset(), domainLabel(), domainDatasetFor(), detectFaithfulDomain(), markTypeOf() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (24): SwapSource, SwapResult, normName(), xmlEscapeName(), newUuid(), renameWorksheetXml(), applyImportedSwap(), collectImageAssets() (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (44): walk(), isFrameLike(), findFrame(), buildModelForFrame(), parseFaithful(), resolveFrame(), collectFrames(), parseFaithfulAll() (+36 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (18): LRect, bands(), partition(), inferLayoutTree(), detectDomain(), markFor(), slugFile(), inferLayoutTree() (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (47): toHex(), solidFill(), solidStroke(), nameMatches(), kpiText(), hasImageFill(), guessChartKind(), WORKSHEET_KEYWORDS (+39 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (14): ParsedImport, decodeEntities(), attrOf(), extractBlocks(), sectionOf(), manifestEntriesIn(), slicesIn(), findTwbName() (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (10): buttonWorksheetXml(), worksheetStyleXml(), markPaneStyle(), worksheetXml(), instanceLine(), tableauType(), MeasurePill, WorksheetSpec (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (5): colToIndex(), textOf(), parseXml(), firstSheetPath(), parseXlsx()

### Community 21 - "Community 21"
Cohesion: 0.50
Nodes (7): matchLayerPrefix(), DashboardModel, assert(), testPrefixes(), testSeedTiled(), testGeometricLayout(), main()

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (22): MsgModelReady, MsgRequestParse, MsgResize, MsgNotify, MsgApplyTags, MsgRequestFaithful, MsgAddSheets, DefaultKind (+14 more)

### Community 17 - "Community 17"
Cohesion: 0.24
Nodes (8): FaithfulModel, assert(), model, main(), assert(), home, detailSheetOnly, main()

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (5): LibraryComponentId, svgProps, ICONS, ComponentDef, COMPONENTS

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (6): TemplateId, IconName, svgProps, ICONS, TemplateDef, TEMPLATES

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (7): UiToPlugin, useExportConfig(), useWindowSize(), Status, useToast(), useImport(), createUiSaver()

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (10): SYNTAX_PREFIXES, CHART_TAGS, SHEET_OPTIONS, svgProps(), TAB_ICONS, SUBTAB_ICONS, SyntaxIconName, SYNTAX_ICONS (+2 more)

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (1): container

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (13): assert(), MIXED, title, track, gradBar, kpiVal, rotBar, blueBar (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.83
Nodes (3): assert(), mk(), main()

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (3): assert(), model, main()

### Community 23 - "Community 23"
Cohesion: 0.50
Nodes (4): assert(), overview, ops, main()

### Community 24 - "Community 24"
Cohesion: 0.50
Nodes (4): assert(), home, details, main()

### Community 25 - "Community 25"
Cohesion: 0.50
Nodes (4): assert(), home, details, main()

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (3): assert(), model, main()

### Community 26 - "Community 26"
Cohesion: 0.50
Nodes (4): assert(), TWBX, model, main()

### Community 27 - "Community 27"
Cohesion: 0.60
Nodes (4): assert(), TWBX, mk(), main()

### Community 28 - "Community 28"
Cohesion: 0.60
Nodes (4): assert(), TWBX, mk(), main()

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (3): assert(), TWBX, main()

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (57): 083bb7b feat: add graphify knowledge graph support and related rules in CLAUDE.md; update .gitignore for graphify artifacts, 094224f feat: enhance domain accent handling and text fitting in Tableau plugin, 09e3023 feat: Implement native navigation buttons in Tableau export, 0dba74b feat(payment-server): add Razorpay billing server for Figma to Tableau plugin, 177b35f feat: Enhance multi-datasource support and expand dashboard templates, 26f7fcc Refactor Tableau Plugin: Remove Background PNG Export, Introduce SHEET Tag Handling, 2889ae5 Add baseline security headers to the marketing site, 2b9732f Enhance export functionality: auto-rename duplicate worksheet names, improve sample data structure, and implement rounded corners for better visualization in Tableau. (+49 more)

## Knowledge Gaps
- **116 isolated node(s):** `root`, `root`, `pixels`, `C0`, `C1` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 34`** (1 nodes): `root`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `container`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FaithfulModel` connect `Community 17` to `Community 2`, `Community 5`, `Community 6`, `Community 29`, `Community 30`, `Community 23`, `Community 24`, `Community 25`, `Community 31`, `Community 26`, `Community 4`, `Community 27`, `Community 28`, `Community 32`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `WorkbookSpec` connect `Community 10` to `Community 14`, `Community 4`, `Community 5`, `Community 7`, `Community 15`, `Community 9`, `Community 13`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `generateSpecWorkbook()` connect `Community 4` to `Community 29`, `Community 17`, `Community 30`, `Community 23`, `Community 24`, `Community 25`, `Community 31`, `Community 21`, `Community 7`, `Community 26`, `Community 27`, `Community 28`, `Community 32`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `root`, `root`, `pixels` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 8` be split into smaller, more focused modules?**
  _Cohesion score 0.12631578947368421 - nodes in this community are weakly interconnected._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.061952074810052604 - nodes in this community are weakly interconnected._
- **Should `Community 9` be split into smaller, more focused modules?**
  _Cohesion score 0.11695906432748537 - nodes in this community are weakly interconnected._