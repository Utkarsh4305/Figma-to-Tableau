import type { MappingRow, ElementRole, ChartKind } from "../shared/types";

const ROLES: ElementRole[] = [
  "worksheet",
  "kpi",
  "filter",
  "text",
  "container",
  "image",
  "ignore",
];

const CHART_KINDS: ChartKind[] = [
  "bar",
  "line",
  "pie",
  "area",
  "scatter",
  "heatmap",
  "table",
  "kpi",
];

export default function MappingPanel({
  rows,
  onChange,
}: {
  rows: MappingRow[];
  onChange: (rows: MappingRow[]) => void;
}) {
  const update = (id: string, patch: Partial<MappingRow>) => {
    onChange(rows.map((r) => (r.elementId === id ? { ...r, ...patch } : r)));
  };

  return (
    <div>
      <h2>Element mapping</h2>
      <p className="muted">
        Adjust how each Figma layer maps to Tableau. Charts become worksheets; KPI cards,
        filters and labels become text zones.
      </p>
      <table className="map-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Tableau role</th>
            <th>Chart</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.elementId}>
              <td>
                <div style={{ fontWeight: 600 }}>{truncate(r.elementName, 22)}</div>
                <span className="chip">{r.figmaType}</span>
              </td>
              <td>
                <select
                  value={r.role}
                  onChange={(e) => update(r.elementId, { role: e.target.value as ElementRole })}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={r.chartKind ?? "bar"}
                  disabled={r.role !== "worksheet" && r.role !== "kpi"}
                  onChange={(e) => update(r.elementId, { chartKind: e.target.value as ChartKind })}
                >
                  {CHART_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
