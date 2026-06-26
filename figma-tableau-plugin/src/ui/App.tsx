import { useEffect, useRef, useState } from "react";
import type { DashboardModel, PluginToUi, UiToPlugin } from "../shared/types";
import type { WorkbookSpec } from "../shared/spec";
import { seedSpecFromModel, blankSpec, faithfulSpec } from "../plugin/seed";
import { exportSpecTwbx } from "../plugin/exporter";
import DashboardPreview from "./DashboardPreview";
import DataPanel from "./editor/DataPanel";
import SheetsPanel from "./editor/SheetsPanel";
import LayoutPanel from "./editor/LayoutPanel";

const BUILD = "dedupe-names-30";

type Tab = "preview" | "data" | "sheets" | "layout" | "export";
type Status = { kind: "ok" | "err" | "warn"; text: string } | null;

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

export default function App() {
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WorkbookSpec | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  // The frame id we last seeded the spec from; re-seed when the user selects a
  // different frame. `manual` is set when building from scratch so canvas
  // selection changes don't wipe a hand-built workbook.
  const seededFrameRef = useRef<string | null>(null);
  const manualRef = useRef(false);
  // When set, the next model-ready re-seeds unconditionally (used by the
  // explicit "Re-read selected frame" action, which forces a fresh parse).
  const forceReseedRef = useRef(false);
  // When set, the next faithful-ready triggers the export.
  const pendingFaithfulRef = useRef(false);

  // Always-current ref so the (once-registered) message handler reads fresh state.
  const modelRef = useRef<DashboardModel | null>(null);
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
            const fSpec = faithfulSpec(msg.model!);
            const res = await exportSpecTwbx(fSpec);
            const sheets = msg.model!.zones.filter((z) => z.kind === "sheet").length;
            setStatus({
              kind: res.warnings.length ? "warn" : "ok",
              text: `Exported — ${res.zoneCount} zones, ${sheets} live SHEET/ worksheet(s) (${msg.model!.zones.length} layers). Download started.`,
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
      // Re-seed whenever a DIFFERENT frame is selected, so "select frame ->
      // convert" always reflects the current selection. Editing the same frame
      // persists (same id => no re-seed). `manual` mode (Start from scratch)
      // opts out so canvas clicks don't wipe a hand-built workbook.
      const fid = msg.model.id ?? "frame";
      const forced = forceReseedRef.current;
      if (forced || (!manualRef.current && seededFrameRef.current !== fid)) {
        try {
          const seeded = seedSpecFromModel(msg.model);
          seededFrameRef.current = fid;
          manualRef.current = false;
          forceReseedRef.current = false;
          setSpec(seeded);
          if (forced)
            setStatus({
              kind: "ok",
              text: `Loaded "${msg.model.title}" (${Math.round(msg.model.width)}×${Math.round(msg.model.height)}, ${msg.model.elements.length} layers).`,
            });
        } catch (err) {
          forceReseedRef.current = false;
          setParseError(
            "Couldn't build a workbook from this frame: " +
              (err as Error).message +
              ". Try a simpler frame, or start from scratch."
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

  // Force a FRESH parse of whatever is currently selected on the canvas, then
  // re-seed from it. Going back to the sandbox (rather than reusing the cached
  // `model`) guarantees we pick up the current selection even if the automatic
  // selection-change reparse didn't fire.
  const rereadSelection = () => {
    forceReseedRef.current = true;
    manualRef.current = false;
    setStatus({ kind: "warn", text: "Reading current selection…" });
    toPlugin({ type: "request-parse" });
  };

  // Rename the detected chart/KPI/image layers in Figma with SHEET//KPI/…
  // prefixes (done in the sandbox), then re-read so classification is explicit.
  const autoTagLayers = () => {
    if (!modelRef.current) {
      setStatus({ kind: "err", text: "Select your dashboard frame on the canvas first." });
      return;
    }
    forceReseedRef.current = true;
    manualRef.current = false;
    setStatus({ kind: "warn", text: "Tagging layers in Figma…" });
    toPlugin({ type: "apply-tags" });
  };

  // Primary export: real LaDataViz-style components — every detected panel
  // becomes its own Tableau worksheet inside nested layout-flow containers
  // (card-wrapped), with text zones for labels. No background image.
  // Faithful transpile: ask the sandbox to recreate the WHOLE frame as native
  // zones (text/shapes/images), then export. This is the LaDataViz-style output
  // that LOOKS exactly like the design (no sample-data charts).
  const exportFaithful = () => {
    pendingFaithfulRef.current = true;
    setBusy(true);
    setStatus({ kind: "warn", text: "Transpiling your design (text, shapes, icons)…" });
    toPlugin({ type: "request-faithful" });
  };

  if (!spec) {
    return (
      <div className="empty">
        {parseError ? (
          <>
            {parseError}
            <br />
            <br />
            Select a dashboard frame in Figma, or
            <br />
            <button
              className="secondary"
              style={{ marginTop: 10 }}
              onClick={() => {
                manualRef.current = true;
                setSpec(blankSpec());
              }}
            >
              Start from scratch
            </button>
          </>
        ) : (
          "Reading your Figma selection…"
        )}
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ["preview", "Preview"],
    ["data", "Data"],
    ["sheets", "Sheets"],
    ["layout", "Layout"],
    ["export", "Export"],
  ];

  return (
    <>
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="panel">
        {tab === "preview" &&
          (model ? <DashboardPreview model={model} /> : <div className="muted">Building from scratch — use the Data, Sheets and Layout tabs.</div>)}
        {tab === "data" && <DataPanel spec={spec} setSpec={update} />}
        {tab === "sheets" && <SheetsPanel spec={spec} setSpec={update} />}
        {tab === "layout" && <LayoutPanel spec={spec} setSpec={update} />}
        {tab === "export" && (
          <div>
            <h2>Export</h2>
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="row" style={{ marginBottom: 6, justifyContent: "space-between" }}>
                <span>
                  Source:{" "}
                  <b>{manualRef.current ? "Built from scratch" : model ? model.title : "—"}</b>
                  {model && !manualRef.current && (
                    <span className="muted"> &nbsp;{Math.round(model.width)}×{Math.round(model.height)}</span>
                  )}
                </span>
              </div>
              <button className="secondary" onClick={rereadSelection}>
                ⟳ Re-read selected frame
              </button>
              <button className="secondary" style={{ marginTop: 6 }} onClick={autoTagLayers}>
                🏷 Auto-tag layers (SHEET/, KPI/…)
              </button>
              <p className="muted" style={{ marginTop: 6 }}>
                Auto-tag renames your detected charts/KPIs/images in Figma with LaDataViz-style
                prefixes so the conversion is exact and repeatable. Selecting a different frame
                reloads automatically.
              </p>
            </div>
            <div className="field">
              <label>Workbook name</label>
              <input type="text" value={spec.workbookName} onChange={(e) => update((s) => ({ ...s, workbookName: e.target.value }))} />
            </div>
            <div className="field">
              <label>Tableau version</label>
              <select value={spec.tableauVersion} onChange={(e) => update((s) => ({ ...s, tableauVersion: e.target.value }))}>
                <option value="2026.2">2026.2 (recommended)</option>
              </select>
            </div>
            <table className="map-table">
              <tbody>
                <tr><td>Fields</td><td style={{ textAlign: "right" }}>{spec.data.fields.length}</td></tr>
                <tr><td>Calculated fields</td><td style={{ textAlign: "right" }}>{spec.data.calcs.length}</td></tr>
                <tr><td>Worksheets</td><td style={{ textAlign: "right" }}>{spec.worksheets.length}</td></tr>
                <tr><td>Dashboard zones</td><td style={{ textAlign: "right" }}>{spec.dashboards[0]?.zones.length ?? 0}</td></tr>
                <tr><td>Actions</td><td style={{ textAlign: "right" }}>{spec.includeActions ? spec.actions.length : "off"}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 10 }}>
              Calculated fields, conditional color, mark types, labels, quick filters and highlight/filter
              actions mirror confirmed Tableau 2026.2 patterns. Dual axis still falls back to stacked
              measures — toggle features off if a workbook won't open.
            </p>
          </div>
        )}
      </div>

      <div className="footer">
        {status && <div className={`status ${status.kind}`}>{status.text}</div>}
        <button className="primary" disabled={busy} onClick={exportFaithful}>
          {busy ? "Working…" : "⬇ Export to Tableau (exact design + live sheets)"}
        </button>
        <p className="muted" style={{ fontSize: 10, marginTop: 6, textAlign: "center" }}>
          Text stays as text; every <b>SHEET/</b>-tagged layer becomes a real Tableau worksheet
          bound to sample data (like LaDataViz) — editable from inside each sheet.
        </p>
        <div className="muted" style={{ fontSize: 9, textAlign: "center" }}>build {BUILD}</div>
      </div>
    </>
  );
}
