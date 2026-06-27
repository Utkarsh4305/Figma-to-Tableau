import { useEffect, useRef, useState } from "react";
import type { DashboardModel, PluginToUi, UiToPlugin } from "../shared/types";
import type { WorkbookSpec } from "../shared/spec";
import { seedSpecFromModel, blankSpec, faithfulSpec } from "../plugin/seed";
import { exportSpecTwbx } from "../plugin/exporter";
import DashboardPreview from "./DashboardPreview";

const BUILD = "ui-minimal-31";

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

export default function App() {
  const [model,      setModel]      = useState<DashboardModel | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [spec,       setSpec]       = useState<WorkbookSpec | null>(null);
  const [status,     setStatus]     = useState<Status>(null);
  const [busy,       setBusy]       = useState(false);

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
        if (msg.error || !msg.model) {
          setStatus({ kind: "err", text: msg.error || "Couldn't transpile this frame." });
          setBusy(false);
          return;
        }
        void (async () => {
          try {
            const fSpec  = faithfulSpec(msg.model!);
            const res    = await exportSpecTwbx(fSpec);
            const sheets = msg.model!.zones.filter((z) => z.kind === "sheet").length;
            setStatus({
              kind: res.warnings.length ? "warn" : "ok",
              text: `Exported — ${res.zoneCount} zones, ${sheets} worksheet(s). Download started.`,
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

  // ── No frame selected ──────────────────────────────────────────────────────
  if (!spec) {
    return (
      <>
        <Brand />

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
