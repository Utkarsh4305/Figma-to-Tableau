import { useEffect, useRef, useState } from "react";
import type { DashboardModel, PluginToUi, UiToPlugin, DefaultKind } from "../shared/types";
import type { WorkbookSpec } from "../shared/spec";
import { nextId } from "../shared/spec";
import { seedSpecFromModel, blankSpec, faithfulSpecMulti } from "../plugin/seed";
import { exportSpecTwbx } from "../plugin/exporter";
import { parseImport, type ParsedImport } from "../plugin/twbImport";
import DashboardPreview from "./DashboardPreview";

const BUILD = "nav-interactions-tabs-43";

type Status = { kind: "ok" | "err" | "warn"; text: string } | null;

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

/**
 * Logo — a clean data-flow mark:
 * Three ascending bars (chart) with a small arrow connector,
 * representing "design data → Tableau workbook".
 */
const PluginLogo = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Background */}
    <rect width="40" height="40" rx="10" fill="#1e1e1e" />

    {/* Bar chart — three columns, ascending left to right */}
    {/* Left bar */}
    <rect x="8"  y="22" width="5" height="10" rx="1.5" fill="#f0f0f0" opacity="0.4" />
    {/* Middle bar */}
    <rect x="17" y="16" width="5" height="16" rx="1.5" fill="#f0f0f0" opacity="0.7" />
    {/* Right bar */}
    <rect x="26" y="10" width="5" height="22" rx="1.5" fill="#f0f0f0" />

    {/* Small top-right dot — data point marker */}
    <circle cx="28.5" cy="8" r="2" fill="#f0f0f0" opacity="0.5" />
  </svg>
);

/** Centred brand block shown at the top of the plugin */
const Brand = () => (
  <div className="brand">
    <PluginLogo />
    <div className="brand-name">Figma to Tableau</div>
    <div className="brand-sub">Export dashboards as .twbx workbooks</div>
  </div>
);

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
  const [tab, setTab] = useState<"export" | "syntax" | "defaults">("export");

  // Imported real worksheets (the swap feature) — held in a ref so the once-
  // registered faithful-ready handler reads the latest upload.
  const importedRef        = useRef<ParsedImport | null>(null);
  const seededFrameRef     = useRef<string | null>(null);
  const manualRef          = useRef(false);
  const forceReseedRef     = useRef(false);
  const pendingFaithfulRef = useRef(false);
  const modelRef           = useRef<DashboardModel | null>(null);
  modelRef.current = model;
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
            // Worksheet swap: if the user uploaded their real .twbx, replace any
            // SHEET/ placeholder whose name matches an imported worksheet with
            // that real sheet (on its real data) instead of a demo sample chart.
            let swapped = 0;
            let importedFilters = 0;
            const imp = importedRef.current;
            if (imp) {
              const wsNames = new Set(fSpec.worksheets.map((w) => w.name));
              const matches = imp.worksheetNames.filter((n) => wsNames.has(n));
              if (matches.length) {
                fSpec.imports = imp.payloadFor(matches);
                swapped = matches.length;
                const swappedSet = new Set(matches);
                // Show the imported sheet's REAL name as the zone title (Tableau
                // renders it in the zone's title bar) instead of leaving it hidden.
                for (const d of fSpec.dashboards)
                  for (const z of d.zones)
                    if (z.kind === "sheet" && z.worksheet && swappedSet.has(z.worksheet))
                      z.showTitle = true;
                // Lift each swapped sheet's own quick filters onto the dashboard as
                // real filter cards (bound to the imported data via their verbatim
                // param), placed just above the sheet they control.
                const FW = 200, FH = 32, FGAP = 8;
                const perSheet = new Map<string, number>();
                for (const f of imp.filtersFor(matches)) {
                  const dash = fSpec.dashboards.find((d) =>
                    d.zones.some((z) => z.kind === "sheet" && z.worksheet === f.worksheet)
                  );
                  if (!dash) continue;
                  const sheet = dash.zones.find(
                    (z) => z.kind === "sheet" && z.worksheet === f.worksheet
                  )!;
                  const idx = perSheet.get(f.worksheet) ?? 0;
                  perSheet.set(f.worksheet, idx + 1);
                  dash.zones.push({
                    id: nextId("z"),
                    kind: "filter",
                    friendlyName: `Filter ${f.field}`,
                    x: sheet.x + idx * (FW + FGAP),
                    y: Math.max(0, sheet.y - FH - 4),
                    w: Math.min(FW, Math.round(sheet.w)),
                    h: FH,
                    worksheet: f.worksheet,
                    field: f.field,
                    filterParam: f.param,
                    bg: "#FFFFFF",
                    fg: "#D7DAEC",
                  });
                  importedFilters++;
                }
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
              (importedFilters ? `, ${importedFilters} imported filter(s)` : "") +
              (fSpec.actions.length ? `, ${fSpec.actions.length} action(s)` : "");
            setStatus({
              kind: res.warnings.length ? "warn" : "ok",
              text: `Exported — ${dashes} dashboard(s), ${res.zoneCount} zones, ${sheets} worksheet(s)${extra}. Download started.`,
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

  // ── Tabs: Export (the workflow) · Syntax (the conventions) · Defaults
  // (starter components). Syntax/Defaults work with or without a frame selected.
  const tabBar = (
    <div className="tab-bar">
      {([
        ["export", "Export"],
        ["syntax", "Syntax"],
        ["defaults", "Defaults"],
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

  if (tab === "syntax") {
    return (
      <>
        <Brand />
        {tabBar}
        <div className="scroll-area">
          <SyntaxTab />
        </div>
      </>
    );
  }

  if (tab === "defaults") {
    return (
      <>
        <Brand />
        {tabBar}
        <div className="scroll-area">
          <DefaultsTab onInsert={insertDefault} />
        </div>
      </>
    );
  }

  // ── No frame selected ──────────────────────────────────────────────────────
  if (!spec) {
    return (
      <>
        <Brand />
        {tabBar}

        <div className="scroll-area">
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
          ) : (
            <div className="empty-state">
              <div className="empty-title">No frame selected</div>
              <div className="empty-sub">Select a dashboard frame on the canvas.</div>
            </div>
          )}
        </div>
      </>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  const isManual = manualRef.current;

  return (
    <>
      <Brand />
      {tabBar}

      <div className="scroll-area">

        {model && !isManual ? (
          <DashboardPreview model={model} />
        ) : (
          <div className="frame-card">
            <div className="frame-info">
              <div className="frame-name">Manual workbook</div>
              <div className="frame-meta">No frame selected</div>
            </div>
          </div>
        )}

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
            <div className="stats-strip">
              {[
                { label: "Worksheets", value: spec.worksheets.length },
                { label: "Fields",     value: spec.data.fields.length },
                { label: "Zones",      value: spec.dashboards[0]?.zones.length ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="stat-cell">
                  <div className="stat-val">{value}</div>
                  <div className="stat-key">{label}</div>
                </div>
              ))}
            </div>

            <div className="export-row">
              <div className="field-label">Use my real Tableau sheets (optional)</div>
              <input type="file" accept=".twbx,.twb" onChange={onImportFile} />
              {importedNames.length > 0 && (
                <div className="import-list">
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
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="plugin-footer">
        {status && (
          <div className={`status-bar ${status.kind}`}>
            <span className="status-icon">
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
    </>
  );
}
