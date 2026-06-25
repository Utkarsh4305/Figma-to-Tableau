import { useState } from "react";
import type {
  WorkbookSpec,
  WorksheetSpec,
  MarkType,
  Aggregation,
  MeasurePill,
  ColorRule,
} from "../../shared/spec";
import { nextId } from "../../shared/spec";

// Tableau-style sheet builder: drag fields from the palette onto the Columns /
// Rows / Color / Label shelves, and pick a mark type from the gallery. Every
// shelf maps 1:1 onto the load-safe WorksheetSpec the generator already emits
// (Columns = one dimension, Rows = measures, Color = one field, Label = toggle).

const AGGS: Aggregation[] = ["Sum", "Average", "Count", "Median", "Min", "Max"];

// The mark gallery — "what's available in Tableau", as a visual picker.
const MARKS: { type: MarkType; glyph: string }[] = [
  { type: "Automatic", glyph: "✦" },
  { type: "Bar", glyph: "▭" },
  { type: "Line", glyph: "╱" },
  { type: "Area", glyph: "◣" },
  { type: "Pie", glyph: "◔" },
  { type: "Circle", glyph: "●" },
  { type: "Square", glyph: "■" },
  { type: "Shape", glyph: "◆" },
  { type: "Text", glyph: "T" },
];

const FIELD_MIME = "application/x-tab-field";

type FieldDrag = { name: string; role: "dimension" | "measure" };

function startFieldDrag(e: React.DragEvent, f: FieldDrag) {
  e.dataTransfer.setData(FIELD_MIME, JSON.stringify(f));
  e.dataTransfer.effectAllowed = "copy";
}
function readFieldDrag(e: React.DragEvent): FieldDrag | null {
  const raw = e.dataTransfer.getData(FIELD_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FieldDrag;
  } catch {
    return null;
  }
}

