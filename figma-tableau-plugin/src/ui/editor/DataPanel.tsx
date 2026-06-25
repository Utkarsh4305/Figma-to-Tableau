import type { WorkbookSpec, SpecField, CalcField } from "../../shared/spec";
import { nextId } from "../../shared/spec";
import type { FieldType } from "../../shared/types";
import { parseCsvText, inferFields, generateSampleRows } from "../../plugin/csv";
import { parseXlsx } from "../../plugin/xlsx";
import { useState } from "react";

const TYPES: FieldType[] = ["string", "integer", "real", "date"];

export default function DataPanel({
  spec,
  setSpec,
}: {
  spec: WorkbookSpec;
  setSpec: (updater: (s: WorkbookSpec) => WorkbookSpec) => void;
}) {
  const data = spec.data;
  const [loadMsg, setLoadMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const setFields = (fields: SpecField[], rows?: string[][]) =>
    setSpec((s) => ({
      ...s,
      data: { ...s.data, fields, rows: rows ?? generateSampleRows(fields) },
    }));

  const updateField = (i: number, patch: Partial<SpecField>) => {
    const fields = data.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    // type change may flip role default; keep existing rows (no count change)
    setSpec((s) => ({ ...s, data: { ...s.data, fields } }));
  };

  const addField = () => {
    const name = `Field ${data.fields.length + 1}`;
    setFields([...data.fields, { name, type: "string", role: "dimension" }]);
  };
  const removeField = (i: number) => setFields(data.fields.filter((_, idx) => idx !== i));

  const onUpload = async (file: File) => {
    setLoadMsg(null);
    try {
      const isExcel = /\.xlsx?$/i.test(file.name);
      const { header, rows } = isExcel
        ? await parseXlsx(await file.arrayBuffer())
        : parseCsvText(await file.text());
      if (header.length === 0) {
        setLoadMsg({ kind: "err", text: "No columns found in that file." });
        return;
      }
      const fields = inferFields(header, rows);
      setSpec((s) => ({ ...s, data: { ...s.data, fileName: "data.csv", fields, rows } }));
      setLoadMsg({ kind: "ok", text: `Loaded ${fields.length} field(s), ${rows.length} row(s) from ${file.name}.` });
    } catch (e) {
      setLoadMsg({ kind: "err", text: `Couldn't read ${file.name}: ${(e as Error).message}` });
    }
  };

  // --- calculated fields ---
  const setCalcs = (calcs: CalcField[]) => setSpec((s) => ({ ...s, data: { ...s.data, calcs } }));
  const addCalc = () => {
    const n = data.calcs.length + 1;
    setCalcs([
      ...data.calcs,
      {
        id: nextId("calc"),
        localName: `Calculation_${Date.now()}${n}`,
        name: `Calc ${n}`,
        formula: "",
        type: "string",
        role: "dimension",
      },
    ]);
  };
  const updateCalc = (i: number, patch: Partial<CalcField>) =>
    setCalcs(data.calcs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeCalc = (i: number) => setCalcs(data.calcs.filter((_, idx) => idx !== i));

  return (
    <div>
      <h2>Data source</h2>
      <p className="muted">
        Placeholder data backs the workbook. Upload a CSV or Excel file to bind worksheets to real columns.
      </p>

      <div className="row">
        <label className="filebtn">
          Upload CSV / Excel
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </label>
        <button className="secondary" style={{ width: "auto" }} onClick={() => setFields(data.fields)}>
          Regenerate sample
        </button>
        <span className="chip">{data.rows.length} rows</span>
      </div>
      {loadMsg && <div className={`status ${loadMsg.kind}`} style={{ marginBottom: 8 }}>{loadMsg.text}</div>}

      <label>Fields</label>
      <table className="map-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.fields.map((f, i) => (
            <tr key={i}>
              <td>
                <input type="text" value={f.name} onChange={(e) => updateField(i, { name: e.target.value })} />
              </td>
              <td>
                <select
                  value={f.type}
                  onChange={(e) => {
                    const type = e.target.value as FieldType;
                    updateField(i, {
                      type,
                      role: type === "integer" || type === "real" ? "measure" : "dimension",
                    });
                  }}
                >
                  {TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td>
                <select value={f.role} onChange={(e) => updateField(i, { role: e.target.value as SpecField["role"] })}>
                  <option value="dimension">dimension</option>
                  <option value="measure">measure</option>
                </select>
              </td>
              <td>
                <button className="iconbtn" onClick={() => removeField(i)} title="Remove">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="secondary" onClick={addField}>
        + Add field
      </button>

      <label style={{ marginTop: 14 }}>Calculated fields (for conditional color / metrics)</label>
      {data.calcs.map((c, i) => (
        <div key={c.id} className="card">
          <div className="row">
            <input type="text" value={c.name} placeholder="Name" onChange={(e) => updateCalc(i, { name: e.target.value })} />
            <button className="iconbtn" onClick={() => removeCalc(i)} title="Remove">
              ✕
            </button>
          </div>
          <input
            type="text"
            value={c.formula}
            placeholder="IF [Value] > 50 THEN 'High' ELSE 'Low' END"
            onChange={(e) => updateCalc(i, { formula: e.target.value })}
          />
          <div className="row" style={{ marginTop: 6 }}>
            <select value={c.type} onChange={(e) => updateCalc(i, { type: e.target.value as FieldType })}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select value={c.role} onChange={(e) => updateCalc(i, { role: e.target.value as CalcField["role"] })}>
              <option value="dimension">dimension</option>
              <option value="measure">measure</option>
            </select>
          </div>
        </div>
      ))}
      <button className="secondary" onClick={addCalc}>
        + Add calculated field
      </button>
    </div>
  );
}
