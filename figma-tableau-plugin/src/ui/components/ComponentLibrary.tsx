import type { ReactNode } from "react";
import type { LibraryComponentId, UiToPlugin } from "../../shared/types";

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

const svgProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<LibraryComponentId, ReactNode> = {
  // ── Worksheets
  worksheet: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" strokeDasharray="3 3" />
    </svg>
  ),
  "bar-chart": (
    <svg {...svgProps}>
      <path d="M3 21h18" />
      <rect x="5" y="12" width="3.5" height="6" rx="0.5" />
      <rect x="10.25" y="8" width="3.5" height="10" rx="0.5" />
      <rect x="15.5" y="4" width="3.5" height="14" rx="0.5" />
    </svg>
  ),
  "line-chart": (
    <svg {...svgProps}>
      <path d="M3 3v18h18" />
      <path d="M6 15l4-4 3 2 5-6" />
    </svg>
  ),
  "area-chart": (
    <svg {...svgProps}>
      <path d="M3 3v18h18" />
      <path d="M6 16l4-4 3 2 5-6v8H6z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  ),
  "pie-chart": (
    <svg {...svgProps}>
      <path d="M21.2 15.9A10 10 0 1 1 8 2.8" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  "scatter-plot": (
    <svg {...svgProps}>
      <path d="M3 3v18h18" />
      <circle cx="8" cy="15" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  heatmap: (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      <rect x="3.5" y="9.5" width="5" height="5" fill="currentColor" fillOpacity="0.45" stroke="none" />
      <rect x="15.5" y="3.5" width="5" height="5" fill="currentColor" fillOpacity="0.25" stroke="none" />
    </svg>
  ),
  table: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9h18M3 14.5h18M9 9v11" />
    </svg>
  ),
  // ── KPIs
  "kpi-large": (
    <svg {...svgProps}>
      <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
    </svg>
  ),
  "kpi-small": (
    <svg {...svgProps}>
      <path d="M19 5L5 19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  ),
  // ── Controls
  filter: (
    <svg {...svgProps}>
      <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
    </svg>
  ),
  "nav-button": (
    <svg {...svgProps}>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M9 12h6M13 9l3 3-3 3" />
    </svg>
  ),
  "named-button": (
    <svg {...svgProps}>
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  ),
  // ── Elements
  "text-box": (
    <svg {...svgProps}>
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  ),
  "image-placeholder": (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  "web-object": (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </svg>
  ),
};

interface ComponentDef {
  id: LibraryComponentId;
  category: string;
  label: string;
  desc: string;
}

const COMPONENTS: ComponentDef[] = [
  // Worksheets
  { id: "worksheet",   category: "Worksheets", label: "Blank Worksheet",   desc: "Empty SHEET/ placeholder for any bar chart" },
  { id: "bar-chart",   category: "Worksheets", label: "Bar Chart",         desc: "SHEET/ with [bar] type tag for bar marks" },
  { id: "line-chart",  category: "Worksheets", label: "Line Chart",        desc: "SHEET/ with [line] tag for line marks" },
  { id: "area-chart",  category: "Worksheets", label: "Area Chart",        desc: "SHEET/ with [area] tag for area marks" },
  { id: "pie-chart",   category: "Worksheets", label: "Pie Chart",         desc: "SHEET/ with [pie] tag for pie marks" },
  { id: "scatter-plot",category: "Worksheets", label: "Scatter Plot",      desc: "SHEET/ with [scatter] tag for circle marks" },
  { id: "heatmap",     category: "Worksheets", label: "Heatmap",           desc: "SHEET/ with [heatmap] tag for square marks" },
  { id: "table",       category: "Worksheets", label: "Table",             desc: "SHEET/ with [table] tag for a text table" },
  // KPIs
  { id: "kpi-large",   category: "KPIs",       label: "KPI (Large)",       desc: "Large KPI/ metric card for big numbers" },
  { id: "kpi-small",   category: "KPIs",       label: "KPI (Small)",       desc: "Compact KPI/ card for secondary metrics" },
  // Controls
  { id: "filter",      category: "Controls",   label: "Filter Card",       desc: "FILTER/ quick-filter for a dimension" },
  { id: "nav-button",  category: "Controls",   label: "Nav Button",        desc: "Nav/ button — wire a prototype link" },
  { id: "named-button",category: "Controls",   label: "Named Button",      desc: "BUTTON/Label > Target — nav button to a named dashboard" },
  // Elements
  { id: "text-box",    category: "Elements",   label: "Text Box",          desc: "TEXT/ layer for heading or body text" },
  { id: "image-placeholder", category: "Elements", label: "Image Placeholder", desc: "Image/ placeholder for logos or icons" },
  { id: "web-object",  category: "Elements",   label: "Web Page Object",   desc: "URL/ layer embeds a web page in the dashboard" },
];

export default function ComponentLibrary() {
  const categories = [...new Set(COMPONENTS.map((c) => c.category))];

  return (
    <div>
      <div className="section-label">Component Library</div>
      <div className="syntax-intro">
        Pre-built components with correct naming conventions. Click to insert beside
        your dashboard, or drag one straight onto the canvas.
      </div>
      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>{cat}</div>
          <div className="library-grid">
            {COMPONENTS.filter((c) => c.category === cat).map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                className="library-card"
                draggable
                onDragStart={(e) => {
                  // Setting data is what lets the browser actually START the drag.
                  e.dataTransfer.setData(
                    "text/plain",
                    JSON.stringify({ ftDrop: true, source: "library", id: c.id })
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={(e) => {
                  // Drags that START in the plugin UI don't reach Figma's canvas
                  // drop handler via native dataTransfer — you must post a special
                  // `pluginDrop` message on dragend. Figma maps clientX/clientY to
                  // the canvas and fires figma.on("drop") (only if dropped OUTSIDE
                  // the UI iframe, i.e. on the canvas).
                  parent.postMessage(
                    {
                      pluginDrop: {
                        clientX: e.clientX,
                        clientY: e.clientY,
                        items: [
                          {
                            type: "text/plain",
                            data: JSON.stringify({ ftDrop: true, source: "library", id: c.id }),
                          },
                        ],
                      },
                    },
                    "*"
                  );
                }}
                onClick={() => toPlugin({ type: "insert-library-component", componentId: c.id })}
                title={c.desc}
              >
                <span className="library-icon">{ICONS[c.id]}</span>
                <span className="library-label">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
