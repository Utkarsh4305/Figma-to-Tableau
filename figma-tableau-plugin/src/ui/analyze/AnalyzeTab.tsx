import { useEffect, useState } from "react";
import type { DetectionResult, PluginToUi, UiToPlugin } from "../../shared/types";
import MappingPanel from "./MappingPanel";

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

export default function AnalyzeTab() {
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginToUi | undefined;
      if (!msg) return;
      if (msg.type === "detection-ready") {
        setLoading(false);
        if (msg.error) {
          setError(msg.error);
          return;
        }
        setError(null);
        setResults(msg.results);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const analyze = () => {
    setLoading(true);
    setError(null);
    toPlugin({ type: "request-analyze" });
  };

  const handleOverride = (nodeId: string, detectedType: string) => {
    toPlugin({ type: "override-type", nodeId, detectedType });
    setResults((prev) =>
      prev.map((r) =>
        r.id === nodeId ? { ...r, detectedType, confidence: 1, reasons: ["User override"] } : r
      )
    );
  };

  return (
    <div>
      <div className="section-label">Dashboard Analyzer</div>
      <div className="syntax-intro">
        Detect chart types, KPI cards, filters, and layout regions from your Figma design.
        Click a detected type to override it. Corrections are saved as metadata.
      </div>

      <button
        className="btn-primary analyze-btn"
        disabled={loading}
        onClick={analyze}
      >
        {loading ? <><span className="spinner" /> Analyzing…</> : "Analyze dashboard"}
      </button>

      {error && <div className="error-card" style={{ marginTop: 12 }}>{error}</div>}

      {results.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <MappingPanel results={results} onOverride={handleOverride} />
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-sub">
            Select a dashboard frame and click "Analyze dashboard" to detect components.
          </div>
        </div>
      )}
    </div>
  );
}
