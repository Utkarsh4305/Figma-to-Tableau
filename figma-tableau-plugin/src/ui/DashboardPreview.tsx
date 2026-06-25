import type { DashboardModel } from "../shared/types";

const PREVIEW_W = 412; // px inside the panel

export default function DashboardPreview({ model }: { model: DashboardModel }) {
  const scale = PREVIEW_W / Math.max(1, model.width);
  const previewH = Math.min(320, model.height * scale);
  const vscale = previewH / Math.max(1, model.height);

  return (
    <div>
      <h2>{model.title}</h2>
      <div className="muted">
        {Math.round(model.width)} × {Math.round(model.height)} px · {model.elements.length} elements
      </div>

      <div className="preview-frame" style={{ height: previewH }}>
        {model.elements.map((e) => (
          <div
            key={e.id}
            className={`preview-el ${e.role}`}
            title={`${e.name} (${e.figmaType} → ${e.role}${e.chartKind ? ":" + e.chartKind : ""})`}
            style={{
              left: e.rect.x * scale,
              top: e.rect.y * vscale,
              width: Math.max(2, e.rect.w * scale),
              height: Math.max(2, e.rect.h * vscale),
            }}
          >
            {e.role === "text" ? e.text?.split("\n")[0] : e.name}
          </div>
        ))}
      </div>

      {model.palette.length > 0 && (
        <>
          <label>Color palette</label>
          <div className="swatches">
            {model.palette.slice(0, 16).map((hex) => (
              <div key={hex} className="swatch" style={{ background: hex }} title={hex} />
            ))}
          </div>
        </>
      )}

      {model.fonts.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {model.fonts.map((f) => (
            <span key={f} className="chip">
              {f}
            </span>
          ))}
        </div>
      )}

      <label style={{ marginTop: 10 }}>Detected structure</label>
      <table className="map-table">
        <tbody>
          {summarize(model).map(([role, n]) => (
            <tr key={role}>
              <td style={{ textTransform: "capitalize" }}>{role}</td>
              <td style={{ textAlign: "right" }}>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {model.debugTree && (
        <>
          <label style={{ marginTop: 10 }}>Layer tree (diagnostic)</label>
          <pre
            style={{
              fontSize: 10,
              lineHeight: 1.3,
              whiteSpace: "pre",
              overflow: "auto",
              maxHeight: 220,
              background: "#0d1117",
              color: "#c9d1d9",
              padding: 8,
              borderRadius: 6,
              margin: 0,
            }}
          >
            {model.debugTree}
          </pre>
        </>
      )}
    </div>
  );
}

function summarize(model: DashboardModel): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of model.elements) counts.set(e.role, (counts.get(e.role) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
