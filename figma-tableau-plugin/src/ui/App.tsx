import { useEffect, useRef, useState } from "react";
import type { DashboardModel, PluginToUi, UiToPlugin } from "../shared/types";
import type { WorkbookSpec, ExportOptions } from "../shared/spec";
import { DEFAULT_EXPORT_OPTIONS } from "../shared/spec";
import { seedSpecFromModel, blankSpec, faithfulSpecMulti } from "../plugin/seed";

import { exportSpecTwbx, applyImportedSwap } from "../plugin/exporter";
import { parseImport, parsedImportFromStored, type ParsedImport } from "../plugin/twbImport";
import ComponentLibrary from "./components/ComponentLibrary";
import DashboardTemplates from "./templates/DashboardTemplates";
import { TAB_ICONS, SUBTAB_ICONS, SYNTAX_ICONS, ACCOUNT_ICONS, type SyntaxIconName } from "./icons";

const BUILD = "image-mode-87";

type Status = { kind: "ok" | "err" | "warn"; text: string } | null;

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

/** Debounce a save-UI-state call so rapid resize events don't hammer
 *  clientStorage on every pixel. Returns a function the caller invokes
 *  whenever the saved values should be flushed. */
function createUiSaver(): (w: number, h: number, tab: string) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastW = 0, lastH = 0, lastTab = "";
  return (w: number, h: number, tab: string) => {
    lastW = w; lastH = h; lastTab = tab;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toPlugin({ type: "save-ui-state", data: { width: lastW, height: lastH, tab: lastTab as any } });
    }, 600);
  };
}



/** Documentation of the layer-name prefixes the transpiler understands. */
const SYNTAX_PREFIXES: Array<{ icon: SyntaxIconName; tag: string; title: string; desc: string }> = [
  { icon: "sheet", tag: "SHEET/Name[type]", title: "Worksheet", desc: "A real Tableau worksheet named after the prefix. The optional [type] tag picks the chart (see Chart types below); :options make clicks act on the dashboard (see Sheet options). If a workbook is uploaded, a SHEET/ whose name matches an imported worksheet swaps in that real sheet and its data." },
  { icon: "kpi", tag: "KPI/Label", title: "KPI card", desc: "A metric card. Its label, value and change lines are recreated pixel-faithfully as fitted Tableau text zones — they never clip or overlap on export." },
  { icon: "filter", tag: "FILTER/Field", title: "Quick filter", desc: "A Tableau quick-filter card on that dimension, bound to a chart on the same dashboard." },
  { icon: "nav", tag: "Nav/Label", title: "Navigation (interaction)", desc: "A native nav button. Its destination comes from the layer's Figma prototype link — wire a “Navigate to” connection to the target frame (or to a SHEET/ layer to open that worksheet). Unselected destinations are pulled into the export automatically." },
  { icon: "button", tag: "BUTTON/Label > Target", title: "Navigation (named)", desc: "A nav button whose target dashboard is named after the “>” (“->” works too). With two dashboards and no “>”, it toggles to the other one. The caption is the text you drew inside the button." },
  { icon: "text", tag: "TEXT/Heading", title: "Text", desc: "A text zone with the layer's real text, font, size and color. Multi-line and mixed-style text is split and fitted so every line renders." },
  { icon: "image", tag: "Image/Name", title: "Image", desc: "Rasterized to a bitmap. IMG/ and LOGO/ work too. Vectors/icons are auto-rasterized even without the prefix." },
  { icon: "web", tag: "URL/page", title: "Web page object", desc: "A Tableau web-page object that loads the URL. WEB/ works too; bare hosts get https://." },
  { icon: "container", tag: "CONTAINER/Name", title: "Layout container", desc: "A layout group. GROUP/ works too. Auto-Layout frames are also reconstructed as flow containers." },
];

/** The chart-type tags a SHEET/ name accepts, and the Tableau mark each maps to. */
const CHART_TAGS: Array<{ tag: string; mark: string; note?: string }> = [
  { tag: "[bar]", mark: "Bar", note: "also column, bar-hor, bar-vert — and the default when no tag is given" },
  { tag: "[line]", mark: "Line", note: "also trend" },
  { tag: "[area]", mark: "Area" },
  { tag: "[pie]", mark: "Pie", note: "also donut, doughnut" },
  { tag: "[scatter]", mark: "Circle", note: "also bubble, circle" },
  { tag: "[heatmap]", mark: "Square", note: "also square, map" },
  { tag: "[table]", mark: "Text table", note: "also text, crosstab" },
];

/** The confirmed-safe :option suffixes a SHEET/ name accepts (stackable). */
const SHEET_OPTIONS: Array<{ tag: string; desc: string }> = [
  { tag: ":showTitle", desc: "Render the worksheet's title inside its zone." },
  { tag: ":filter", desc: "Clicking a mark in this sheet filters the other sheets on the dashboard." },
  { tag: ":highlight", desc: "Clicking a mark highlights the matching marks in the other sheets." },
];

