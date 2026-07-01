import { useEffect, useRef, useState } from "react";
import type { DashboardModel, PluginToUi, UiToPlugin, DefaultKind } from "../shared/types";
import type { WorkbookSpec } from "../shared/spec";
import { DEFAULT_EXPORT_OPTIONS } from "../shared/spec";
import { seedSpecFromModel, blankSpec, faithfulSpecMulti } from "../plugin/seed";

import { exportSpecTwbx, applyImportedSwap } from "../plugin/exporter";
import { parseImport, parsedImportFromStored, type ParsedImport } from "../plugin/twbImport";
import ComponentLibrary from "./components/ComponentLibrary";
import DashboardTemplates from "./templates/DashboardTemplates";

const BUILD = "cleanup-simpleid-49";

type Status = { kind: "ok" | "err" | "warn"; text: string } | null;

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}



/** Documentation of the layer-name conventions the transpiler understands. */
const SYNTAX: Array<{ tag: string; title: string; desc: string }> = [
  { tag: "SHEET/Name[type]", title: "Worksheet", desc: "A real Tableau worksheet. type = bar · line · area · pie · scatter. Add :showTitle to show its title, :filter or :highlight to make clicks act on the dashboard." },
  { tag: "Nav/Label", title: "Navigation (interaction)", desc: "A native nav button. Its destination comes from the layer's Figma prototype link — wire a “Navigate to” connection to the target frame (or to a SHEET/ layer to open that worksheet). Unselected destinations are pulled into the export automatically." },
  { tag: "BUTTON/Label > Target", title: "Navigation (named)", desc: "A nav button whose target dashboard is named after the “>”. With two dashboards and no “>”, it toggles to the other one." },
  { tag: "FILTER/Field", title: "Quick filter", desc: "A Tableau quick-filter card on that dimension, bound to a chart on the same dashboard." },
  { tag: "KPI/Label", title: "KPI big number", desc: "A single-number worksheet (Text mark, one measure, no dimension)." },
  { tag: "Image/Name", title: "Image", desc: "Rasterized to a bitmap. IMG/ and LOGO/ work too. Vectors/icons are auto-rasterized even without the prefix." },
  { tag: "URL/page", title: "Web page object", desc: "A Tableau web-page object that loads the URL. WEB/ works too; bare hosts get https://." },
  { tag: "TEXT/Heading", title: "Text", desc: "A text zone with the layer's real text, font, size and color." },
  { tag: "CONTAINER/Name", title: "Layout container", desc: "A layout group. GROUP/ works too. Auto-Layout frames are also reconstructed as flow containers." },
];

