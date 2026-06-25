import { useEffect, useRef, useState } from "react";
import type { DashboardModel, PluginToUi, UiToPlugin } from "../shared/types";
import type { WorkbookSpec } from "../shared/spec";
import { seedSpecFromModel, blankSpec, faithfulSpec } from "../plugin/seed";
import { exportSpecTwbx } from "../plugin/exporter";
import DashboardPreview from "./DashboardPreview";
import DataPanel from "./editor/DataPanel";
import SheetsPanel from "./editor/SheetsPanel";
import LayoutPanel from "./editor/LayoutPanel";

const BUILD = "faithful-nan-fix-14";

type Tab = "preview" | "data" | "sheets" | "layout" | "export";
type ExportMode = "floating" | "tiled" | "background";
type Status = { kind: "ok" | "err" | "warn"; text: string } | null;

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

function slugFile(s: string): string {
  return (
    s.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "Dashboard"
  );
}

export default function App() {
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WorkbookSpec | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  // Tiled is the default — nested layout-flow containers (no overlap, no text
  // clipping). Floating is opt-in for pixel-exact debugging.
  const [exportMode, setExportMode] = useState<ExportMode>("tiled");
  const [bgPng, setBgPng] = useState<string | null>(null);
  // The frame id we last seeded the spec from; re-seed when the user selects a
  // different frame. `manual` is set when building from scratch so canvas
  // selection changes don't wipe a hand-built workbook.
  const seededFrameRef = useRef<string | null>(null);
  const manualRef = useRef(false);
  // When set, the next model-ready re-seeds unconditionally (used by the
  // explicit "Re-read selected frame" action, which forces a fresh parse).
  const forceReseedRef = useRef(false);
  // When set, the next background-ready triggers a one-click "exact design" export.
  const pendingExactRef = useRef(false);
  // When set, the next faithful-ready triggers the faithful-transpile export.
  const pendingFaithfulRef = useRef(false);

  // Always-current refs so the (once-registered) message handler reads fresh state.
  const modelRef = useRef<DashboardModel | null>(null);
  const specRef = useRef<WorkbookSpec | null>(null);
  modelRef.current = model;
  specRef.current = spec;

  // One-click "exact design": use the freshly rendered frame PNG as the
  // dashboard background at the frame's exact size, keeping only worksheet zones
  // on top. Independent of element detection — the design comes out pixel-exact.
  const doExactExport = async (png: string, w?: number, h?: number) => {
    const s = specRef.current;
    const m = modelRef.current;
    if (!s) {
      setStatus({ kind: "err", text: "Open a frame first." });
      setBusy(false);
      return;
    }
    const width = Math.round(w || m?.width || 1280);
    const height = Math.round(h || m?.height || 800);
    setBusy(true);
    setStatus(null);
    try {
      const file = `${slugFile(s.workbookName)}-bg.png`;
      const out: WorkbookSpec = {
        ...s,
        dashboards: s.dashboards.map((d, i) =>
          i === 0
            ? {
                ...d,
                layoutMode: "floating" as const,
                widthPx: width,
                heightPx: height,
                backgroundImage: png,
                backgroundImageFile: file,
                // exact design = ONLY the rendered image; no placeholder
                // worksheets laid on top (those would cover your design).
                zones: [],
              }
            : d
        ),
      };
      const res = await exportSpecTwbx(out);
      setStatus({
        kind: res.warnings.length ? "warn" : "ok",
        text: res.warnings.length
          ? `Exported with warnings: ${res.warnings[0]}`
          : `Exact design exported (${width}×${height}px). Download started.`,
      });
      toPlugin({ type: "notify", message: "Exact-design .twbx downloaded — check your downloads." });
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginToUi | undefined;
      if (!msg) return;
      if (msg.type === "background-ready") {
        if (msg.png) {
          setBgPng(msg.png);
          if (pendingExactRef.current) {
            pendingExactRef.current = false;
            void doExactExport(msg.png, msg.width, msg.height);
          }
        } else {
          pendingExactRef.current = false;
          setStatus({ kind: "err", text: msg.error || "Couldn't render the frame image." });
          setBusy(false);
        }
        return;
      }
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
            const zc = res.zoneCount;
            setStatus({
              kind: res.warnings.length ? "warn" : "ok",
              text: `Faithful design exported — ${zc} zones (${msg.model!.zones.length} layers). Download started.`,
            });
            toPlugin({ type: "notify", message: "Faithful .twbx downloaded — check your downloads." });
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
      setBgPng(null); // a new frame invalidates any cached background render
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

  // Pick an export layout. Floating/tiled map onto the spec; background renders
  // the whole frame to an image (requested from the sandbox) with only the
  // worksheets floating on top — the LaDataViz "background image" export.
  const chooseExportMode = (m: ExportMode) => {
    setExportMode(m);
    if (m !== "background") {
      update((s) => ({
        ...s,
        dashboards: s.dashboards.map((d, i) => (i === 0 ? { ...d, layoutMode: m } : d)),
      }));
    } else if (!bgPng) {
      setStatus({ kind: "warn", text: "Rendering frame image…" });
      toPlugin({ type: "request-background" });
    }
  };

  const update = (updater: (s: WorkbookSpec) => WorkbookSpec) =>
    setSpec((s) => (s ? updater(s) : s));

  // For background mode, bake the rendered frame as the dashboard background and
  // keep only the worksheets floating on top (text/buttons live in the image).
  const specForExport = (s: WorkbookSpec): WorkbookSpec => {
    if (exportMode !== "background" || !bgPng) return s;
    const file = `${slugFile(s.workbookName)}-bg.png`;
    return {
      ...s,
      dashboards: s.dashboards.map((d, i) =>
        i === 0
          ? {
              ...d,
              layoutMode: "floating",
              backgroundImage: bgPng,
              backgroundImageFile: file,
              zones: d.zones.filter((z) => z.kind === "sheet"),
            }
          : d
      ),
    };
  };

  // Force a FRESH parse of whatever is currently selected on the canvas, then
  // re-seed from it. Going back to the sandbox (rather than reusing the cached
  // `model`) guarantees we pick up the current selection even if the automatic
  // selection-change reparse didn't fire.
  const rereadSelection = () => {
    forceReseedRef.current = true;
    manualRef.current = false;
    setExportMode("tiled");
    setBgPng(null);
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
    setExportMode("tiled");
    setBgPng(null);
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

  const exportRealComponents = async () => {
    if (!spec) return;
    setBusy(true);
    setStatus(null);
    try {
      const out: WorkbookSpec = {
        ...spec,
        dashboards: spec.dashboards.map((d, i) =>
          i === 0
            ? {
                ...d,
                layoutMode: d.root ? "tiled" : "floating",
                backgroundImage: undefined,
                backgroundImageFile: undefined,
              }
            : d
        ),
      };
      const res = await exportSpecTwbx(out);
      setStatus(
        res.warnings.length
          ? { kind: "warn", text: `Exported with ${res.warnings.length} warning(s): ${res.warnings[0]}` }
          : { kind: "ok", text: `${res.worksheetCount} sheet(s) in ${res.zoneCount} zones. Download started.` }
      );
      toPlugin({ type: "notify", message: "Tableau .twbx generated — check your downloads." });
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!spec) return;
    if (exportMode === "background" && !bgPng) {
      setStatus({ kind: "err", text: "Frame image isn't ready yet — wait a moment or reselect the frame." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await exportSpecTwbx(specForExport(spec));
      setStatus(
        res.warnings.length
          ? { kind: "warn", text: `Exported with ${res.warnings.length} warning(s): ${res.warnings[0]}` }
          : { kind: "ok", text: `${res.worksheetCount} worksheet(s), ${res.zoneCount} zones. Download started.` }
      );
      toPlugin({ type: "notify", message: "Tableau .twbx generated — check your downloads." });
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
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
            <div className="field">
              <label>Export layout</label>
              <select value={exportMode} onChange={(e) => chooseExportMode(e.target.value as ExportMode)}>
                <option value="floating">Floating — pixel-perfect positions</option>
                <option value="tiled">Tiled — Auto-Layout containers</option>
                <option value="background" disabled={!model}>
                  Background image — frame as image + sheets on top
                </option>
              </select>
              <p className="muted" style={{ marginTop: 4 }}>
                {exportMode === "tiled"
                  ? "Zones become nested Tableau containers (from your Figma Auto Layout)."
                  : exportMode === "background"
                  ? bgPng
                    ? "Frame rendered ✓ — exports as a background image with worksheets on top."
                    : "Rendering the frame image from Figma…"
                  : "Each object keeps its exact x/y position from Figma."}
              </p>
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
          {busy ? "Working…" : "⬇ Export EXACT design (looks like Figma)"}
        </button>
        <button className="secondary" disabled={busy} onClick={exportRealComponents}>
          {busy ? "…" : "Export as data sheets (sample data)"}
        </button>
        <button className="secondary" disabled={busy} onClick={handleExport}>
          {busy ? "…" : "Export with current layout options"}
        </button>
        <div className="muted" style={{ fontSize: 9, textAlign: "center" }}>build {BUILD}</div>
      </div>
    </>
  );
}
