import { useState } from "react";
import type { WorkbookSpec, ZoneSpec, DashboardSpec, ActionSpec } from "../../shared/spec";
import { nextId } from "../../shared/spec";
import LayoutCanvas, { SHEET_MIME } from "./LayoutCanvas";

export default function LayoutPanel({
  spec,
  setSpec,
}: {
  spec: WorkbookSpec;
  setSpec: (updater: (s: WorkbookSpec) => WorkbookSpec) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const dash = spec.dashboards[0];
  if (!dash) return <div className="empty">No dashboard.</div>;

  const stringDims = spec.data.fields.filter((f) => f.role === "dimension" && f.type === "string").map((f) => f.name);
  const allDims = [
    ...spec.data.fields.filter((f) => f.role === "dimension").map((f) => f.name),
    ...spec.data.calcs.filter((c) => c.role === "dimension").map((c) => c.name),
  ];
  const targets = [...spec.worksheets.map((w) => w.name), dash.name];

  const updateDash = (patch: Partial<DashboardSpec>) =>
    setSpec((s) => ({ ...s, dashboards: s.dashboards.map((d, i) => (i === 0 ? { ...d, ...patch } : d)) }));

  const setZones = (zones: ZoneSpec[]) => updateDash({ zones });
  const updateZone = (id: string, patch: Partial<ZoneSpec>) =>
    setZones(dash.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));

  const addZone = (z: Omit<ZoneSpec, "id">) => {
    const id = nextId("z");
    setZones([...dash.zones, { ...z, id }]);
    setSelected(id);
  };
  const addSheetZone = () =>
    addZone({ kind: "sheet", x: 40, y: 100, w: 500, h: 320, worksheet: spec.worksheets[0]?.name, bg: "#FFFFFF" });
  const addTextZone = () =>
    addZone({ kind: "text", x: 40, y: 40, w: 400, h: 40, text: "Text", fontSize: 16, fg: "#101828" });
  const addButton = () =>
    addZone({ kind: "button", x: 40, y: 40, w: 160, h: 36, text: "Button", bg: "#2563EB", fg: "#FFFFFF", align: 1 });
  const addFilterZone = () =>
    addZone({ kind: "filter", x: 40, y: 40, w: 220, h: 70, worksheet: spec.worksheets[0]?.name, field: stringDims[0], bg: "#FFFFFF" });

  // Drag a sheet from the palette onto the canvas → drop a sheet zone there.
  const dropSheet = (name: string, x: number, y: number) => {
    const w = Math.min(500, dash.widthPx - x);
    const h = Math.min(320, dash.heightPx - y);
    addZone({ kind: "sheet", x, y, w, h, worksheet: name, bg: "#FFFFFF" });
  };

  const autoArrange = () => {
    const sheets = dash.zones.filter((z) => z.kind === "sheet");
    const others = dash.zones.filter((z) => z.kind !== "sheet");
    const topUsed = others.reduce((m, z) => Math.max(m, z.y + z.h), 0) + 16;
    const cols = sheets.length <= 1 ? 1 : 2;
    const gap = 16;
    const cw = (dash.widthPx - 40 * 2 - gap * (cols - 1)) / cols;
    const rows = Math.ceil(sheets.length / cols);
    const ch = (dash.heightPx - topUsed - 24 - gap * (rows - 1)) / Math.max(1, rows);
    const arranged = sheets.map((z, i) => ({
      ...z,
      x: 40 + (i % cols) * (cw + gap),
      y: topUsed + Math.floor(i / cols) * (ch + gap),
      w: Math.round(cw),
      h: Math.round(ch),
    }));
    setZones([...others, ...arranged]);
  };

  // --- actions ---
  const setActions = (actions: ActionSpec[]) => setSpec((s) => ({ ...s, actions }));
  const updateAction = (i: number, patch: Partial<ActionSpec>) =>
    setActions(spec.actions.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addAction = (kind: ActionSpec["kind"]) =>
    setActions([
      ...spec.actions,
      {
        id: nextId("act"),
        name: `${kind === "highlight" ? "Highlight" : "Filter"} ${spec.actions.length + 1}`,
        kind,
        sourceSheet: spec.worksheets[0]?.name ?? "",
        target: kind === "highlight" ? spec.worksheets[0]?.name ?? "" : dash.name,
        field: allDims[0],
        runOn: "select",
      },
    ]);

  return (
    <div>
      <h2>Dashboard layout</h2>

      <div className="field">
        <label>Dashboard name</label>
        <input type="text" value={dash.name} onChange={(e) => updateDash({ name: e.target.value })} />
      </div>
      <div className="row">
        <div className="field half">
          <label>Width</label>
          <input type="number" value={dash.widthPx} onChange={(e) => updateDash({ widthPx: Number(e.target.value) || 0 })} />
        </div>
        <div className="field half">
          <label>Height</label>
          <input type="number" value={dash.heightPx} onChange={(e) => updateDash({ heightPx: Number(e.target.value) || 0 })} />
        </div>
        <div className="field half">
          <label>Background</label>
          <input type="color" value={dash.bg} onChange={(e) => updateDash({ bg: e.target.value })} />
        </div>
      </div>

      <label style={{ marginTop: 6 }}>
        Sheets <span className="muted" style={{ fontWeight: 400 }}>· drag onto the canvas</span>
      </label>
      <div className="palette">
        {spec.worksheets.length === 0 && <span className="muted">No worksheets yet — build some in the Sheets tab.</span>}
        {spec.worksheets.map((w) => (
          <span
            key={w.id}
            className="fpill sheet"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(SHEET_MIME, w.name);
              e.dataTransfer.effectAllowed = "copy";
            }}
            title="drag onto the canvas"
          >
            <span className="dot" /> {w.name}
          </span>
        ))}
      </div>

      <LayoutCanvas dash={dash} selectedId={selected} onSelect={setSelected} onChange={updateZone} onDropSheet={dropSheet} />

      <div className="row">
        <button className="secondary" onClick={addSheetZone}>+ Sheet</button>
        <button className="secondary" onClick={addFilterZone}>+ Filter</button>
        <button className="secondary" onClick={addTextZone}>+ Text</button>
        <button className="secondary" onClick={addButton}>+ Button</button>
        <button className="secondary" onClick={autoArrange}>Auto-arrange</button>
      </div>

      <label style={{ marginTop: 10 }}>Zones ({dash.zones.length})</label>
      {dash.zones.map((z) => (
        <div key={z.id} className={`card ${selected === z.id ? "sel" : ""}`} onClick={() => setSelected(z.id)}>
          <div className="row">
            <span className="chip">{z.kind}</span>
            {z.kind === "sheet" || z.kind === "filter" ? (
              <select value={z.worksheet ?? ""} onChange={(e) => updateZone(z.id, { worksheet: e.target.value })}>
                {spec.worksheets.map((w) => (
                  <option key={w.id}>{w.name}</option>
                ))}
              </select>
            ) : (
              <input type="text" value={z.text ?? ""} placeholder="text" onChange={(e) => updateZone(z.id, { text: e.target.value })} />
            )}
            {z.kind === "filter" && (
              <select value={z.field ?? ""} onChange={(e) => updateZone(z.id, { field: e.target.value })}>
                {stringDims.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            )}
            <button className="iconbtn" onClick={() => setZones(dash.zones.filter((x) => x.id !== z.id))}>✕</button>
          </div>
          <div className="row coords">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <label key={k} className="coord">
                {k}
                <input type="number" value={z[k]} onChange={(e) => updateZone(z.id, { [k]: Number(e.target.value) || 0 } as Partial<ZoneSpec>)} />
              </label>
            ))}
            {z.kind !== "sheet" && z.kind !== "filter" && (
              <input type="color" title="text color" value={z.fg ?? "#101828"} onChange={(e) => updateZone(z.id, { fg: e.target.value })} />
            )}
            <input type="color" title="background" value={z.bg ?? "#ffffff"} onChange={(e) => updateZone(z.id, { bg: e.target.value })} />
          </div>
        </div>
      ))}

      <h2 style={{ marginTop: 18 }}>Actions</h2>
      <div className="row">
        <input
          id="incl-actions"
          type="checkbox"
          style={{ width: "auto" }}
          checked={spec.includeActions}
          onChange={(e) => setSpec((s) => ({ ...s, includeActions: e.target.checked }))}
        />
        <label htmlFor="incl-actions" style={{ margin: 0 }}>
          Include actions in export
        </label>
      </div>
      <p className="muted" style={{ margin: "4px 0 8px" }}>
        Highlight (<span className="chip">tsc:brush</span>) is the safest. Filter (<span className="chip">tsc:tsl-filter</span>)
        also writes a link group <span className="chip warn">verify it opens</span>.
      </p>
      {spec.actions.map((a, i) => (
        <div key={a.id} className="card">
          <div className="row">
            <span className="chip">{a.kind}</span>
            <input type="text" value={a.name} onChange={(e) => updateAction(i, { name: e.target.value })} />
            <button className="iconbtn" onClick={() => setActions(spec.actions.filter((_, idx) => idx !== i))}>✕</button>
          </div>
          <div className="row">
            <label className="coord">
              from
              <select value={a.sourceSheet} onChange={(e) => updateAction(i, { sourceSheet: e.target.value })}>
                {spec.worksheets.map((w) => (
                  <option key={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label className="coord">
              to
              <select value={a.target} onChange={(e) => updateAction(i, { target: e.target.value })}>
                {targets.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label className="coord">
              {a.kind === "highlight" ? "highlight field" : "link field"}
              <select value={a.field ?? ""} onChange={(e) => updateAction(i, { field: e.target.value })}>
                {allDims.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="coord">
              run on
              <select value={a.runOn} onChange={(e) => updateAction(i, { runOn: e.target.value as ActionSpec["runOn"] })}>
                <option value="select">select</option>
                <option value="hover">hover</option>
                <option value="menu">menu</option>
              </select>
            </label>
          </div>
        </div>
      ))}
      <div className="row">
        <button className="secondary" onClick={() => addAction("highlight")}>+ Highlight action</button>
        <button className="secondary" onClick={() => addAction("filter")}>+ Filter action</button>
      </div>
    </div>
  );
}