function SyntaxTab() {
  return (
    <div>
      <div className="section-label">Layer-name conventions</div>
      <div className="syntax-intro">
        Name a Figma layer with one of these prefixes and it becomes the matching
        Tableau object on export. Matching is case-insensitive; spaces around the
        “/” are fine.
      </div>
      <div className="syntax-list">
        {SYNTAX.map((s) => (
          <div key={s.tag} className="syntax-item">
            <code className="syntax-tag">{s.tag}</code>
            <div className="syntax-title">{s.title}</div>
            <div className="syntax-desc">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Starter components the user can drop onto the canvas, pre-named per convention. */
const DEFAULTS: Array<{ kind: DefaultKind; label: string; hint: string }> = [
  { kind: "sheet", label: "Worksheet", hint: "SHEET/New Sheet[bar]" },
  { kind: "kpi", label: "KPI", hint: "KPI/Metric" },
  { kind: "nav", label: "Nav button", hint: "Nav/Go to… (wire a prototype link)" },
  { kind: "button", label: "Named button", hint: "BUTTON/Open > Dashboard" },
  { kind: "filter", label: "Filter", hint: "FILTER/Region" },
  { kind: "image", label: "Image", hint: "Image/Logo" },
  { kind: "web", label: "Web object", hint: "URL/example.com" },
  { kind: "text", label: "Text", hint: "TEXT/Heading" },
];

function DefaultsTab({ onInsert }: { onInsert: (k: DefaultKind) => void }) {
  return (
    <div>
      <div className="section-label">Insert a starter component</div>
      <div className="syntax-intro">
        Drops a correctly-named layer beside your dashboard frame. Drag it onto
        your design, restyle it freely, then export — the name carries the Tableau
        mapping. For a Nav button, wire its prototype “Navigate to” link in Figma.
      </div>
      <div className="defaults-grid">
        {DEFAULTS.map((d) => (
          <button key={d.kind} className="default-card" onClick={() => onInsert(d.kind)}>
            <div className="default-label">{d.label}</div>
            <code className="default-hint">{d.hint}</code>
          </button>
        ))}
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

  // Auto-dismiss status toasts after 4 seconds
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

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
            // One dashboard per selected frame (multi-dashboard export). Always
            // pixel-exact FLOATING — the layout that matches the Figma design
            // exactly. (Responsive layout-flow reflows/reshapes the design, so it
            // was removed from the UI; faithfulSpecMulti still supports 'flow' for
            // tests, but the export never requests it.)
            const fSpec   = faithfulSpecMulti(models);
            // Honor the name typed in the Export box (the file + .twb are named
            // from spec.workbookName); fall back to the frame-derived default.
            const typedName = workbookNameRef.current.trim();
            if (typedName) fSpec.workbookName = typedName;
            // Worksheet swap: if the user uploaded their real .twbx, replace any
            // SHEET/ placeholder whose name matches an imported worksheet with
            // that real sheet (on its real data) instead of a demo sample chart.
            let swapped = 0;
            let unmatched: string[] = [];
            const imp = importedRef.current;
            if (imp) {
              // Swap placed SHEET/ demos for the user's real imported worksheets,
              // matched by base name across every dashboard (see applyImportedSwap).
              const r = applyImportedSwap(fSpec, imp);
              swapped = r.swapped;
              unmatched = r.unmatched;
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
            const swapWarn = !imp
              ? realSheetCount > 0
                ? ` ⚠ No Tableau workbook is loaded, so every chart uses demo data. Upload your .twb/.twbx under "Use my real Tableau sheets" (it's remembered between sessions), then export again.`
                : ""
              : swapped === 0
              ? ` ⚠ No SHEET/ layer matched an imported worksheet, so every chart is demo data. Name your SHEET/ layers to match: ${imp.worksheetNames.slice(0, 8).join(", ")}${imp.worksheetNames.length > 8 ? "…" : ""}.`
              : unmatched.length
              ? ` ⚠ ${unmatched.length} SHEET/ placeholder(s) didn't match an imported sheet (still demo data): ${unmatched.slice(0, 6).join(", ")}${unmatched.length > 6 ? "…" : ""}.`
              : "";
            setStatus({
              kind: res.warnings.length || swapWarn ? "warn" : "ok",
              text: `Exported — ${dashes} dashboard(s), ${res.zoneCount} zones, ${sheets} worksheet(s)${extra}. Download started.${swapWarn}`,
            });
            toPlugin({ type: "notify", message: ".twbx downloaded — check your downloads." });
          } catch (e) {
            setStatus({ kind: "err", text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        })();
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

      if (msg.type !== "model-ready") return;

      if (msg.error || !msg.model) {
        setModel(null);
        setParseError(msg.error ?? "Nothing to parse.");
        return;
      }

      setParseError(null);
      setModel(msg.model);

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
    return () => window.removeEventListener("message", handler);
  }, []);

  const update = (updater: (s: WorkbookSpec) => WorkbookSpec) =>
    setSpec((s) => (s ? updater(s) : s));

  const exportFaithful = () => {
    pendingFaithfulRef.current = true;
    setBusy(true);
    setStatus({ kind: "warn", text: "Transpiling design…" });
    toPlugin({ type: "request-faithful" });
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

  const insertDefault = (kind: DefaultKind) => {
    toPlugin({ type: "insert-default", kind });
    setStatus({ kind: "ok", text: `Inserted a ${kind} component beside your dashboard — drag it onto your design.` });
  };

  // ── Library sub-tabs
  const [librarySubTab, setLibrarySubTab] = useState<"components" | "templates" | "syntax" | "defaults">("components");

  const librarySubBar = (
    <div className="sub-tab-bar">
      {([
        ["components", "Components"],
        ["templates",  "Templates"],
        ["syntax",     "Syntax"],
        ["defaults",   "Defaults"],
      ] as const).map(([id, label]) => (
        <button
          key={id}
          className={`sub-tab-btn ${librarySubTab === id ? "active" : ""}`}
          onClick={() => setLibrarySubTab(id)}
        >
          {label}
        </button>
      ))}
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
          onClick={() => setTab(id)}
        >
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
          <div className={`toast ${status.kind}`}>
            <span className="toast-icon">
              {status.kind === "ok" ? "✓" : status.kind === "err" ? "✕" : "–"}
            </span>
            <span>{status.text}</span>
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
                {model ? (
                  <div className="spec-detail-row">
                    <span className="spec-detail-label">Frame</span>
                    <span className="spec-detail-value">{model.title}</span>
                  </div>
                ) : null}
                {model ? (
                  <div className="spec-detail-row">
                    <span className="spec-detail-label">Dimensions</span>
                    <span className="spec-detail-value">
                      {Math.round(model.width)} × {Math.round(model.height)} · {model.elements.length} layers
                    </span>
                  </div>
                ) : null}
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
              <div className="field-label">Export options</div>
              <div className="toggle-row">
                {([
                  ["showFilters", "Dashboard filters"],
                  ["showLegends", "Legends"],
                  ["showTitles", "Titles"],
                  ["showTooltips", "Tooltips"],
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
            </div>

            <details className="spec-details import-accordion">
              <summary className="field-label import-summary">
                Use my real Tableau sheets (optional)
              </summary>
              <div className="spec-details-body">
                <input type="file" accept=".twbx,.twb" onChange={onImportFile} />
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
        {parseError ? (
          <>
            <div className="error-card">{parseError}</div>
            <button
              className="scratch-btn"
              onClick={() => { manualRef.current = true; setSpec(blankSpec()); }}
            >
              Start from scratch
            </button>
          </>
        ) : null}
      </>
    );

    return (
      <>
        {tabBar}
        <div className="scroll-area">
          {body}
        </div>
        {dashboardFooter}
      </>
    );
  }

  // ── Tab: Library (Components + Templates + Syntax + Defaults) ─────────────
  if (tab === "library") {
    let content: React.ReactNode;
    if (librarySubTab === "components") content = <ComponentLibrary />;
    else if (librarySubTab === "templates") content = <DashboardTemplates />;
    else if (librarySubTab === "syntax") content = <SyntaxTab />;
    else content = <DefaultsTab onInsert={insertDefault} />;

    return (
      <>
        {tabBar}
        {librarySubBar}
        <div className="scroll-area">
          {content}
        </div>
      </>
    );
  }

  // ── Tab: Account (payment & account) ──────────────────────────────────────
  if (tab === "account") {
    return (
      <>
        {tabBar}
        <div className="scroll-area">
          <div className="empty-state">
            <div className="empty-title">Account</div>
            <div className="empty-sub">Payment &amp; account settings coming soon.</div>
          </div>
        </div>
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
    </>
  );
}