function SyntaxTab() {
  return (
    <div>
      <div className="section-label">Layer prefixes</div>
      <div className="syntax-intro">
        Name a layer with a prefix and it becomes that Tableau object on export.
        Click a row for details.
      </div>
      <div className="syntax-list">
        {SYNTAX_PREFIXES.map((s) => (
          <details key={s.tag} className="syntax-acc">
            <summary className="syntax-acc-summary">
              <span className="syntax-icon">{SYNTAX_ICONS[s.icon]}</span>
              <span className="syntax-acc-main">
                <code className="syntax-tag">{s.tag}</code>
                <span className="syntax-acc-title">{s.title}</span>
              </span>
              <span className="syntax-chev" aria-hidden="true" />
            </summary>
            <div className="syntax-acc-body">{s.desc}</div>
          </details>
        ))}
      </div>

      <div className="section-label syntax-section-gap">Modifiers &amp; navigation</div>
      <div className="syntax-list">
        <details className="syntax-acc">
          <summary className="syntax-acc-summary">
            <span className="syntax-icon">{SYNTAX_ICONS["chart-tag"]}</span>
            <span className="syntax-acc-main">
              <code className="syntax-tag">[type]</code>
              <span className="syntax-acc-title">Chart types</span>
            </span>
            <span className="syntax-chev" aria-hidden="true" />
          </summary>
          <div className="syntax-acc-body">
            <div className="syntax-acc-lead">
              Append a tag to a <code className="syntax-inline-code">SHEET/</code>{" "}
              name — e.g.{" "}
              <code className="syntax-inline-code">SHEET/Sales Trend[line]</code> —
              to pick the worksheet's mark type.
            </div>
            <div className="syntax-table">
              {CHART_TAGS.map((c) => (
                <div key={c.tag} className="syntax-table-row">
                  <code className="syntax-tag">{c.tag}</code>
                  <div className="syntax-table-cell">
                    <span className="syntax-mark">{c.mark} marks</span>
                    {c.note ? <span className="syntax-note"> · {c.note}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="syntax-acc">
          <summary className="syntax-acc-summary">
            <span className="syntax-icon">{SYNTAX_ICONS.options}</span>
            <span className="syntax-acc-main">
              <code className="syntax-tag">:option</code>
              <span className="syntax-acc-title">Sheet options</span>
            </span>
            <span className="syntax-chev" aria-hidden="true" />
          </summary>
          <div className="syntax-acc-body">
            <div className="syntax-acc-lead">
              Suffixes stack after the name/tag — e.g.{" "}
              <code className="syntax-inline-code">
                SHEET/Trend[line]:showTitle:filter
              </code>
              .
            </div>
            <div className="syntax-table">
              {SHEET_OPTIONS.map((o) => (
                <div key={o.tag} className="syntax-table-row">
                  <code className="syntax-tag">{o.tag}</code>
                  <div className="syntax-table-cell">{o.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="syntax-acc">
          <summary className="syntax-acc-summary">
            <span className="syntax-icon">{SYNTAX_ICONS.target}</span>
            <span className="syntax-acc-main">
              <code className="syntax-tag">&gt; Target</code>
              <span className="syntax-acc-title">Navigation targets</span>
            </span>
            <span className="syntax-chev" aria-hidden="true" />
          </summary>
          <div className="syntax-acc-body">
            <b>Nav/</b> reads the layer's Figma prototype interaction — wire a
            “Navigate to” connection from the button (or anything inside it) to the
            destination frame. If the destination frame isn't selected for export,
            it's pulled in automatically; pointing at a <b>SHEET/</b> layer opens
            that worksheet instead of a dashboard. <b>BUTTON/</b> names its target
            after “&gt;” or “-&gt;”; the name must match another exported dashboard
            (the frame's name). Both export as native Tableau navigation actions.
          </div>
        </details>
      </div>

      <div className="syntax-item syntax-tip">
        <div className="syntax-desc">
          <b>Tip — real data:</b> upload your .twb/.twbx on the Dashboard tab, then
          name SHEET/ layers to match your worksheet names. Matching ignores case
          and extra spaces; a sheet placed twice on one dashboard is cloned
          automatically.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [model,      setModel]      = useState<DashboardModel | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [spec,       setSpec]       = useState<WorkbookSpec | null>(null);
  const [status,     setStatus]     = useState<Status>(null);
  const [busy,       setBusy]       = useState(false);
  const [importedNames, setImportedNames] = useState<string[]>([]);
  const [checkedSheets, setCheckedSheets] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"dashboard" | "library" | "account">("dashboard");
  const [frameNames, setFrameNames] = useState<string[]>([]);
  // Debounced UI-state persistence (window size + active tab).
  const saveUiState = useRef(createUiSaver());
  // Whether a ui-state-restored has been applied yet (first mount only).
  const uiStateApplied = useRef(false);
  // Track the CURRENT size as-sent-to-the-sandbox so we can save it accurately
  // even though the sandbox clamps it (we never read back the clamped value).
  const currentSizeRef = useRef<{ w: number; h: number }>({ w: 420, h: 580 });

  // Account tab: the Figma user's name + the persisted all-time export counter,
  // both read in the sandbox (figma.currentUser / figma.clientStorage).
  const [account, setAccount] = useState<{ userName: string | null; exportCount: number }>({
    userName: null,
    exportCount: 0,
  });

  /** Build a compact kind-count description from the model's elements, e.g.
   *  "5 sheets · 3 KPIs · 2 filters · 1 nav". Returns null when there's
   *  nothing interesting to report (only generic text/container layers). */
  const layerBreakdown = (model: DashboardModel | null): string | null => {
    if (!model) return null;
    const counts: Record<string, number> = {};
    for (const el of model.elements) {
      if (el.role === "worksheet") counts.sheets = (counts.sheets || 0) + 1;
      else if (el.role === "kpi")       counts.kpis   = (counts.kpis || 0) + 1;
      else if (el.role === "filter")    counts.filters = (counts.filters || 0) + 1;
      else if (el.role === "button")    counts.nav    = (counts.nav || 0) + 1;
      else if (el.role === "image")     counts.images = (counts.images || 0) + 1;
      else if (el.role === "web")       counts.web    = (counts.web || 0) + 1;
    }
    const parts: string[] = [];
    if (counts.sheets)  parts.push(`${counts.sheets} sheet${counts.sheets > 1 ? "s" : ""}`);
    if (counts.kpis)    parts.push(`${counts.kpis} KPI${counts.kpis > 1 ? "s" : ""}`);
    if (counts.filters) parts.push(`${counts.filters} filter${counts.filters > 1 ? "s" : ""}`);
    if (counts.nav)     parts.push(`${counts.nav} nav`);
    if (counts.images)  parts.push(`${counts.images} image${counts.images > 1 ? "s" : ""}`);
    if (counts.web)     parts.push(`${counts.web} web`);
    if (!parts.length)  return null;
    return parts.join(" · ");
  };
  const breakdownCache = useRef<string | null>(null);
  if (model) breakdownCache.current = layerBreakdown(model);

  // Auto-dismiss SUCCESS toasts only. Warnings and errors carry actionable
  // guidance (which SHEET/ names to use, why charts are demo data…) — they stay
  // until the user dismisses them.
  useEffect(() => {
    if (!status || status.kind !== "ok") return;
    const timer = setTimeout(() => setStatus(null), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  // A clicked button/checkbox/tab keeps browser focus, so a LATER keypress that
  // lands in the plugin iframe (Space, Enter — e.g. the user reaching for
  // Figma's ctrl/space canvas shortcuts) re-activates it and the control seems
  // to toggle by itself. Two guards: blur non-typing controls right after a
  // pointer click, and swallow stray Space presses when focus isn't in a text
  // field (keyboard-driven clicks — e.detail === 0 — keep focus, so tabbing +
  // Space/Enter still works for accessibility).
  useEffect(() => {
    const isTyping = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "TEXTAREA") return true;
      if (tag !== "INPUT") return false;
      const type = (el as HTMLInputElement).type;
      return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "file";
    };
    const blurAfterClick = (e: MouseEvent) => {
      if (e.detail === 0) return; // keyboard "click" — leave focus alone
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body && !isTyping(el) && el.tagName !== "SELECT") el.blur();
    };
    const swallowSpace = (e: KeyboardEvent) => {
      if (e.key === " " && !isTyping(e.target as Element | null)) e.preventDefault();
    };
    document.addEventListener("click", blurAfterClick);
    document.addEventListener("keydown", swallowSpace, true);
    return () => {
      document.removeEventListener("click", blurAfterClick);
      document.removeEventListener("keydown", swallowSpace, true);
    };
  }, []);

  // Show the "copy" drag cursor (not the ⃠ not-allowed one) while dragging a
  // component over the plugin UI. HTML5 marks any element that doesn't handle
  // `dragover` as an invalid drop target; preventDefault + dropEffect='copy'
  // over the whole window makes the plugin panel a valid target so the cursor
  // reads as a drag. (Dropping actually happens on the Figma canvas via the
  // card's dragend `pluginDrop` message.)
  useEffect(() => {
    // Both `dragenter` and `dragover` must call preventDefault for the browser to
    // treat the panel as a valid drop target; otherwise it paints the ⃠ (no-drop)
    // cursor even though the drag is fine. Setting dropEffect="copy" makes it read
    // as a copy (+) cursor the whole time you're over the plugin UI.
    const allowDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    window.addEventListener("dragenter", allowDrop);
    window.addEventListener("dragover", allowDrop);
    return () => {
      window.removeEventListener("dragenter", allowDrop);
      window.removeEventListener("dragover", allowDrop);
    };
  }, []);

  // Layout mode: floating (pixel-exact), tiled (responsive flow containers),
  // or image (full-frame background PNG only — no interactive zones).
  // Defaults to floating so a hurried click always produces the pixel-exact result;
  // the user deliberately opts into tiled or image.
  const [layoutMode, setLayoutMode] = useState<"floating" | "tiled" | "image">("floating");
  const layoutModeRef = useRef<"floating" | "tiled" | "image">("floating");
  layoutModeRef.current = layoutMode;

  // Background image: rasterize the whole frame as a PNG behind all zones,
  // faithfully preserving gradients, images, and complex fills. Opt-in because
  // it adds ~1s to export time and increases .twbx size. Irrelevant in image
  // mode (the whole export IS the background image).
  const [includeBg, setIncludeBg] = useState(false);
  const includeBgRef = useRef(false);
  includeBgRef.current = includeBg;

  // Imported real worksheets (the swap feature) — held in a ref so the once-
  // registered faithful-ready handler reads the latest upload. Persisted across
  // plugin sessions via figma.clientStorage (restored on mount).
  const importedRef        = useRef<ParsedImport | null>(null);
  const seededFrameRef     = useRef<string | null>(null);
  const manualRef          = useRef(false);
  const forceReseedRef     = useRef(false);
  const pendingFaithfulRef = useRef(false);
  const modelRef           = useRef<DashboardModel | null>(null);
  modelRef.current = model;
  // The workbook-name box edits `spec.workbookName`, but the faithful export
  // builds a fresh spec — mirror the current name into a ref so the once-
  // registered faithful-ready handler can apply it (→ the .twbx file name matches).
  const workbookNameRef    = useRef<string>("");
  if (spec) workbookNameRef.current = spec.workbookName;
  // Likewise the Export-options checkboxes (titles/tooltips/legends/filters +
  // filter-shelf position) edit `spec.exportOptions`, but the faithful export
  // builds a fresh spec — mirror the latest choice into a ref so the once-
  // registered faithful-ready handler applies it to the exported workbook.
  const exportOptionsRef   = useRef<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  if (spec?.exportOptions) exportOptionsRef.current = spec.exportOptions;
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginToUi | undefined;
      if (!msg) return;

      if (msg.type === "faithful-ready") {
        if (!pendingFaithfulRef.current) return;
        pendingFaithfulRef.current = false;
        if (msg.error || !msg.models || msg.models.length === 0) {
          setStatus({ kind: "err", text: msg.error || "Couldn't transpile the selected frame(s)." });
          setBusy(false);
          return;
        }
        const models = msg.models;
        void (async () => {
          try {
            const isImageMode = layoutModeRef.current === "image";
            // Image mode: minimal spec with only background image zones.
            // Floating/Tiled: full faithful transpile with worksheets.
            const fLayout = isImageMode ? "image" as const
              : layoutModeRef.current === "tiled" ? "flow" as const : "floating" as const;
            const fSpec   = faithfulSpecMulti(models, fLayout);
            // Honor the name typed in the Export box (the file + .twb are named
            // from spec.workbookName); fall back to the frame-derived default.
            const typedName = workbookNameRef.current.trim();
            if (typedName) fSpec.workbookName = typedName;
            // Compute swap state BEFORE the image-mode guard so it's available
            // for the status message regardless of export mode.
            let swapped = 0;
            let unmatched: string[] = [];
            const imp = importedRef.current;
            if (!isImageMode) {
              // Honor the Export-options checkboxes (titles/tooltips/legends/
              // filters + filter-shelf position). Without this the export used the
              // hard-coded defaults and the toggles appeared to do nothing.
              fSpec.exportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...exportOptionsRef.current };
              // Worksheet swap: if the user uploaded their real .twbx, replace any
              // SHEET/ placeholder whose name matches an imported worksheet with
              // that real sheet (on its real data) instead of a demo sample chart.
              if (imp) {
                const r = applyImportedSwap(fSpec, imp);
                swapped = r.swapped;
                unmatched = r.unmatched;
              }
            }
            const res     = await exportSpecTwbx(fSpec);
            const allZones = models.flatMap((m) => m.zones);
            const sheets  = allZones.filter((z) => z.kind === "sheet").length;
            const filters = allZones.filter((z) => z.kind === "filter").length;
            const webs    = allZones.filter((z) => z.kind === "web").length;
            const dashes  = fSpec.dashboards.length;
            const extra =
              (filters ? `, ${filters} filter(s)` : "") +
              (webs ? `, ${webs} web object(s)` : "") +
              (swapped ? `, ${swapped} real sheet(s) swapped in` : "") +
              (fSpec.actions.length ? `, ${fSpec.actions.length} action(s)` : "");
            // Surface why charts may be demo data instead of the user's real sheets:
            //  - no workbook ever uploaded this session or any prior;
            //  - a workbook IS loaded but nothing / not everything matched a SHEET/.
            const realSheetCount = allZones.filter(
              (z) => z.kind === "sheet" && !/^\s*nav\s*\//i.test(z.name || "")
            ).length;
            const swapWarn = !isImageMode && !imp
              ? realSheetCount > 0
                ? ` ⚠ No Tableau workbook is loaded, so every chart uses demo data. Upload your .twb/.twbx under "Use my real Tableau sheets" (it's remembered between sessions), then export again.`
                : ""
              : !isImageMode && imp && swapped === 0
              ? ` ⚠ No SHEET/ layer matched an imported worksheet, so every chart is demo data. Name your SHEET/ layers to match: ${imp.worksheetNames.slice(0, 8).join(", ")}${imp.worksheetNames.length > 8 ? "…" : ""}.`
              : !isImageMode && imp && unmatched.length
              ? ` ⚠ ${unmatched.length} SHEET/ placeholder(s) didn't match an imported sheet (still demo data): ${unmatched.slice(0, 6).join(", ")}${unmatched.length > 6 ? "…" : ""}.`
              : "";
            setStatus({
              kind: res.warnings.length || swapWarn ? "warn" : "ok",
              text: `Exported — ${dashes} dashboard(s), ${res.zoneCount} zones${isImageMode ? "" : `, ${sheets} worksheet(s)`}${extra}. Download started.${swapWarn}`,
            });
            toPlugin({ type: "notify", message: ".twbx downloaded — check your downloads." });
            // Bump the persisted export counter shown on the Account tab.
            toPlugin({ type: "log-export" });
          } catch (e) {
            setStatus({ kind: "err", text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        })();
        return;
      }

      if (msg.type === "account-info") {
        setAccount({ userName: msg.userName, exportCount: msg.exportCount });
        return;
      }

      if (msg.type === "import-restored") {
        if (msg.data) {
          try {
            const parsed = parsedImportFromStored(msg.data);
            importedRef.current = parsed;
            setImportedNames(parsed.worksheetNames);
            setCheckedSheets(Object.fromEntries(parsed.worksheetNames.map((n) => [n, true])));
            setStatus({
              kind: "ok",
              text: `Restored ${parsed.worksheetNames.length} imported sheet(s) from previous session.`,
            });
          } catch {
            // Corrupted stored data — just start fresh.
            importedRef.current = null;
            setImportedNames([]);
            setCheckedSheets({});
          }
        }
        return;
      }

      if (msg.type === "ui-state-restored") {
        if (msg.data && !uiStateApplied.current) {
          uiStateApplied.current = true;
          setTab(msg.data.tab);
          // Restore the window to its previous size. This runs after the UI
          // has mounted and the sandbox has opened it at the default size, so
          // we send a resize message to adjust. The sandbox clamps ≥360×420.
          currentSizeRef.current = { w: msg.data.width, h: msg.data.height };
          toPlugin({ type: "resize", width: msg.data.width, height: msg.data.height });
        }
        return;
      }

      if (msg.type !== "model-ready") return;

      if (msg.error || !msg.model) {
        setModel(null);
        setFrameNames([]);
        setParseError(msg.error ?? "Nothing to parse.");
        return;
      }

      setParseError(null);
      setModel(msg.model);
      setFrameNames(msg.frameNames?.length ? msg.frameNames : [msg.model.title]);

      const fid    = msg.model.id ?? "frame";
      const forced = forceReseedRef.current;
      if (forced || (!manualRef.current && seededFrameRef.current !== fid)) {
        try {
          const seeded = seedSpecFromModel(msg.model);
          seededFrameRef.current = fid;
          manualRef.current      = false;
          forceReseedRef.current = false;
          setSpec(seeded);
          if (forced)
            setStatus({
              kind: "ok",
              text: `Loaded "${msg.model.title}" — ${msg.model.elements.length} layers.`,
            });
        } catch (err) {
          forceReseedRef.current = false;
          setParseError(
            "Couldn't build a workbook from this frame: " +
              (err as Error).message +
              ". Try a simpler frame or start from scratch."
          );
        }
      }
    };

    window.addEventListener("message", handler);
    toPlugin({ type: "request-parse" });
    toPlugin({ type: "request-account" });
    return () => window.removeEventListener("message", handler);
  }, []);

  const update = (updater: (s: WorkbookSpec) => WorkbookSpec) =>
    setSpec((s) => (s ? updater(s) : s));

  const exportFaithful = () => {
    pendingFaithfulRef.current = true;
    setBusy(true);
    const isImageMode = layoutModeRef.current === "image";
    setStatus({ kind: "warn", text: isImageMode ? "Rasterizing frame as image…" : "Transpiling design…" });
    toPlugin({
      type: "request-faithful",
      includeBackground: includeBgRef.current,
      exportMode: layoutModeRef.current,
    });
  };

  // Upload an existing Tableau workbook to swap its REAL worksheets in for the
  // demo sample-data sheets. We only parse here; the actual substitution happens
  // at export, name-matching each imported sheet to a SHEET/<name> layer.
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseImport(await file.arrayBuffer(), file.name);
      importedRef.current = parsed;
      setImportedNames(parsed.worksheetNames);
      // Pre-check every sheet so the user can add them all in one click.
      setCheckedSheets(Object.fromEntries(parsed.worksheetNames.map((n) => [n, true])));
      // Persist across plugin sessions via the sandbox (figma.clientStorage).
      toPlugin({ type: "save-import", data: parsed.toStoredData() });
      setStatus({
        kind: parsed.worksheetNames.length ? "ok" : "warn",
        text: parsed.worksheetNames.length
          ? `Loaded ${parsed.worksheetNames.length} sheet(s) from ${file.name}.`
          : `No worksheets found in ${file.name}.`,
      });
    } catch (err) {
      importedRef.current = null;
      setImportedNames([]);
      setCheckedSheets({});
      setStatus({ kind: "err", text: `Couldn't read ${file.name}: ${(err as Error).message}` });
    }
  };

  const toggleSheet = (name: string) =>
    setCheckedSheets((c) => ({ ...c, [name]: !c[name] }));
  const allChecked = importedNames.length > 0 && importedNames.every((n) => checkedSheets[n]);
  const toggleAllSheets = () =>
    setCheckedSheets(Object.fromEntries(importedNames.map((n) => [n, !allChecked])));
  const checkedSheetNames = importedNames.filter((n) => checkedSheets[n]);

  // Drop the checked sheets into the Figma frame as SHEET/<name> placeholders.
  const addSheetsToFigma = () => {
    if (!checkedSheetNames.length) return;
    toPlugin({ type: "add-sheets", names: checkedSheetNames });
    setStatus({
      kind: "ok",
      text: `Staging ${checkedSheetNames.length} sheet(s) beside your dashboard — drag them onto your design, then export.`,
    });
  };

  // ── Library sub-tabs
  const [librarySubTab, setLibrarySubTab] = useState<"components" | "templates" | "syntax">("components");

  const librarySubBar = (
    <div className="sub-tab-bar">
      {([
        ["components", "Components"],
        ["templates",  "Templates"],
        ["syntax",     "Syntax"],
      ] as const).map(([id, label]) => (
        <button
          key={id}
          className={`sub-tab-btn ${librarySubTab === id ? "active" : ""}`}
          onClick={() => setLibrarySubTab(id)}
        >
          <span className="tab-icon">{SUBTAB_ICONS[id]}</span>
          {label}
        </button>
      ))}
    </div>
  );

  // Forget the imported workbook: clear the sandbox's persisted copy AND this
  // session's in-memory copy, so the next export goes back to demo data.
  // Feedback comes via figma.notify (the Account tab has no toast area).
  const clearStoredImport = () => {
    toPlugin({ type: "clear-import" });
    importedRef.current = null;
    setImportedNames([]);
    setCheckedSheets({});
  };

  // ── Window size: free drag-resize via the always-visible corner grip chip
  // (the bare iframe edge never shows a resize cursor inside Figma). The
  // sandbox clamps to ≥360×420.
  // Corner grip: pointer capture keeps the drag alive even though the iframe is
  // resizing under the cursor. Rendered as a visible chip (not a bare cursor
  // zone) so it's discoverable inside the plugin window.
  const resizingRef = useRef(false);
  const resizeHandle = (
    <div
      className="resize-handle"
      title="Drag to resize the plugin window"
      onPointerDown={(e) => {
        e.preventDefault();
        resizingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!resizingRef.current) return;
        const w = Math.round(e.clientX + 8);
        const h = Math.round(e.clientY + 8);
        currentSizeRef.current = { w, h };
        toPlugin({ type: "resize", width: w, height: h });
        saveUiState.current(w, h, tab);
      }}
      onPointerUp={(e) => {
        resizingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* capture already released */
        }
      }}
    >
      {/* Double-headed ↖↘ arrow so the chip unmistakably reads "drag to resize". */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 7l10 10" />
        <path d="M7 13V7h6" />
        <path d="M17 11v6h-6" />
      </svg>
    </div>
  );

  // ── Top-level tabs
  const tabBar = (
    <div className="tab-bar">
      {([
        ["dashboard", "Dashboard"],
        ["library",   "Library"],
        ["account",   "Account"],
      ] as const).map(([id, label]) => (
        <button
          key={id}
          className={`tab-btn ${tab === id ? "active" : ""}`}
          onClick={() => {
            setTab(id);
            const s = currentSizeRef.current;
            saveUiState.current(s.w, s.h, id);
          }}
        >
          <span className="tab-icon">{TAB_ICONS[id]}</span>
          {label}
        </button>
      ))}
    </div>
  );

  // ── Tab: Dashboard (Analyze + Export) ─────────────────────────────────────
  if (tab === "dashboard") {
    const dashboardFooter = spec ? (
      <div className="plugin-footer">
        {status && (
          <div className={`toast ${status.kind}`} role="status">
            <span className="toast-icon">
              {status.kind === "ok" ? "✓" : status.kind === "err" ? "✕" : "!"}
            </span>
            <span className="toast-text">{status.text}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss"
              onClick={() => setStatus(null)}
            >
              ✕
            </button>
          </div>
        )}

        <button
          id="export-btn"
          className="btn-primary"
          disabled={busy}
          onClick={exportFaithful}
        >
          {busy ? <><span className="spinner" /> Exporting…</> : "Export to Tableau"}
        </button>

        <div className="build-tag">build {BUILD}</div>
      </div>
    ) : null;

    const body = spec ? (
      <>
        <div>
          <div className="section-label">Selection</div>
          <div className="frame-card" title={frameNames.join(", ")}>
            <span className="frame-dot" />
            <div className="frame-info">
              <div className="frame-name">
                {frameNames.join("  ·  ") || model?.title || "—"}
              </div>
              <div className="frame-meta">
                {frameNames.length > 1
                  ? `${frameNames.length} frames → ${frameNames.length} Tableau dashboards`
                  : model
                  ? `${Math.round(model.width)} × ${Math.round(model.height)} · ${model.elements.length} layers → 1 dashboard`
                  : "1 dashboard"}
              </div>
              {breakdownCache.current ? (
                <div className="frame-breakdown">{breakdownCache.current}</div>
              ) : model && model.elements.length > 0 ? (
                <div className="frame-breakdown warn">No recognized layer prefixes</div>
              ) : null}
            </div>
          </div>
        </div>
        <div>
          <div className="section-label">Export</div>
          <div className="export-card">
            <div className="export-row">
              <div className="field-label">Workbook name</div>
              <input
                id="workbook-name"
                type="text"
                value={spec.workbookName}
                onChange={(e) => update((s) => ({ ...s, workbookName: e.target.value }))}
                placeholder="My Dashboard"
              />
            </div>

            <details className="spec-details dashboard-details-accordion">
              <summary className="field-label import-summary">
                Dashboard details
              </summary>
              <div className="spec-details-body">
                <div className="spec-detail-row">
                  <span className="spec-detail-label">Worksheets</span>
                  <span className="spec-detail-value">{spec.worksheets.length}</span>
                </div>
                <div className="spec-detail-row">
                  <span className="spec-detail-label">Fields</span>
                  <span className="spec-detail-value">{spec.data.fields.length}</span>
                </div>
                <div className="spec-detail-row">
                  <span className="spec-detail-label">Zones</span>
                  <span className="spec-detail-value">{spec.dashboards[0]?.zones.length ?? 0}</span>
                </div>
                {spec.actions.length > 0 ? (
                  <div className="spec-detail-row">
                    <span className="spec-detail-label">Actions</span>
                    <span className="spec-detail-value">{spec.actions.length}</span>
                  </div>
                ) : null}
              </div>
            </details>

            <div className="export-row">
              <div className="field-label">Export mode</div>
              <div className="pill-row">
                {(["floating", "tiled", "image"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`pill-btn ${layoutMode === mode ? "active" : ""}`}
                    onClick={() => {
                      setLayoutMode(mode);
                      const s = currentSizeRef.current;
                      saveUiState.current(s.w, s.h, tab);
                    }}
                    title={
                      mode === "floating"
                        ? "Pixel-exact positions match the Figma design exactly. Recommended."
                        : mode === "tiled"
                        ? "Responsive flow containers reflow to fill the dashboard."
                        : "Exports the entire frame as a static background image — no live worksheets."
                    }
                  >
                    {mode === "floating" ? "Floating" : mode === "tiled" ? "Tiled" : "Image"}
                  </button>
                ))}
              </div>
              <div className="layout-hint" style={{ marginTop: 4 }}>
                {layoutMode === "floating"
                  ? "Every zone keeps its exact Figma position. The safe, confirmed default."
                  : layoutMode === "tiled"
                  ? "Zones are rebuilt as Tableau layout-flow containers — the layout adapts to the dashboard size."
                  : "The whole frame is rasterized as a single PNG. No worksheets, filters, or interactive zones."}
              </div>
            </div>

            <div className="export-row">
              <div className="field-label">Export options</div>
              <div className="toggle-row">
                {([
                  ["showFilters", "Dashboard filters"],
                  ["showLegends", "Legends"],
                  ["showTitles", "Titles"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="toggle-item">
                    <input
                      type="checkbox"
                      checked={!!(spec.exportOptions as any)?.[key]}
                      onChange={() =>
                        update((s) => ({
                          ...s,
                          exportOptions: {
                            ...DEFAULT_EXPORT_OPTIONS,
                            ...s.exportOptions,
                            [key]: !(s.exportOptions as any)?.[key],
                          },
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="shelf-row">
                <span className="shelf-label">Worksheet filter shelf:</span>
                <select
                  value={(spec.exportOptions as any)?.filterShelfPosition ?? "right"}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      exportOptions: {
                        ...DEFAULT_EXPORT_OPTIONS,
                        ...s.exportOptions,
                        filterShelfPosition: e.target.value as "left" | "right" | "hidden",
                      },
                    }))
                  }
                >
                  <option value="right">Right (recommended)</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
              {layoutMode !== "image" && (
                <>
                  <label className="toggle-item" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={includeBg}
                      onChange={() => setIncludeBg((v) => !v)}
                    />
                    <span>Export frame background as image</span>
                  </label>
                  {includeBg && (
                    <div className="layout-hint">
                      Rasterizes the entire frame as a background PNG — captures
                      gradients and complex fills. Increases export time and file size.
                    </div>
                  )}
                </>
              )}
            </div>

            <details className="spec-details import-accordion">
              <summary className="field-label import-summary">
                Use my real Tableau sheets
                {importedNames.length > 0 ? (
                  <span className="import-badge">{importedNames.length} loaded</span>
                ) : (
                  <span className="import-optional">optional</span>
                )}
              </summary>
              <div className="spec-details-body">
                <input
                  id="twb-upload"
                  className="file-input-hidden"
                  type="file"
                  accept=".twbx,.twb"
                  onChange={onImportFile}
                />
                <label htmlFor="twb-upload" className="upload-btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4m0 0L7 9m5-5 5 5" />
                    <path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2" />
                  </svg>
                  {importedNames.length ? "Replace workbook (.twb / .twbx)" : "Upload workbook (.twb / .twbx)"}
                </label>
                {importedNames.length > 0 && (
                  <div className="import-list" style={{ marginTop: 8 }}>
                    <div className="import-list-head">
                      <span>{importedNames.length} sheet(s) found</span>
                      <button type="button" className="link-btn" onClick={toggleAllSheets}>
                        {allChecked ? "Clear all" : "Select all"}
                      </button>
                    </div>
                    <div className="import-items">
                      {importedNames.map((n) => (
                        <label key={n} className="import-item">
                          <input
                            type="checkbox"
                            checked={!!checkedSheets[n]}
                            onChange={() => toggleSheet(n)}
                          />
                          <span>{n}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={checkedSheetNames.length === 0}
                      onClick={addSheetsToFigma}
                    >
                      Add {checkedSheetNames.length} sheet(s) to Figma
                    </button>
                    <div className="import-hint">
                      Drops them as <code>SHEET/</code> cards in an empty area beside your
                      dashboard. Drag each onto your design, then export — each swaps in its
                      real sheet &amp; data.
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      </>
    ) : (
      <>
        {/* A "no frame" parse failure is a fresh-start situation, not an error —
            show how the plugin works instead of a raw error string. */}
        {parseError && !/select (a|one or more) frame/i.test(parseError) ? (
          <div className="error-card">{parseError}</div>
        ) : (
          <div className="onboard">
            <div className="onboard-title">Design → Tableau in three steps</div>
            <ol className="onboard-steps">
              <li>
                <b>Select a frame</b> on the canvas. Select several and each
                becomes its own Tableau dashboard.
              </li>
              <li>
                <b>Name layers</b> with prefixes like <code>SHEET/</code>,{" "}
                <code>KPI/</code>, <code>FILTER/</code> — or drag ready-made
                pieces from the Library tab.
              </li>
              <li>
                <b>Export</b> — a .twbx downloads, ready to open in Tableau.
              </li>
            </ol>
          </div>
        )}
        <button
          className="scratch-btn"
          onClick={() => { manualRef.current = true; setSpec(blankSpec()); }}
        >
          Start from scratch
        </button>
      </>
    );

    return (
      <>
        {tabBar}
        <div className="scroll-area">
          {body}
        </div>
        {dashboardFooter}
        {resizeHandle}
      </>
    );
  }

  // ── Tab: Library (Components + Templates + Syntax + Defaults) ─────────────
  if (tab === "library") {
    let content: React.ReactNode;
    if (librarySubTab === "components") content = <ComponentLibrary />;
    else if (librarySubTab === "templates") content = <DashboardTemplates />;
    else content = <SyntaxTab />;

    return (
      <>
        {tabBar}
        {librarySubBar}
        <div className="scroll-area">
          {content}
        </div>
        {resizeHandle}
      </>
    );
  }

  // ── Tab: Account (profile, plan, usage, data & storage, about) ────────────
  if (tab === "account") {
    const initials =
      (account.userName || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?";

    return (
      <>
        {tabBar}
        <div className="scroll-area">
          <div>
            <div className="section-label">Profile</div>
            <div className="account-card account-profile">
              <div className="avatar" aria-hidden="true">{initials}</div>
              <div className="account-profile-info">
                <div className="account-name">{account.userName ?? "Figma user"}</div>
                <div className="account-sub">Signed in via Figma</div>
              </div>
              <span className="plan-pill">Free</span>
            </div>
          </div>

          <div>
            <div className="section-label">Plan</div>
            <div className="account-card">
              <div className="account-row-head">
                <span className="account-row-icon">{ACCOUNT_ICONS.plan}</span>
                <div>
                  <div className="account-name">Free — everything included</div>
                  <div className="account-sub">
                    While the plugin is in beta, every feature is free. No payment needed.
                  </div>
                </div>
              </div>
              <ul className="plan-features">
                <li>Multi-dashboard export — one Tableau dashboard per selected frame</li>
                <li>Real worksheet swap from your uploaded .twb / .twbx</li>
                <li>Native navigation buttons from Figma prototype links</li>
                <li>{`15 domain templates + the component library`}</li>
              </ul>
            </div>
          </div>

          <div>
            <div className="section-label">Usage</div>
            <div className="account-card account-stats">
              <div className="stat-cell">
                <div className="stat-val">{account.exportCount}</div>
                <div className="stat-key">Exports</div>
              </div>
              <div className="stat-cell">
                <div className="stat-val">{importedNames.length}</div>
                <div className="stat-key">Imported sheets</div>
              </div>
              <div className="stat-cell">
                <div className="stat-val">{frameNames.length}</div>
                <div className="stat-key">Frames selected</div>
              </div>
            </div>
          </div>

          <div>
            <div className="section-label">Data &amp; storage</div>
            <div className="account-card">
              <div className="account-row-head">
                <span className="account-row-icon">{ACCOUNT_ICONS.storage}</span>
                <div>
                  <div className="account-name">Imported workbook</div>
                  <div className="account-sub">
                    {importedNames.length
                      ? `${importedNames.length} worksheet(s) stored for the real-data swap — kept between plugin sessions.`
                      : "Nothing stored. Upload a .twb/.twbx on the Dashboard tab to swap real sheets into your exports."}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary account-clear-btn"
                disabled={importedNames.length === 0}
                onClick={clearStoredImport}
              >
                Clear stored workbook
              </button>
            </div>
            <div className="account-card account-note">
              <span className="account-row-icon">{ACCOUNT_ICONS.shield}</span>
              <div className="account-sub">
                Everything runs locally inside Figma. Your designs and workbooks never
                leave this machine — the plugin makes no network requests.
              </div>
            </div>
          </div>

          <div>
            <div className="section-label">About</div>
            <div className="account-card">
              <div className="account-row-head">
                <span className="account-row-icon">{ACCOUNT_ICONS.info}</span>
                <div>
                  <div className="account-name">Figma to Tableau</div>
                  <div className="account-sub">
                    Exports .twbx workbooks for Tableau 2026.2 · build {BUILD}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {resizeHandle}
      </>
    );
  }

  // ── Fallback (shouldn't happen) ───────────────────────────────────────────
  return (
    <>
      {tabBar}
      <div className="scroll-area">
        <div className="empty-state">
          <div className="empty-sub">Select a tab above.</div>
        </div>
      </div>
      {resizeHandle}
    </>
  );
}
