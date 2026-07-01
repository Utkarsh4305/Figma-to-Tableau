import { useState } from "react";
import type { DetectionResult } from "../../shared/types";

interface MappingPanelProps {
  results: DetectionResult[];
  onOverride: (nodeId: string, detectedType: string) => void;
}

const TYPE_OPTIONS = [
  "kpi-card", "bar-chart", "line-chart", "pie-chart", "area-chart",
  "scatter-plot", "heatmap", "table", "filter", "header", "sidebar",
  "footer", "navigation", "container", "text-label", "image", "legend",
  "parameter", "web-object", "worksheet", "unknown",
];

function confidenceColor(c: number): string {
  if (c >= 0.7) return "var(--green)";
  if (c >= 0.4) return "var(--amber)";
  return "var(--red)";
}

function ResultRow({ r, onOverride }: { r: DetectionResult; onOverride: (id: string, type: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [overrideType, setOverrideType] = useState(r.detectedType);

  return (
    <div className="mapping-row">
      <div className="mapping-left">
        <div className="mapping-name">{r.name}</div>
        <div className="mapping-meta">
          <span className="mapping-type-cell">
            {editing ? (
              <select
                value={overrideType}
                onChange={(e) => setOverrideType(e.target.value)}
                onBlur={() => { onOverride(r.id, overrideType); setEditing(false); }}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <span
                className="mapping-type-label"
                style={{ color: confidenceColor(r.confidence) }}
                onClick={() => { setOverrideType(r.detectedType); setEditing(true); }}
              >
                {r.detectedType}
              </span>
            )}
          </span>
          <span className="mapping-confidence">{Math.round(r.confidence * 100)}%</span>
          <span className="mapping-role">{r.elementRole}</span>
        </div>
        {r.reasons.length > 0 && (
          <div className="mapping-reasons">
            {r.reasons.map((reason, i) => (
              <span key={i} className="mapping-reason">{reason}</span>
            ))}
          </div>
        )}
      </div>
      <div className="mapping-right">
        <div className="mapping-tableau">{r.mappedTableauType}</div>
      </div>
    </div>
  );
}

export default function MappingPanel({ results, onOverride }: MappingPanelProps) {
  const [filter, setFilter] = useState<string>("");
  const filtered = filter
    ? results.filter((r) =>
        r.name.toLowerCase().includes(filter.toLowerCase()) ||
        r.detectedType.toLowerCase().includes(filter.toLowerCase())
      )
    : results;

  const avgConfidence = results.length > 0
    ? results.reduce((s, r) => s + r.confidence, 0) / results.length
    : 0;
  const highConf = results.filter((r) => r.confidence >= 0.7).length;
  const lowConf = results.filter((r) => r.confidence < 0.4).length;

  return (
    <div className="mapping-panel">
      <div className="mapping-stats">
        <span>{results.length} elements</span>
        <span>Avg {Math.round(avgConfidence * 100)}% confidence</span>
        <span style={{ color: "var(--green)" }}>{highConf} high</span>
        {lowConf > 0 && <span style={{ color: "var(--red)" }}>{lowConf} low</span>}
      </div>
      <input
        type="text"
        placeholder="Filter layers…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mapping-filter"
      />
      <div className="mapping-list">
        {filtered.map((r) => (
          <ResultRow key={r.id} r={r} onOverride={onOverride} />
        ))}
        {filtered.length === 0 && (
          <div className="empty-sub" style={{ padding: 20, textAlign: "center" }}>
            No matching layers.
          </div>
        )}
      </div>
    </div>
  );
}
