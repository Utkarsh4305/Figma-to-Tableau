# Wireframe → Tableau — Project Handoff

> Self-contained context for any AI/engineer picking this up, **including on a
> device without the local Claude memory**. It folds in the essential facts from
> the private memory files (the Tableau 2026.2 recipe, the reference-export
> workflow, and project state). Last updated: **2026-07-03**, build
> `razorpay-billing-88` (+ backend/website restructure, v22).
>
> **Latest (v22, 2026-07-03): REPO RESTRUCTURE — `backend/` + `website/` +
> premium CTAs → website.** Three changes, plugin export pipeline untouched:
> - **`payment-server/` → `backend/`** (git-mv; `.env` with the real test keys,
>   `licenses.json`, and node_modules all moved intact). The monolithic
>   `server.js` was split into modules with identical behavior:
>   `src/config.js` (env), `src/services/razorpayClient.js` +
>   `src/services/licenseStore.js` (licenses.json stays at the backend root),
>   and `src/routes/{licenses,payments,webhooks,checkout}.js`, assembled in
>   `src/app.js` (future auth/analytics/subscription-management routers mount
>   there). Smoke-tested after the move: healthz/license/checkout OK and a REAL
>   Razorpay test order created via `/api/create-order`. Any older mention of
>   `payment-server/` in this doc now means `backend/`.
> - **New `website/`** — standalone marketing site (Vite + React + TS +
>   react-router + framer-motion + lucide; Clash Display/Satoshi/JetBrains Mono
>   fonts; premium dark theme: deep charcoal `#07090f`, electric blue
>   `#4D8DFF`, violet `#8B5CF6`, cyan `#3BD6FF`, glass cards, grid+orb+noise
>   backdrops). Home = hero (animated Figma-frame → beam → Tableau-dashboard
>   scene with mouse parallax + floating SHEET//KPI//Nav/ chips), how-it-works,
>   features (8), draggable before/after demo, count-up benefit stats, pricing
>   (Free / Premium glow / Enterprise-soon), FAQ accordion, CTA banner, footer.
>   Routed placeholders keep future URLs stable: /docs /blog /contact /support
>   /login /account /activate /privacy /terms. **`/upgrade?uid=&name=`** is the
>   premium entry: with a uid it hands off to `<backend>/checkout?uid=…`
>   (`VITE_BACKEND_URL`, default localhost:3000); without one it explains that
>   checkout starts from the plugin's Account tab. `npm run build` (tsc+vite)
>   green; dev server `npm run dev` → http://localhost:5173. See
>   `website/README.md` for the ship checklist.
> - **Plugin CTAs** — `openCheckout` (both the export-gate Upgrade button and
>   the Account tab CTA) now opens `${WEBSITE_URL}/upgrade?uid=…&name=…` (new
>   `WEBSITE_URL` in `shared/constants.ts`, currently `http://localhost:5173`
>   — replace before shipping); license polling still hits
>   `PAYMENT_SERVER_URL` directly. manifest devAllowedDomains gained
>   `http://localhost:5173`, allowedDomains gained the website placeholder
>   `https://figma-tableau.example.com` → **re-import the manifest**. tsc + 16
>   suites + build green. Not committed.
>
> **Latest (build 88.1, 2026-07-03): STANDARD CHECKOUT (one-time orders) added
> to the billing server + LIVE test credentials wired.** The server now has two
> modes: with `RAZORPAY_PLAN_ID` set → the build-88 subscription flow; WITHOUT
> it (current state) → **order mode**: `POST /api/create-order` ({uid, amount?
> ≥100 paise, currency?, receipt?} → razorpay.orders.create, default
> `ORDER_AMOUNT_PAISE`=85000 INR) + `POST /api/verify-payment`
> (HMAC-SHA256(order_id|payment_id) timingSafeEqual, then FETCHES the order to
> confirm amount ≥ configured price before granting — create-order accepts a
> caller amount, so signature alone must not grant Premium) → extends
> `validUntil` by `PREMIUM_DAYS` (31). Checkout page branches on a server-sent
> `mode` boot flag (order mode: create-order → Razorpay modal with order_id →
> verify-payment; dismiss + payment.failed handled). `payment-server/.env` now
> holds REAL Razorpay test-mode keys (rzp_test_T91l2EdavMNwEZ; gitignored).
> `PAYMENT_SERVER_URL` (shared/constants.ts) switched to
> `http://localhost:3000` for dev testing — **switch back to the deployed URL
> before shipping**. VERIFIED against the live Razorpay test API: create-order
> returned a real order; amount<100→400, bad/missing sig→400, no-plan
> subscription→503, valid locally-computed HMAC → license granted 31 days →
> /api/license premium:true. tsc + build green. Not committed.
> **TEST-PAYMENT GOTCHA (user hit it, root-caused via `GET /v1/payments`):**
> Razorpay TEST accounts accept DOMESTIC (Indian) payments only — the classic
> `4111 1111 1111 1111` Visa is INTERNATIONAL and fails with
> `international_transaction_not_allowed` (the integration is fine; Razorpay
> declines the card). Working test methods: UPI `success@razorpay` (most
> reliable; `failure@razorpay` = simulated decline), any netbanking bank
> ("Success" button on the test page), domestic Mastercard
> `5267 3181 8797 5449` (any future expiry/CVV, OTP any 4–10 digits; <4 digits
> simulates failure). To debug ANY failed payment, query
> `https://api.razorpay.com/v1/payments?count=10` with Basic auth
> (key_id:key_secret) and read `error_reason`/`error_description` — snippet in
> payment-server/README.md. International cards can be enabled in the Razorpay
> dashboard (Account & Settings → Payment Methods → International), not code.
>
> **Previous (build 88, 2026-07-03): FREE-PLAN GATE + RAZORPAY PREMIUM
> ($10/month unlimited).** User: 15 free export tokens, then $10/month via
> Razorpay. Two halves:
> - **Plugin** — the existing `ft-export-count` (clientStorage) is now a hard
>   gate: `exportAllowed()` in `persistence.ts` (premium OR count <
>   `FREE_EXPORT_LIMIT`=15, `shared/constants.ts`) is enforced in the SANDBOX
>   `request-faithful` handler (UI can't bypass) and mirrored in the UI
>   (`limitReached` swaps the Export button for an Upgrade prompt; free plan
>   shows "N of 15 free exports left" under the button + a usage meter on the
>   Account tab). Premium state is cached in clientStorage key `ft-premium`
>   ({premium, validUntil, subscriptionId}, 3-day grace past validUntil) via
>   new `set-premium` msg; `account-info` now carries userId
>   (figma.currentUser.id — the license key), premium, premiumValidUntil.
>   Account tab: Free/Premium pill, plan card with meter + "Upgrade to Premium"
>   (window.open → server checkout page) + "Refresh status" (fetch
>   `GET /api/license/:uid` → set-premium), plus a silent once-per-session
>   license re-check (`licenseCheckedRef`) that never revokes on network
>   failure (offline users keep the cache). Toasts now also render on the
>   Account tab. manifest.json allowedDomains gained the billing-server
>   placeholder `https://figma-tableau-pay.example.com` + devAllowedDomains
>   `http://localhost:3000` — **replace the placeholder (and
>   `PAYMENT_SERVER_URL` in shared/constants.ts) with the real deployment URL,
>   then re-import the manifest.**
> - **Server** — new top-level `payment-server/` (Node 18 + Express + razorpay
>   SDK, CommonJS, licenses.json file store): `GET /checkout?uid=&name=`
>   (hosted Razorpay Checkout page), `POST /api/subscription` (creates a
>   subscription on `RAZORPAY_PLAN_ID`; `notes.figma_uid` maps webhooks back to
>   the user), `POST /api/verify` (HMAC payment_id|subscription_id),
>   `POST /api/webhook` (raw-body HMAC; charged/activated extend validUntil to
>   current_end, cancelled/halted stop extending), `GET /api/license/:uid`.
>   Setup (Razorpay plan/webhook, deploy, test cards, counter reset via
>   `figma.clientStorage.setAsync("ft-export-count", 0)`) documented in
>   `payment-server/README.md`. CAVEAT noted there: Figma Community-distributed
>   paid plugins are generally required to use Figma's own payments — this flow
>   suits private/direct distribution. tsc clean, 18 suites green, build OK,
>   server smoke-tested (healthz/license/checkout). Not committed.
>
> **Previous (2026-07-03, after build 87): MODULARIZATION REFACTOR (no behavior
> change).** The four monoliths were split into focused modules — same exports,
> same output, build tag unchanged (`image-mode-87`):
> - `faithful.ts` (~1240 → 512 lines) → `faithful/zoneParsers.ts` (SHEET/BUTTON/
>   Nav/FILTER name parsers, markFromTag, dominantChartColor), `faithful/
>   colorGeometry.ts` (px→pt, hex/paint/stroke helpers, rectOf), `faithful/
>   textRuns.ts` (styled segments, line splitting, alignment), `faithful/
>   textFitting.ts` (SEGOE_EMS table, fitFaithfulText), `faithful/
>   rasterization.ts` (base64, attachFaithfulImages, buildImageOnlyModel,
>   attachBackgroundImage — re-exported from faithful.ts).
> - `workbookGenerator.ts` (~1400 → 99 lines, now just orchestration) →
>   `xmlUtils.ts` (uid, escaping, shared helpers), `datasourceXml.ts`,
>   `worksheetXml.ts`, `dashboardXml.ts`, `windowsXml.ts`, `actionsXml.ts`.
> - `seed.ts` (~1480 → 234 lines: blankSpec/seedSpecFromModel/sample data) →
>   `faithfulSpec.ts` (faithfulSpec/faithfulSpecMulti/applyFlowLayout/
>   imageOnlySpec — the primary export path), `domainData.ts` (domain-flavored
>   placeholder datasets), `layoutTree.ts` (guillotine geometric layout).
> - `code.ts` (~940 → 272 lines: message switch + sendFaithful/addSheets) →
>   `builders.ts` (component/KPI-card builders, findDashboardFrame), `drop.ts`,
>   `insert.ts`, `templates.ts` (applyTemplate + the 15 domain layouts),
>   `persistence.ts` (clientStorage: import/account/UI state), `messaging.ts`
>   (typed post()).
> - `App.tsx` (~1240 → 1012 lines) → `ui/hooks.tsx` (useExportConfig,
>   useWindowSize, useToast, useImport).
> Follow-up cleanup on top: unused imports pruned from `faithful.ts`;
> `hasNavAction` moved from `workbookGenerator.ts` into `xmlUtils.ts`.
> Verified after: tsc clean, all 18 test suites green, build OK. Everything
> through build 87 + the refactor is now COMMITTED (`bd876bc` and earlier —
> the long-standing "not committed" backlog is cleared).
>
> **Previous (build 87, 2026-07-03): IMAGE EXPORT MODE (standalone third mode).**
> User: "the export as image is a work with either tiled or floating mode, please
> seclude it, that is works properly independently, like those two." Previously
> the "Export frame background as image" checkbox was a sub-option within
> floating/tiled exports — it rasterized the frame as a background PNG behind
> all the interactive zones. Now it's a third standalone export mode (Image)
> alongside Floating and Tiled: the entire frame is rasterized as a single PNG
> with NO worksheets, NO filters, NO text/rect zones — just the design as a
> static bitmap in a `.twbx`. The three modes are pills on the Export card:
> **Floating** (pixel-exact, default), **Tiled** (responsive flow containers),
> **Image** (full-frame PNG only). When Image is active the background-image
> checkbox is hidden (the entire export IS the image). Implementation:
> new `buildImageOnlyModel()` in faithful.ts rasterizes frames to PNG-only
> `FaithfulModel`s; new `imageOnlySpec()` in seed.ts builds a minimal
> `WorkbookSpec` with no worksheets and one image zone per dashboard;
> `LayoutMode` in spec.ts expanded to `"floating" | "tiled" | "image"`;
> `MsgRequestFaithful.exportMode` added; `sendFaithful` in code.ts skips
> parsing entirely for image mode. tsc clean, 18 suites green, build OK.
> Not committed.
>
> **Latest (build 86, 2026-07-03): FILTER SIDEBAR → HEIGHT-PINNED TOP BAR.**
> User on build 85: "everything is fine but due to filter so much space is
> getting wasted and things are congested" + screenshot: the filter column
> rendered ~HALF the dashboard wide with a giant empty area under 2 filter
> cards. This CONFIRMS (Tableau-observed): **`distribute-evenly` IGNORES a
> child container's width pin** — the sidebar was pinned `fixed-size='200'`
> and still equalized to ~50%. Width pins are simply not trustworthy.
> Fix: FILTER/ cards are no longer a sidebar at all. `applyFlowLayout` now
> re-attaches them as a **height-pinned filter bar row across the TOP** of the
> vert body (prepended to the root vert stack, or the root is wrapped in one):
> equal-width cards via the row's distribute-evenly, row pinned to the clamped
> quick-filter height (70–110px). Height pins in vert stacks are the ONE
> reliable mechanism (reference-proven, user-confirmed across builds). The
> filler zone + `ZoneSpec.flex` + `ContainerSpec.fixedSize` machinery from
> builds 84–85 DELETED (dead). TILED LAYOUT TRUST LIST (hard-won, 4 user
> round-trips): (a) height pins in vert stacks — reliable; (b)
> distribute-evenly horz rows — reliable; (c) width pins — IGNORED under
> distribute-evenly, do not rely on them for layout;(d) never emit a
> strategy-less unequal horz row — undefined distribution, slivers.
> Tests updated; tsc clean, 18 suites green, build OK. Not committed.
>
> **Latest (build 85, 2026-07-03): TILED LAYOUT GENERALIZED (vertical one-char
> text / invisible sheets).** User on build 84: "text is getting messed in some
> places and some sheets are not visible in some dashboards" + screenshot of a
> column crushed to ~1 character per line ("C/a/t/e…"). Root cause: build 84
> emitted UNEQUAL horz rows with NO layout strategy + width pins — a construct
> that exists NOWHERE in the LaDataViz references. Re-audited both references
> and derived the actual invariants (every construct we now emit exists in a
> confirmed-working workbook):
> 1. **Every multi-child HORZ row carries `distribute-evenly`** — both
>    references do this universally; a strategy-less unequal horz row has
>    UNPROVEN distribution semantics and collapsed columns into slivers.
> 2. **All reference pins are HEIGHTS in vert flows** (44/29/104/187/899px);
>    there is not a single width pin. We still allow width pins (Tableau
>    Desktop's fixed-width container pattern) but only when SAFE:
>    - an individually wide pin (>45% of the row) flexes instead (a pinned
>      900px header text starved its siblings into slivers);
>    - pins must sum ≤80% of the row (flexible children always keep ≥20%);
>    - EVEN rows (KPI strips, 50/50 chart pairs) get NO pins at all —
>      distribute-evenly IS the sizing there (reference-exact; pinning
>      some-but-not-all equal children skewed the strip).
> 3. VERT stacks unchanged (height pins + de only when rows are even) —
>    reference-proven.
> New `pinCandidate()` helper + `allowPin` param threaded through
> emitZone/emitContainer. Worst case for an unequal design is now graceful
> equalization (70/30 → 50/50) — nothing can ever be crushed invisible.
> lds_smoke + faithful_flow_smoke updated (wide header unpinned, equal KPI
> leaves unpinned, de on all horz rows, button/sidebar pins kept). tsc clean,
> 18 suites green, build OK. Not committed.
>
> **Latest (build 84, 2026-07-03): TILED PROPORTIONS FIXED (giant filters /
> crushed sheets).** User on build 83's tiled output: "better, but in some
> places the filters are way too big and the sheets are way too small".
> Diagnosed against the ACTUAL LaDataViz references (`examples/Template.twbx`,
> `examples/multi.twbx` — extracted and read the .twb):
> 1. **Both references use FIXED min=max `<size>` even for tiled** — build 83's
>    automatic `<size />` let Tableau re-lay the flow at arbitrary window sizes,
>    distorting the fixed/flexible balance. REVERTED to fixed min=max (scale-to-
>    fit preserves designed proportions with maximized='true').
> 2. **The references do NOT blanket-apply `layout-strategy-id=
>    'distribute-evenly'`**: it appears on genuinely even rows (KPI strips,
>    50/50 chart pairs) but is OMITTED on heterogeneous stacks ('Main Content',
>    'Content'). Our generator stamped it on EVERY >1-child container — so
>    Tableau equalized the `horz{ body, Filters }` root to ~50/50: filters half
>    the dashboard, charts crushed. NOW emitted only when all children have
>    near-equal extent along the flow axis (max ≤ 1.25 × min).
> 3. **Filter cards clamped + filler**: FILTER/ tiles clamp to quick-filter-card
>    bounds (w 160–240, h 70–140) in flow mode, and an invisible FLEXIBLE
>    "Filter Fill" empty zone (new `ZoneSpec.flex`) absorbs the sidebar's
>    leftover height so pinned filter cards aren't stretched down the column.
>    New `ContainerSpec.fixedSize` pins the sidebar's WIDTH explicitly (the
>    flexible filler would otherwise make `nodeFlexible` unpin it — the old
>    check was axis-blind).
> Smoke test updated (fixed sizing, exactly-one distribute-evenly on the even
> chart row, sidebar fixed-size + clamped filter + flexible filler). tsc clean,
> all tests green, build OK. Tiled mode now LOADS in the user's Tableau
> (implied by their feedback); awaiting visual re-confirm of proportions. Not
> committed.
>
> **Latest (build 83, 2026-07-03): TILED MODE BROUGHT UP TO FLOATING QUALITY**
> — user: "work on the tiled export mode and make it proper like the floating
> layout mode". Six concrete gaps between the flow (tiled) path and the
> Tableau-confirmed floating path, all fixed:
> 1. **Nav buttons no longer flex like charts**: button-worksheets are `kind:
>    "sheet"` zones, and `zoneFlexible` treated every non-KPI sheet as flexible,
>    so a 120×40 button ballooned to a chart-sized tile. New `ZoneSpec.pinned`
>    flag (set on button zones in `buildFaithfulDashboard`), honored in
>    `zoneFlexible` → button pinned to its Figma size (`fixed-size='120'`).
> 2. **Tiled dashboards now size AUTOMATICALLY** (`<size />`, the attribute-less
>    schema default) instead of `sizing-mode='fixed'` min=max — a fixed-size
>    tiled dashboard could never reflow, which defeated responsive mode
>    entirely. Floating keeps fixed sizing (confirmed presentation behavior).
> 3. **No floating zones over the flow tree anymore**: `applyFlowLayout` now
>    drops ALL rect zones (page bg, cards, loose dividers), not just enclosing
>    cards — a floating rect over flow containers caused clutter/re-calc loops
>    and would misalign the moment the (now automatic) layout reflows.
> 4. **KPI-card text groups are fully tiled**: the old approach recreated the
>    card as a floating "KPI Card" rect behind the tree and cleared the member
>    text bgs. Now the member tiles KEEP the propagated card tint and tinted
>    **spacer tiles** (`type-v2='empty'` with the card bg, pinned to gap height)
>    fill the card's uncovered bands above/between/below the text — the whole
>    card reads as one tinted card entirely inside the tree, resize-safe.
> 5. **FILTER/ cards become a real right sidebar container**: the dashboard
>    builder relocates filters to absolute right-strip coords that can overlap
>    charts, which broke the guillotine (no clean gutters → reading-order
>    fallback). Filters are now excluded from tree inference and re-attached as
>    `horz{ body, vert Filters }` with the sidebar pinned to its width.
> 6. **Tiled sheets get the same card look as floating**: borderless rounded
>    white card (cornerRadius ?? 10, padding 8) + margin 6 for gutters, replacing
>    the old bordered/square/padding-16 `cardStyle` (deleted). Tiled text zones
>    drop their 1px margin so grouped KPI stripes fuse seamlessly.
> Test `faithful_flow_smoke.ts` extended (button pinning, `<size />`, spacers,
> Filters sidebar, no decorative rects); tsc clean, all smoke tests green,
> build OK. Tiled still needs a Tableau load-confirm pass. Not committed.
>
> **Latest (build 74, 2026-07-02): canvas fix, take 2** — user's TABLEAU
> exports still showed black canvases at 0.42 (screenshots confirmed; the
> accents are dark, and applying a template BAKES the colors into the Figma
> frame, so old frames keep old colors — templates must be RE-APPLIED after a
> palette change). `bg` mix now **0.6**: clinical #084656, sales #0D4D25,
> finance #282279, retail #6F1111, manufacturing #6C3205, esg #024834 — rich,
> unmistakably hued, light cards keep contrast. Note from the screenshots:
> worksheet (SHEET) zones render with Tableau's white pane regardless of card
> tint; only KPI/text/rect zones carry the tint — expected. tsc/tests/build
> green. Not committed.
>
> **Latest (build 72, 2026-07-02): DOMAIN-DIFFERENTIATED TEMPLATES** — user:
> "everything looks way too similar" (all 15 shared the same lavender cards and
> most reused the same KPI-strip + hero + bottom-row skeleton).
> 1. **Per-domain palette, derived from `DOMAIN_ACCENTS` at apply time** (new
>    `mix()` + WHITE/BLACK in code.ts; T_BG_* constants deleted): canvas =
>    `mix(accent, black, .18)` (dark, domain-hued), sheet cards =
>    `mix(accent, white, .07)`, KPI cards = `.12`, strokes = `.35`. Tints stay
>    under the exporter's saturation cutoff (dominantChartColor skips s<0.18 —
>    and only samples CHILDREN fills anyway), so the accent captions still
>    drive the exported mark color.
> 2. **10 layouts reworked into distinct archetypes** (clinical/sales/finance/
>    executive/operations kept — already distinct): marketing = FUNNEL TOWER
>    (tall funnel left + 2×2 right); hr = RIGHT SIDEBAR (mirror of clinical);
>    supplychain = STACKED FULL-WIDTH BANDS; support = QUADRANT 2×2 w/ KPI
>    strip on the BOTTOM; product = SPLIT HERO (wide trend + tall pie);
>    itops = STATUS BOARD (tall heatmap left rail + 2×2 KPI block); mfg = 2×2
>    left + tall defect heatmap RIGHT rail; retail = ASYMMETRIC wide/narrow
>    columns; project = 3 KANBAN lanes (KPI over tall chart each); esg = MIX
>    SPOTLIGHT (big pie + 2×2 KPI block left, stacked charts right).
> 3. Template-card descs/counts in `DashboardTemplates.tsx` updated to match;
>    all 15 layouts machine-checked: no overlaps, all children in bounds.
> tsc clean, 16 smoke tests green, build OK. Not committed.
>
> **Latest (build 71, 2026-07-02): TEMPLATE POLISH + empty-space placement.**
> 1. **Templates land in EMPTY space**: `applyTemplate` no longer drops the new
>    dashboard at `frame.x + width + 80` (could overlap other frames) — new
>    `emptyPlacement()` in code.ts puts it just past the RIGHTMOST top-level
>    node on the page (+160px, top-aligned with the selected frame), appended
>    to the page, so it can never cover an existing design.
> 2. **Template cards refined**: 36px tinted icon chip (blue wash + border),
>    pill-shaped Apply button (blue accent on hover), hover elevation
>    (shadow + 1px lift), padding 14×16, grid gap 12.
> 3. **Proper accordion chevrons**: the text "▶" glyphs everywhere (syntax
>    accordions, Dashboard-details + import accordions) replaced with
>    CSS-drawn border chevrons that rotate right→down on open.
> 4. **Top-right size-preset button REMOVED** (user request) — resizing is the
>    corner ↖↘ grip only; `MsgResize`/sandbox clamp stay.
> 5. **Finish pass**: blue focus rings on inputs/selects (soft 2px glow),
>    btn-secondary + link-btn hover states, library cards get the same hover
>    elevation as template cards, section labels letter-spacing 0.7.
> tsc clean, 16 smoke tests green, build OK. Not committed.
>
> **Latest (build 70, 2026-07-02): LIBRARY TAB DE-CONGESTION + resize arrow.**
> 1. **Syntax tab → accordions**: the 9 prefix entries and the three modifier
>    sections (Chart types `[type]`, Sheet options `:option`, Navigation
>    targets `> Target`) are now `<details>` rows — icon + tag + short title
>    visible, full description/tables only on click (`.syntax-acc*` CSS). The
>    tab reads as ~12 calm rows instead of a wall of text; the real-data tip
>    card stays visible.
> 2. **Airier text everywhere in Library**: line-heights 1.5→1.6/1.65
>    (syntax-intro/desc/table cells, template descriptions), Components
>    category blocks 16→22px apart.
> 3. **Resize arrow**: the corner chip is now 26px with a double-headed ↖↘
>    arrow glyph, floating card look (shadow + focus border, blue on hover) so
>    it unmistakably reads "drag to resize"; free drag unchanged, size-preset
>    button unchanged.
> tsc clean, 16 smoke tests green, build OK. Not committed.
>
> **Latest (build 69, 2026-07-02): RESIZE RESTORED (discoverable) + spacing
> de-congestion (UI-only).** User feedback on build 68: cards too congested, and
> the resize arrow was invisible ("only visible when I go outside the UI…
> arrow doesn't appear") — i.e. build 68 misread the earlier complaint; the user
> DOES want resizing, the old handle was just undiscoverable (bare 16px
> cursor-only zone flush against the iframe edge). Two ways to resize now:
> 1. **Size-preset button** at the right end of the main tab bar — one click
>    cycles Compact 420×580 → Comfortable 500×720 → Large 600×860 (tooltip names
>    the next preset). Guaranteed to work, no hover-hunting.
> 2. **Visible corner grip** — a 22px chip (bg + border + diagonal-grip glyph,
>    inset 2px from the corner so pointer events stay inside the iframe) with
>    pointer-capture drag; `resize` msg (`MsgResize`) + code.ts
>    `figma.ui.resize` clamp (≥360×420) reinstated from build 67.
> 3. **Spacing pass** — scroll-area gap 14→18/padding 18, section labels mb 6→8,
>    frame/export/account cards padding 12×14→14×16, account card gap 10→12,
>    library grid gap 8→10 + card padding up, template cards 10×12→12×14,
>    syntax items 10→12 + section gaps 14→20, stat cells, onboarding, toggles,
>    import rows all loosened.
> tsc clean, 16 smoke tests green, build OK. Not committed.
>
> **Build 68 (2026-07-02): ACCOUNT TAB + COMPLETE SYNTAX REFERENCE +
> shared SVG icon module (export pipeline untouched).**
> 1. **"Fix selected card" button REMOVED completely** — the ComponentLibrary
>    button/hint row, the `fix-clipping` message (`MsgFixClipping` in types.ts),
>    and the sandbox `fixSelectedClipping`/`fixCardClipping` functions are all
>    deleted (superseded: library/template cards are built clip-proof via
>    `fillCaption`/`fillKpiRows`, and export-side fitting lives in
>    `fitFaithfulText`). `.fix-clip-*` CSS dropped.
> 2. **UI is no longer resizable** — the corner drag handle, the `resize`
>    message (`MsgResize`), code.ts's `figma.ui.resize` case and `.resize-handle`
>    CSS are removed; the plugin window is fixed at `UI_SIZE` 420×580.
> 3. **Syntax tab completed** (Library ▸ Syntax) — now documents the FULL
>    transpiler contract, verified against `constants.ts LAYER_PREFIXES` +
>    `faithful.ts markFromTag/parseLayerOptions`: all 9 prefixes (SHEET/, KPI/,
>    FILTER/, Nav/, BUTTON/ > Target, TEXT/, Image|IMG|LOGO/, URL|WEB/,
>    CONTAINER|GROUP/), the full `[type]` chart-tag table with every alias
>    (bar=default/column/bar-hor/bar-vert, line/trend, area, pie/donut/doughnut,
>    scatter/bubble/circle→Circle, heatmap/square/map→Square,
>    table/text/crosstab→Text) and the Tableau mark each maps to, the stackable
>    `:showTitle`/`:filter`/`:highlight` sheet options, a "Navigation targets"
>    explainer (Nav/ prototype link vs BUTTON/ named target, nav-to-SHEET), and
>    a real-data-swap tip. Each entry carries an icon.
> 4. **Account tab is now a full section** (was a "coming soon" placeholder):
>    Profile card (initials avatar + `figma.currentUser` name — needed the new
>    `"permissions": ["currentuser"]` in manifest.json → **re-import the
>    manifest in Figma**), Free-plan card with feature list, Usage stats strip
>    (all-time export count persisted in `clientStorage("ft-export-count")`,
>    imported-sheet count, selected-frame count), Data & storage card (stored
>    workbook summary + "Clear stored workbook" → new `clear-import` msg deletes
>    `clientStorage("ft-import")` and clears UI state; feedback via
>    figma.notify), local-only privacy note, About card with build tag. New
>    messages: `request-account`/`account-info` (userName + exportCount),
>    `log-export` (UI sends it after a successful export; sandbox increments the
>    counter and re-posts account-info), `clear-import`.
> 5. **SVG icons** — new shared module `src/ui/icons.tsx`: `svgProps(size)`
>    factory (24-grid stroke glyphs, currentColor) now also used by
>    ComponentLibrary + DashboardTemplates (their local svgProps consts
>    deduped); `TAB_ICONS` on the main Dashboard/Library/Account tabs,
>    `SUBTAB_ICONS` on Components/Templates/Syntax, `SYNTAX_ICONS` (12 glyphs)
>    on every Syntax entry, `ACCOUNT_ICONS` on the Account rows.
> tsc clean, 16 smoke tests green, `npm run build` OK. Not committed.
>
> **Build 67 (2026-07-02): UI/UX POLISH pass (UI-only + tiny sandbox
> plumbing; export pipeline untouched).**
> 1. **Toast rework** — warnings/errors no longer single-line-ellipsized and
>    auto-vanishing (they carry the actionable swap guidance!): text wraps
>    (`overflow-wrap:anywhere`, scrollable at 45vh max), warn/err persist until
>    the user hits the ✕ dismiss button; only `ok` auto-dismisses (5s).
> 2. **Live Selection card** on the Dashboard tab — reuses the previously
>    orphaned `.frame-card` CSS; shows the selected frame name(s) and
>    "N frames → N Tableau dashboards" (multi) or "W × H · n layers → 1
>    dashboard". Plumbing: `collectFrames()` exported from `faithful.ts`,
>    `code.ts parseAndSend` adds `frameNames` to `model-ready`
>    (`MsgModelReady.frameNames?: string[]`), so the card tracks
>    `selectionchange` live and reflects the REAL multi-dashboard export scope.
>    The duplicate Frame/Dimensions rows were dropped from the details accordion.
> 3. **Drag-to-resize** — corner handle (bottom-right, all tabs) sends the
>    already-supported-but-never-used `resize` message (code.ts clamps ≥360×420);
>    pointer capture keeps the drag alive while the iframe resizes. Default
>    `UI_SIZE` bumped 400×500 → 420×580.
> 4. **Onboarding empty state** — a "no frame" parse failure now renders a
>    3-step "Design → Tableau" card (select frame(s) → name layers / use
>    Library → export) instead of a raw error string; real parse errors still
>    show the error card. "Start from scratch" stays in both branches.
> 5. **Import UX** — native file input replaced by a hidden input + styled
>    dashed upload button ("Upload/Replace workbook (.twb / .twbx)"); the
>    accordion summary shows a blue "N loaded" pill when real sheets are armed
>    (or a quiet "optional" hint when not).
> 6. **Templates tab** — search box (filters label+desc) + compact cards
>    (32px icon, name + "5 sheets · 4 KPIs · 2 filters" meta line, small Apply
>    button in the header row, description clamped to 2 lines with full text in
>    `title`), plus a friendly no-match state.
> 7. **A11y/polish** — `:focus-visible` outlines for buttons/summaries, toast
>    `role="status"`, template-card hover states.
> tsc clean, 16 smoke tests (18 OK checks) green, `npm run build` OK (both
> `dist/index.html` + `dist/code.js`). Not committed; needs a re-import in Figma
> to pick up the new manifest-less UI (footer `ui-polish-67`).
>
> **Build 66 (2026-07-02): FONT NORMALIZATION — the vertical fix.**
> Build 65 fixed horizontal fitting, but vertically the physics couldn't close:
> at Tableau's ~1.5× oversized text rendering, tall glyphs need 2.66×pt of
> height while design slots give ~1.6×pt — the grown title clipped against the
> subtitle's zone, values against labels (text zones clip each other on partial
> overlap just like cards). Growing can't help when there's no room. The clean
> inversion in `fitFaithfulText`: **emit every text fontsize at designPt ÷
> `TABLEAU_TEXT_SCALE` (1.5)** — Tableau's oversized draw then lands at exactly
> the DESIGNED visual size, so text occupies the same space as in Figma and
> nothing clips or collides, horizontally or vertically. Consequently
> `estLineWidthPx` now measures at design size (no ×1.5) so most zones need no
> growth at all, and shrink-to-fit rarely triggers. Also added: text zones are
> now collision obstacles for each other (live geometry, document order — two
> zones can never both grow into one gap), and vertical placement uses a
> collision window (`vWindowFor`/`placeV`) so height growth stops 2px before any
> disjoint neighbor. Verified on a replica of the Overview title/subtitle/KPI
> stack: title h 60→70 stops above the subtitle, fonts 37.5→25 / 21→14 / 15→10
> nominal (render at design visual size), ZERO partial overlaps. capture-smoke
> title assertions updated (fontSize 25, w fits ≤300 without ballooning). tsc
> clean, 18 OK checks, build OK. Not committed; needs re-export (footer
> `visual-scale-fit-66`). KNOB: if text renders too small on a 100%-scaling
> machine, `TABLEAU_TEXT_SCALE` in faithful.ts is the dial.
>
> **Build 65 (2026-07-02): TEXT-FITTING ENGINE — the general fix for any
> design.** The user's "Tableau Analytics" export revealed the killer rule:
> **a floating text zone that PARTIALLY overlaps another zone gets mangled by
> Tableau** (only the overhang renders — "Con.." fragments, invisible "$1.24M"),
> while FULL containment is fine. Builds 63/64 grew text zones in isolation, so
> grown zones poked past their KPI cards → partial overlaps → the mess. Also
> confirmed from the export: Tableau does NOT soft-wrap text zones (overflow is
> "…"-truncated), and draws text ~1.4–1.5× the 96-dpi GDI width. New
> architecture in `faithful.ts`: `walk()` captures text zones RAW (exact Figma
> geometry, multi-line still split per line with `#L` ids); a post-pass
> `fitFaithfulText(zones, frameW, frameH)` then fits every text zone with full
> knowledge of the dashboard: (1) accurate width need from a GDI-measured
> per-char advance table (`SEGOE_EMS`, chars 32-126, em units) ×
> `TABLEAU_TEXT_SCALE=1.5` (+8px pad, ×1.08 bold); (2) grow toward the text's
> alignment but CLAMPED to the tightest enclosing solid zone (the card, inset)
> and never INTO a previously-disjoint neighbor; (3) if the text still can't
> fit, SHRINK THE FONT to the available width (floor 0.45×) — a smaller complete
> label beats a truncated one; (4) `#L` line groups re-fit as one block (one
> shrink ratio for the stack, height = Σsize×1.9 centered, clamped inside the
> card, re-sliced). Verified on a replica of the failing design: heading grows
> to 2px before the chart panel then shrinks 30→22pt and renders complete;
> "Conversion Rate" fits inside its 160px card at 9pt; ZERO partial overlaps.
> tsc clean, 18 OK checks, build OK. Not committed; needs user re-export
> (footer `text-fit-engine-65`).
>
> **Build 64 (2026-07-02):** vertical glyph clipping fix on the build-63
> split-line zones. The per-line zones sliced the raw Figma text bbox (~1.57× the
> point size per line) but Tableau's Segoe UI line box needs ~1.77×pt-in-px plus
> zone margins, so KPI values shaved their digit tops ("1,284") and labels their
> descenders ("Occupancy"). `faithful.ts` now grows the whole line stack to
> `Σ size × 1.9` CENTERED on the Figma bbox before slicing (each slice stays
> proportional to its font size), and the single-line path uses the same 1.9
> factor. For the clinical template KPI: 66px block → 80px, still inside the
> 100px card. tsc clean, 18 OK checks, build OK. Not committed; not yet
> Tableau-confirmed (footer must read `lineheight-fit-64`).
>
> **Build 63 (2026-07-02):** two text-rendering fixes, diagnosed from the
> user's actual export (`Downloads/Dashboard.twbx`) + GDI measurements. (1)
> **Multi-line text zones lost every line after the first** — a template KPI card
> (ONE Figma text node, "label\nvalue\ndelta") exported as one multi-line
> `<formatted-text>`; the user's Tableau rendered the small first row + ".." and
> swallowed the big value. Tableau fits multi-line zones by whole lines and
> ellipsizes the rest, while SINGLE-line zones always draw their line (evidence:
> the user's per-layer KPI lines all rendered). Fix: `faithful.ts` now splits a
> multi-line text node into ONE ZONE PER VISUAL LINE (`linesWithSizes` carries
> per-line runs; each line gets a height slice proportional to its font size,
> its own width fit, and its first run's color/size). Emitted zones now match
> the LaDataViz reference pattern (single-line, ≤1 run, no newlines in runs).
> (2) **Horizontal ellipsis truncation ("Overvi..", "67/..", "Filter Pan..")** —
> measured Segoe UI via GDI and compared with the export's zone widths: the
> user's Tableau needs ~1.4–1.5× the 96-dpi GDI width, and every truncation in
> their screenshots matches that factor quantitatively. `CHAR_W` 0.75 → **1.1**
> px per point per char (the text-fit-19-era empirically proven constant);
> long single lines also get row-estimated height so Tableau can wrap them.
> capture-smoke updated (title now asserts GROWTH past the Figma box, w≥330).
> tsc clean, 18 OK checks, build OK. Not committed; needs the user to reload
> (footer `textfit-splitlines-63`) and re-export both the template and their
> Overview design.
>
> **Build 62 (2026-07-02):** three user-reported fixes. (1) **Per-field
> template colors** — new `DOMAIN_ACCENTS` in `shared/constants.ts` (one dark,
> saturated hex per domain). Templates color their KPI values + `SHEET/` captions
> with it (`templateAccent` in `code.ts`), and because the exporter samples the
> most vivid fill inside a `SHEET/` layer (`dominantChartColor`), each template's
> charts export in that same color; `seed.ts` also uses `data.accent` as the
> mark-color fallback (before `#898989`) for any dashboard whose domain is
> detected. (2) **Export text clipping fixed** — `faithful.ts` measured line
> width as `chars × sizePt × 0.6` but the zone rect is in PIXELS, so the box was
> ~25% too narrow (missing the 4/3 px-per-pt factor) and Tableau wrapped/clipped
> text that fit in Figma; `CHAR_W` is now 0.75 px-per-pt and width growth honors
> the text's alignment (centered grows both ways, right-aligned grows leftward).
> (3) **UI no longer self-toggles on Ctrl/Space** — a clicked tab/checkbox kept
> browser focus, so a later Space landing in the plugin iframe re-activated it;
> `App.tsx` now blurs non-typing controls after a pointer click and swallows
> stray Space keydowns outside text fields (keyboard-driven clicks keep focus
> for accessibility). `tsc` clean, tests green, build OK. Not committed. Not yet
> Tableau-confirmed by the user.
>
> **Build 61 (2026-07-02):** (1) **Pie load-error fixed** — a pie sizes
> wedges with **`<wedge-size>`**, NOT `<angle>` (D2E8DA72 "no declaration found for
> element 'angle'"; valid encodings: color|size|text|shape|wedge-size|lod|geometry|
> image|tooltip|path|level|edge). `validateTwb` now guards `<angle>`. (2)
> **Per-dashboard datasources** — a mixed-domain multi-dashboard export used to give
> every chart ONE domain's data (a Sales dashboard showed clinical fields). Now each
> dashboard's domain is detected independently and gets its OWN inline datasource
> (`WorkbookSpec.extraData` + `WorksheetSpec.dsName`; primary `federated.fig`, extras
> `federated.fig2…` each with `data_<domain>.csv`). (3) **15 dashboard templates**
> (10 new: marketing, hr, supplychain, support, product, itops, manufacturing,
> retail, project, esg) — each a distinct layout + domain charts + per-category dark
> BG color + rich label/value/delta KPIs, backed by per-domain `DOMAIN_DATASETS` and
> collision-ordered `DOMAIN_KEYWORDS`. `tsc` clean, 16 tests green, build OK. Not
> committed. Not yet Tableau-confirmed by the user.
>
> **v13 merge (2026-07-01, PR #1 from "rishit") + cleanup done.** The merge added a
> detection/analysis engine, a UI restructure (Dashboard/Library/Account tabs), and
> cross-session import persistence, and introduced a duplicate worksheet
> `<simple-id>` regression — now ✅ FIXED. Then a cleanup pass (`cleanup-simpleid-49`):
> the detection engine was **deleted** (built but never wired — user's call), along
> with the legacy `tableauGenerator`/`mapper`/`editor/*`/`DashboardPreview` dead code
> and the never-written `backgroundImage` plumbing; a best-effort guard was added to
> the clientStorage import-persistence write. `npm test` green + `tsc` clean + build
> OK. See §15.
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

`D:\wireframe` converts **dashboard designs into Tableau workbooks**. Four
tracks live here:

1. **Python generators** (older, standalone) — turn an HTML wireframe / a static
   `image.png` mock into a hand-authored `.twb`. See `generate_twb.py`
   (clinical-trial, 26 dashboards / 78 worksheets) and `generate_image_twb.py`
   (generic image → dashboard). These are the original proof that we can
   hand-author a `.twb` that opens in Tableau 2026.2.
2. **`figma-tableau-plugin/`** (the ACTIVE work) — a production Figma plugin
   (TypeScript + React + Vite) that converts a selected **Figma frame** into a
   downloadable Tableau **`.twbx`**. This is where all recent effort goes and is
   the focus of this handoff.
3. **`backend/`** — the Node/Express server side: Razorpay billing (checkout,
   order/subscription verify, webhooks) + the `GET /api/license/:uid` endpoint
   the plugin polls; modular `src/routes/*` with room for auth/analytics.
   Formerly `payment-server/`. See `backend/README.md`.
4. **`website/`** — the standalone marketing site (Vite + React + TS +
   framer-motion). Premium CTAs in the plugin open its `/upgrade` page, which
   hands off to the backend checkout. See `website/README.md`.

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
| **Figma sandbox** (`code.ts`) | the `figma` API, **no DOM**, no Blob/btoa | `plugin/code.ts`, `parser.ts`, `faithful.ts` + `faithful/*`, `builders.ts`, `drop.ts`, `insert.ts`, `templates.ts`, `persistence.ts`, `messaging.ts` | Read the selected frame → build a model → `postMessage` to the UI |
| **UI iframe** (React) | DOM, Blob, JSZip, FileSaver, **no `figma`** | everything in `ui/`, plus `plugin/seed.ts`, `faithfulSpec.ts`, `domainData.ts`, `layoutTree.ts`, `workbookGenerator.ts` + `*Xml.ts`/`xmlUtils.ts`, `exporter.ts`, `twbxBuilder.ts`, `csv.ts`, `xlsx.ts`, `twbImport.ts` | Turn the model into `.twb` XML, zip into `.twbx`, download |

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

### B. Faithful transpile → `FaithfulModel` (`faithful.ts` → `faithfulSpec.ts`) — THE PRIMARY PATH
`parseFaithful()` walks every visible node back-to-front and emits a flat
`FaithfulZone[]` at absolute Figma px. **Multi-dashboard (`multi-dashboard-37`):**
`parseFaithfulAll()` resolves **every selected frame** (children collapse to their
frame, deduped, reading-order sorted) and returns one `FaithfulModel` PER frame;
the `faithful-ready` message now carries `models: FaithfulModel[]`, and
`faithfulSpecMulti(models)` (in `faithfulSpec.ts`) builds ONE `WorkbookSpec` with **one dashboard
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
table. Build tag is in `App.tsx` `const BUILD` (currently `colored-canvas-74`).
The export covers **all selected frames** (one dashboard each), **always
pixel-exact floating**. The **"Responsive layout (flow containers)"** checkbox was
**REMOVED from the UI** (`floating-only-42`): flow mode reflows the design via the
guillotine engine so it can NEVER match Figma pixel-for-pixel, and the user kept
hitting it by accident and seeing a "messed" layout. The export now hard-codes
`faithfulSpecMulti(models)` (floating). The flow code path (`applyFlowLayout`,
`faithfulSpec(model,'flow')`, the tiled generator) still EXISTS and is still
tested by `faithful_flow_smoke.ts` — it's just not reachable from the UI, so it
can be re-exposed later if a real responsive use-case appears. Build tag is now
`razorpay-billing-88` (before it: `image-mode-87` — Floating/Tiled/Image mode
pills; image-only spec builder; background-image checkbox hidden in Image mode).
Build 88 adds the free-plan export gate (15 exports, then the Export button
becomes an Upgrade prompt) + the Razorpay Premium flow on the Account tab —
see the "Latest (build 88)" block at the top and `backend/README.md` (the
folder was `payment-server/` until the v22 restructure).

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
src/plugin/        (sandbox side unless noted UI)
  code.ts           sandbox entry; message switch; parseAndSend/sendFaithful/addSheets
  parser.ts         heuristic parse → DashboardModel; applyAutoTags; exportPng/attachImages
  faithful.ts       parseFaithful/parseFaithfulAll → FaithfulModel (the primary transpiler); Nav/ reaction read + expandNavTargets; walk() + zone emission
  faithful/         split-out faithful helpers:
    zoneParsers.ts    SHEET/BUTTON/Nav/FILTER name parsers; markFromTag; dominantChartColor
    colorGeometry.ts  px→pt, hex/paint/stroke helpers, rectOf, MAX_ZONES
    textRuns.ts       styled text segments, line splitting, alignment
    textFitting.ts    SEGOE_EMS width table; fitFaithfulText (grow/shrink engine)
    rasterization.ts  base64; attachFaithfulImages/buildImageOnlyModel/attachBackgroundImage
  builders.ts       library/default/KPI-card component builders; findDashboardFrame
  drop.ts           drag-and-drop handler (fonts, container lookup, drop events)
  insert.ts         click-to-insert for library components + default frames
  templates.ts      applyTemplate + the 15 domain layouts/palette
  persistence.ts    clientStorage: imported workbook / account info / UI state
  messaging.ts      typed post() sandbox → UI
  seed.ts           (UI) blankSpec/seedSpecFromModel + the sample dataset
  faithfulSpec.ts   (UI) faithfulSpec/faithfulSpecMulti/applyFlowLayout/imageOnlySpec — FaithfulModel → WorkbookSpec, Nav/ target resolution
  domainData.ts     (UI) domain-flavored placeholder datasets
  layoutTree.ts     (UI) geometric layout engine (recursive guillotine)
  workbookGenerator.ts  (UI) WorkbookSpec → .twb XML orchestrator (~100 lines; delegates to the *Xml modules)
  xmlUtils.ts       (UI) uid/escaping/hasNavAction + shared XML helpers
  datasourceXml.ts  (UI) datasources + color styles + action groups
  worksheetXml.ts   (UI) data worksheets + nav-button worksheets ← pane styling lives here
  dashboardXml.ts   (UI) dashboard zones/containers (floating + tiled)
  windowsXml.ts     (UI) <windows> section (load-critical) + Entire-View fit
  actionsXml.ts     (UI) nav/highlight/filter <actions>
  exporter.ts       (UI) generateSpecWorkbook/exportSpecTwbx + validateTwb (the load guards)
  twbxBuilder.ts    (UI) zip .twb + Data/ + Image/ → .twbx blob, download
  csv.ts / xlsx.ts  (UI) data upload/parse/type-infer/sample rows
  twbImport.ts      (UI) parse an uploaded .twb/.twbx → ParsedImport (worksheet swap + clientStorage persistence)
src/ui/
  App.tsx           Dashboard/Library/Account tabs, message handler, the export button + import-swap (title/filter injection), SyntaxTab/DefaultsTab, BUILD tag
  hooks.tsx         useExportConfig/useWindowSize/useToast/useImport
  components/ComponentLibrary.tsx  Library ▸ Components (insert-library-component)
  templates/DashboardTemplates.tsx Library ▸ Templates (apply-template)
  devMock.ts        browser stand-in for the Figma sandbox
  main.tsx/index.html/styles.css
scripts/build-ui.mjs  the esbuild single-file UI build (do not use vite build for UI)
(Removed in the cleanup-simpleid-49 cleanup — see §15: the legacy DashboardModel→.twb
 path tableauGenerator.ts / mapper.ts, the unused editor/* panels + DashboardPreview.tsx,
 and the whole just-merged detection engine detection/* + ui/analyze/*.)
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

---

## 15. v13 merge (PR #1) + `cleanup-simpleid-49` cleanup

**The merge** (2026-07-01, from collaborator **"rishit"** `Utkarsh4305/rishit`,
commits `4762fa9` + merge `f5c9466`, +2312 / −271) added three things:
1. a multi-signal **detection/analysis engine** (`src/plugin/detection/*` +
   `src/ui/analyze/AnalyzeTab`+`MappingPanel`) that classified each Figma element
   into a Tableau component type — but it was **never wired into the UI**
   (`AnalyzeTab` was never rendered), so the whole subsystem was dead code;
2. a **UI restructure** (`App.tsx`): top-level **Dashboard / Library / Account**
   tabs; *Dashboard* = the export flow (workbook-name, a "Dashboard details"
   accordion, export-option toggles Dashboard-filters/Legends/Titles/Tooltips, the
   single Export button); *Library* = **Components** (`ui/components/ComponentLibrary`)
   / **Templates** (`ui/templates/DashboardTemplates`) / **Syntax** / **Defaults**;
   *Account* = a "coming soon" placeholder. **KEPT.**
3. **cross-session import persistence** — `code.ts` persists the uploaded workbook
   via `figma.clientStorage` (`save-import` → key `ft-import`; on launch restores +
   posts `import-restored`), closing the old "re-upload every session" gap. **KEPT.**

**The simple-id regression fix (2026-07-01).** As merged, `npm test` FAILED at
`twb_import_dupdash_smoke.ts` (*"Duplicate worksheet simple-id … D2E8DA72"*): the
merge added a new `validateTwb` guard for duplicate worksheet-section `<simple-id>`
uuids (pre-merge only *window* simple-ids were checked), which correctly exposed a
real latent bug — `applyImportedSwap`'s `cloneNeeds` loop + `renameWorksheetXml`
(`exporter.ts`) spliced a renamed CLONE (`X (copy)`) of an imported worksheet
**verbatim, inner `<simple-id>` and all**, so the clone and original shared a uuid
(the *same* imported sheet placed twice on *one* dashboard). Fix: `renameWorksheetXml`
now also mints a fresh `{UPPERCASE-UUID}` for the clone's worksheet-level `<simple-id>`
(new `newUuid()` helper; replaces the first `<simple-id>` in the block). The clone's
*window* simple-id was already fresh (its `X (copy)` name isn't in the generator's
`wsUuid` map → `uid()`).

**The `cleanup-simpleid-49` cleanup (2026-07-01).** After the fix, per the user's
call:
- **Deleted the detection engine entirely** (built but never wired): `plugin/detection/*`,
  `ui/analyze/*` (`AnalyzeTab`+`MappingPanel`), the `code.ts` handlers, and the
  `request-analyze`/`override-type`/`detection-ready` messages + `DetectionResult`
  type in `shared/types.ts`.
- **Deleted legacy dead code**: the old DashboardModel→.twb path `plugin/tableauGenerator.ts`
  + `plugin/mapper.ts` (its last test `smoke.ts` was already gone), the unused
  `ui/editor/*` panels (DataPanel/SheetsPanel/LayoutPanel/LayoutCanvas), and
  `ui/DashboardPreview.tsx` — all imported by nothing.
- **Removed the never-written `backgroundImage`/`backgroundImageFile` spec fields**
  (leftover from the removed background-image export) and their read-sites in
  `exporter.collectImageAssets` + `workbookGenerator.dashboardXml`; dropped the now-
  moot background assertions from `lds_smoke.ts`.
- **Edge-case fix**: the `save-import` clientStorage write is now `.catch(() => {})`
  (best-effort) — a large import (`.hyper` extract) can exceed the quota, and the
  bare `void setAsync(...)` would have surfaced an unhandled rejection in the sandbox.

**State:** `tsc --noEmit` clean, `npm test` fully green (16 tests), `npm run build`
OK, UI single-file invariants pass. Build tag **`cleanup-simpleid-49`**. As always,
the user must quit Figma + remove/re-import the manifest and confirm the footer
reads the new tag before trusting a screenshot.