export default function SheetsPanel({
  spec,
  setSpec,
}: {
  spec: WorkbookSpec;
  setSpec: (updater: (s: WorkbookSpec) => WorkbookSpec) => void;
}) {
  const [sel, setSel] = useState(0);
  const [over, setOver] = useState<string | null>(null);
  const ws = spec.worksheets[sel];

  const dims: FieldDrag[] = [
    ...spec.data.fields.filter((f) => f.role === "dimension").map((f) => ({ name: f.name, role: "dimension" as const })),
    ...spec.data.calcs.filter((c) => c.role === "dimension").map((c) => ({ name: c.name, role: "dimension" as const })),
  ];
  const measures: FieldDrag[] = [
    ...spec.data.fields.filter((f) => f.role === "measure").map((f) => ({ name: f.name, role: "measure" as const })),
    ...spec.data.calcs.filter((c) => c.role === "measure").map((c) => ({ name: c.name, role: "measure" as const })),
  ];

  const updateWs = (patch: Partial<WorksheetSpec>) =>
    setSpec((s) => ({ ...s, worksheets: s.worksheets.map((w, i) => (i === sel ? { ...w, ...patch } : w)) }));

  const addSheet = () => {
    setSpec((s) => ({
      ...s,
      worksheets: [
        ...s.worksheets,
        {
          id: nextId("ws"),
          name: `Sheet ${s.worksheets.length + 1}`,
          mark: "Bar",
          dimension: dims[0]?.name,
          measures: measures[0] ? [{ field: measures[0].name, agg: "Sum" }] : [],
          dualAxis: false,
          showLabels: false,
        },
      ],
    }));
    setSel(spec.worksheets.length);
  };

  // A KPI is a real worksheet: a "big number" (Text mark, one measure, no dim).
  const addKpi = () => {
    setSpec((s) => ({
      ...s,
      worksheets: [
        ...s.worksheets,
        {
          id: nextId("ws"),
          name: `KPI ${s.worksheets.filter((w) => w.kpi).length + 1}`,
          mark: "Text",
          dimension: undefined,
          measures: measures[0] ? [{ field: measures[0].name, agg: "Sum" }] : [],
          dualAxis: false,
          showLabels: true,
          kpi: true,
        },
      ],
    }));
    setSel(spec.worksheets.length);
  };

  const removeSheet = (i: number) => {
    setSpec((s) => ({ ...s, worksheets: s.worksheets.filter((_, idx) => idx !== i) }));
    setSel((c) => Math.max(0, c >= i ? c - 1 : c));
  };

  const setMeasures = (ms: MeasurePill[]) => updateWs({ measures: ms });

  // --- shelf drop handlers (each enforces the load-safe field kind) ---
  const dropColumns = (f: FieldDrag) => {
    if (f.role !== "dimension") return;
    updateWs({ dimension: f.name });
  };
  const dropRows = (f: FieldDrag) => {
    if (f.role !== "measure") return;
    if (ws.measures.some((m) => m.field === f.name)) return;
    setMeasures([...ws.measures, { field: f.name, agg: "Sum" }]);
  };
  const dropColor = (f: FieldDrag) => updateWs({ colorField: f.name, colorRules: undefined });

  const allowDrop = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (fn: (f: FieldDrag) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const f = readFieldDrag(e);
    if (f) fn(f);
  };

  if (!ws) {
    return (
      <div>
        <h2>Worksheets</h2>
        <div className="row">
          <button className="secondary" onClick={addSheet}>+ Chart sheet</button>
          <button className="secondary" onClick={addKpi}>+ KPI</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Add a chart sheet (drag fields onto its shelves) or a KPI big-number. Both are sheets you can place
          on the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="pills">
        {spec.worksheets.map((w, i) => (
          <button key={w.id} className={`pill ${i === sel ? "active" : ""}`} onClick={() => setSel(i)}>
            {w.kpi ? "▦ " : ""}{w.name}
          </button>
        ))}
        <button className="pill add" onClick={addSheet} title="Add chart sheet">+</button>
        <button className="pill add" onClick={addKpi} title="Add KPI big-number">+KPI</button>
      </div>

      <div className="field">
        <label>Name <span className="chip">{ws.kpi ? "KPI big-number" : "chart sheet"}</span></label>
        <input type="text" value={ws.name} onChange={(e) => updateWs({ name: e.target.value })} />
      </div>

      {ws.kpi && (
        <p className="muted" style={{ margin: "-2px 0 8px" }}>
          A KPI shows a single measure as a big number (Text mark, no dimension). Drop one measure on Rows.
        </p>
      )}

      {/* Field palette — drag these onto the shelves below */}
      <label>Data fields <span className="muted" style={{ fontWeight: 400 }}>· drag onto a shelf</span></label>
      <div className="palette">
        {dims.map((f) => (
          <span key={f.name} className="fpill dim" draggable onDragStart={(e) => startFieldDrag(e, f)} title="dimension">
            <span className="dot" /> {f.name}
          </span>
        ))}
        {measures.map((f) => (
          <span key={f.name} className="fpill meas" draggable onDragStart={(e) => startFieldDrag(e, f)} title="measure">
            <span className="dot" /> {f.name}
          </span>
        ))}
        {dims.length + measures.length === 0 && <span className="muted">No fields — add some in the Data tab.</span>}
      </div>

      {/* Mark-type gallery */}
      <label style={{ marginTop: 12 }}>Mark type</label>
      <div className="marks-gallery">
        {MARKS.map((m) => (
          <button
            key={m.type}
            className={`mark-cell ${ws.mark === m.type ? "active" : ""}`}
            onClick={() => updateWs({ mark: m.type })}
            title={m.type}
          >
            <span className="mark-glyph">{m.glyph}</span>
            <span className="mark-name">{m.type}</span>
          </button>
        ))}
      </div>

      {/* Shelves */}
      <div
        className={`shelf ${over === "cols" ? "over" : ""}`}
        onDragOver={(e) => { allowDrop(e); setOver("cols"); }}
        onDragLeave={() => setOver(null)}
        onDrop={handleDrop(dropColumns)}
      >
        <span className="shelf-label">Columns</span>
        <div className="shelf-body">
          {ws.dimension ? (
            <span className="fpill dim on-shelf">
              {ws.dimension}
              <button className="x" onClick={() => updateWs({ dimension: undefined })}>✕</button>
            </span>
          ) : (
            <span className="shelf-hint">drop a dimension</span>
          )}
        </div>
      </div>

      <div
        className={`shelf ${over === "rows" ? "over" : ""}`}
        onDragOver={(e) => { allowDrop(e); setOver("rows"); }}
        onDragLeave={() => setOver(null)}
        onDrop={handleDrop(dropRows)}
      >
        <span className="shelf-label">Rows</span>
        <div className="shelf-body">
          {ws.measures.length === 0 && <span className="shelf-hint">drop measures</span>}
          {ws.measures.map((m, i) => (
            <span key={i} className="fpill meas on-shelf">
              <select
                className="agg"
                value={m.agg}
                onChange={(e) => setMeasures(ws.measures.map((x, idx) => (idx === i ? { ...x, agg: e.target.value as Aggregation } : x)))}
              >
                {AGGS.map((a) => (<option key={a}>{a}</option>))}
              </select>
              {m.field}
              <button className="x" onClick={() => setMeasures(ws.measures.filter((_, idx) => idx !== i))}>✕</button>
            </span>
          ))}
        </div>
      </div>

      <div
        className={`shelf ${over === "color" ? "over" : ""}`}
        onDragOver={(e) => { allowDrop(e); setOver("color"); }}
        onDragLeave={() => setOver(null)}
        onDrop={handleDrop(dropColor)}
      >
        <span className="shelf-label">Color</span>
        <div className="shelf-body">
          {ws.colorField ? (
            <span className="fpill on-shelf">
              {ws.colorField}
              <button className="x" onClick={() => updateWs({ colorField: undefined, colorRules: undefined })}>✕</button>
            </span>
          ) : (
            <span className="shelf-hint">drop a field, or pick a solid color →</span>
          )}
          {!ws.colorField && (
            <input
              type="color"
              value={ws.markColor ?? "#4e79a7"}
              onChange={(e) => updateWs({ markColor: e.target.value })}
            />
          )}
        </div>
      </div>

      <div className={`shelf ${over === "label" ? "over" : ""}`}
        onDragOver={(e) => { allowDrop(e); setOver("label"); }}
        onDragLeave={() => setOver(null)}
        onDrop={handleDrop(() => updateWs({ showLabels: true }))}
      >
        <span className="shelf-label">Label</span>
        <div className="shelf-body">
          <input
            id="labels"
            type="checkbox"
            style={{ width: "auto" }}
            checked={ws.showLabels}
            onChange={(e) => updateWs({ showLabels: e.target.checked })}
          />
          <label htmlFor="labels" style={{ margin: 0 }}>Show mark labels</label>
        </div>
      </div>

      {ws.measures.length >= 2 && (
        <div className="row" style={{ marginTop: 8 }}>
          <input id="dual" type="checkbox" style={{ width: "auto" }} checked={ws.dualAxis} onChange={(e) => updateWs({ dualAxis: e.target.checked })} />
          <label htmlFor="dual" style={{ margin: 0 }}>
            Dual axis <span className="chip warn">experimental → stacked fallback</span>
          </label>
        </div>
      )}

      {ws.colorField && (
        <ColorRules rules={ws.colorRules ?? []} onChange={(rules) => updateWs({ colorRules: rules })} />
      )}

      <button className="secondary danger" style={{ marginTop: 14 }} onClick={() => removeSheet(sel)}>
        Delete worksheet
      </button>
    </div>
  );
}

function ColorRules({ rules, onChange }: { rules: ColorRule[]; onChange: (r: ColorRule[]) => void }) {
  return (
    <div className="card">
      <label>Conditional color rules (value → color)</label>
      <p className="muted" style={{ margin: "0 0 6px" }}>Pin specific values of the field to exact colors.</p>
      {rules.map((r, i) => (
        <div key={i} className="row">
          <input
            type="text"
            placeholder="value (e.g. High)"
            value={r.value}
            onChange={(e) => onChange(rules.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))}
          />
          <input
            type="color"
            value={r.hex}
            onChange={(e) => onChange(rules.map((x, idx) => (idx === i ? { ...x, hex: e.target.value } : x)))}
          />
          <button className="iconbtn" onClick={() => onChange(rules.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button className="secondary" onClick={() => onChange([...rules, { value: "", hex: "#4e79a7" }])}>+ Add rule</button>
    </div>
  );
}
