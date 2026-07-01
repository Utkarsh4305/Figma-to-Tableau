import type { LibraryComponentId, UiToPlugin } from "../../shared/types";

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

interface ComponentDef {
  id: LibraryComponentId;
  category: string;
  label: string;
  desc: string;
  icon: string;
}

const COMPONENTS: ComponentDef[] = [
  // Worksheets
  { id: "worksheet",   category: "Worksheets", label: "Blank Worksheet",   desc: "Empty SHEET/ placeholder for any bar chart",    icon: "▯" },
  { id: "bar-chart",   category: "Worksheets", label: "Bar Chart",         desc: "SHEET/ with [bar] type tag for bar marks",     icon: "▮" },
  { id: "line-chart",  category: "Worksheets", label: "Line Chart",        desc: "SHEET/ with [line] tag for line marks",        icon: "╱" },
  { id: "area-chart",  category: "Worksheets", label: "Area Chart",        desc: "SHEET/ with [area] tag for area marks",        icon: "▬" },
  { id: "pie-chart",   category: "Worksheets", label: "Pie Chart",         desc: "SHEET/ with [pie] tag for pie marks",          icon: "◉" },
  { id: "scatter-plot",category: "Worksheets", label: "Scatter Plot",      desc: "SHEET/ with [scatter] tag for circle marks",   icon: "⦿" },
  { id: "heatmap",     category: "Worksheets", label: "Heatmap",           desc: "SHEET/ with [heatmap] tag for square marks",   icon: "▣" },
  { id: "table",       category: "Worksheets", label: "Table",             desc: "SHEET/ with [table] tag for a text table",     icon: "⊞" },
  // KPIs
  { id: "kpi-large",   category: "KPIs",       label: "KPI (Large)",       desc: "Large KPI/ metric card for big numbers",       icon: "𝟭𝟮𝟯" },
  { id: "kpi-small",   category: "KPIs",       label: "KPI (Small)",       desc: "Compact KPI/ card for secondary metrics",      icon: "%" },
  // Controls
  { id: "filter",      category: "Controls",   label: "Filter Card",       desc: "FILTER/ quick-filter for a dimension",         icon: "☰" },
  { id: "nav-button",  category: "Controls",   label: "Nav Button",        desc: "Nav/ button — wire a prototype link",          icon: "▸" },
  { id: "named-button",category: "Controls",   label: "Named Button",      desc: "BUTTON/Label > Target — nav button to a named dashboard", icon: "⧉" },
  // Elements
  { id: "text-box",    category: "Elements",   label: "Text Box",          desc: "TEXT/ layer for heading or body text",         icon: "T" },
  { id: "image-placeholder", category: "Elements", label: "Image Placeholder", desc: "Image/ placeholder for logos or icons",        icon: "🖼" },
  { id: "web-object",  category: "Elements",   label: "Web Page Object",   desc: "URL/ layer embeds a web page in the dashboard",icon: "🌐" },
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
                <span className="library-icon">{c.icon}</span>
                <span className="library-label">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
