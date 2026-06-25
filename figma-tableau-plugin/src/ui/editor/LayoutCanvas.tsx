import { useEffect, useRef, useState } from "react";
import type { DashboardSpec, ZoneSpec } from "../../shared/spec";

// Visual, drag-and-drop wireframing surface for the dashboard. Zones render as
// scaled rectangles you can drag to move, resize from the bottom-right handle,
// and click to select. All edits flow back into the same ZoneSpec the number
// inputs use — this is pure UI, it never touches the .twb generator.

const GRID = 8; // snap step, in dashboard px
const CANVAS_W = 388; // usable width inside the 12px panel padding

const KIND_BG: Record<ZoneSpec["kind"], string> = {
  sheet: "rgba(37, 99, 235, 0.16)",
  filter: "rgba(245, 158, 11, 0.18)",
  text: "rgba(0, 0, 0, 0.05)",
  button: "rgba(16, 185, 129, 0.18)",
  image: "rgba(168, 85, 247, 0.16)",
  rect: "rgba(100, 116, 139, 0.14)",
};
const KIND_BORDER: Record<ZoneSpec["kind"], string> = {
  sheet: "#2563eb",
  filter: "#d97706",
  text: "#9ca3af",
  button: "#059669",
  image: "#9333ea",
  rect: "#64748b",
};

type Drag =
  | { mode: "move"; id: string; px: number; py: number; ox: number; oy: number }
  | { mode: "resize"; id: string; px: number; py: number; ow: number; oh: number };

const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const SHEET_MIME = "application/x-tab-sheet";

export default function LayoutCanvas({
  dash,
  selectedId,
  onSelect,
  onChange,
  onDropSheet,
}: {
  dash: DashboardSpec;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<ZoneSpec>) => void;
  onDropSheet?: (name: string, x: number, y: number) => void;
}) {
  const scale = CANVAS_W / Math.max(1, dash.widthPx);
  const canvasH = Math.max(80, dash.heightPx * scale);
  const drag = useRef<Drag | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const [, force] = useState(0); // re-render on drag for the live readout

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const z = dash.zones.find((x) => x.id === d.id);
      if (!z) return;
      const dx = (e.clientX - d.px) / scale;
      const dy = (e.clientY - d.py) / scale;
      if (d.mode === "move") {
        const nx = clamp(snap(d.ox + dx), 0, dash.widthPx - z.w);
        const ny = clamp(snap(d.oy + dy), 0, dash.heightPx - z.h);
        onChange(d.id, { x: nx, y: ny });
      } else {
        const nw = clamp(snap(d.ow + dx), GRID * 2, dash.widthPx - z.x);
        const nh = clamp(snap(d.oh + dy), GRID * 2, dash.heightPx - z.y);
        onChange(d.id, { w: nw, h: nh });
      }
      force((n) => n + 1);
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dash, scale, onChange]);

  const startMove = (e: React.PointerEvent, z: ZoneSpec) => {
    e.stopPropagation();
    onSelect(z.id);
    drag.current = { mode: "move", id: z.id, px: e.clientX, py: e.clientY, ox: z.x, oy: z.y };
  };
  const startResize = (e: React.PointerEvent, z: ZoneSpec) => {
    e.stopPropagation();
    onSelect(z.id);
    drag.current = { mode: "resize", id: z.id, px: e.clientX, py: e.clientY, ow: z.w, oh: z.h };
  };

  const label = (z: ZoneSpec): string => {
    if (z.kind === "sheet") return z.worksheet ?? "(sheet)";
    if (z.kind === "filter") return `▾ ${z.field ?? "filter"}`;
    return z.text || z.kind;
  };

  const sel = dash.zones.find((z) => z.id === selectedId) ?? null;

  return (
    <div>
      <div
        ref={canvasRef}
        className={`lc-canvas ${dropping ? "dropping" : ""}`}
        style={{ width: CANVAS_W, height: canvasH, background: dash.bg }}
        onPointerDown={() => onSelect(null)}
        onDragOver={(e) => {
          if (!onDropSheet) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          setDropping(false);
          if (!onDropSheet) return;
          const name = e.dataTransfer.getData(SHEET_MIME);
          if (!name) return;
          e.preventDefault();
          const r = canvasRef.current!.getBoundingClientRect();
          const x = snap(clamp((e.clientX - r.left) / scale, 0, dash.widthPx));
          const y = snap(clamp((e.clientY - r.top) / scale, 0, dash.heightPx));
          onDropSheet(name, x, y);
        }}
      >
        {dash.zones.map((z) => {
          const isSel = z.id === selectedId;
          return (
            <div
              key={z.id}
              className={`lc-zone ${isSel ? "sel" : ""}`}
              onPointerDown={(e) => startMove(e, z)}
              style={{
                left: z.x * scale,
                top: z.y * scale,
                width: Math.max(4, z.w * scale),
                height: Math.max(4, z.h * scale),
                background: z.kind === "text" || z.kind === "button" ? z.bg || KIND_BG[z.kind] : KIND_BG[z.kind],
                borderColor: isSel ? "var(--accent)" : KIND_BORDER[z.kind],
                color: z.fg || "#101828",
              }}
              title={`${z.kind} · ${z.w}×${z.h} @ ${z.x},${z.y}`}
            >
              <span className="lc-label">{label(z)}</span>
              {isSel && <span className="lc-handle" onPointerDown={(e) => startResize(e, z)} />}
            </div>
          );
        })}
      </div>
      <div className="lc-readout muted">
        {sel
          ? `${sel.kind}  ·  ${sel.w}×${sel.h}  @  ${sel.x}, ${sel.y}`
          : `${dash.widthPx}×${dash.heightPx} canvas · ${dash.zones.length} zone(s) · drag to move, corner to resize`}
      </div>
    </div>
  );
}
