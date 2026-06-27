import type { DashboardModel } from "../shared/types";

export default function DashboardPreview({ model }: { model: DashboardModel }) {
  return (
    <div className="frame-card">
      <div className="frame-info">
        <div className="frame-name" title={model.title}>{model.title}</div>
        <div className="frame-meta">
          {Math.round(model.width)} × {Math.round(model.height)} · {model.elements.length} layers
        </div>
      </div>
      <div className="frame-dot" />
    </div>
  );
}
