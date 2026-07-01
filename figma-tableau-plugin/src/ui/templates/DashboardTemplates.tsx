import type { TemplateId, UiToPlugin } from "../../shared/types";

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

interface TemplateDef {
  id: TemplateId;
  label: string;
  desc: string;
  icon: string;
  components: number;
  worksheets: number;
  kpis: number;
  filters: number;
}

const TEMPLATES: TemplateDef[] = [
  {
    id: "clinical",
    label: "Clinical Dashboard",
    desc: "Patient metrics, admissions trend, department breakdown, demographics, and readmission analysis with department/date filters.",
    icon: "🏥",
    components: 12,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
  {
    id: "sales",
    label: "Sales Dashboard",
    desc: "Revenue KPIs, sales trend, regional breakdown, product mix, and forecast with region/product filters.",
    icon: "📊",
    components: 12,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
  {
    id: "finance",
    label: "Finance Dashboard",
    desc: "P&L KPIs, profit/loss trend, category breakdown, budget vs actual, and expense analysis with period/department filters.",
    icon: "💰",
    components: 13,
    worksheets: 4,
    kpis: 5,
    filters: 2,
  },
  {
    id: "executive",
    label: "Executive Dashboard",
    desc: "High-level KPIs, revenue trend, channel performance, regional revenue, market share, and product scorecard.",
    icon: "📈",
    components: 10,
    worksheets: 5,
    kpis: 4,
    filters: 0,
  },
  {
    id: "operations",
    label: "Operations Dashboard",
    desc: "Efficiency KPIs, production trend, downtime analysis, quality metrics, and bottleneck analysis with department/shift filters.",
    icon: "⚙️",
    components: 13,
    worksheets: 4,
    kpis: 5,
    filters: 2,
  },
];

export default function DashboardTemplates() {
  return (
    <div>
      <div className="section-label">Dashboard Templates</div>
      <div className="syntax-intro">
        Pre-built dashboard layouts with KPI cards, worksheets, and filters already positioned.
        Click to create the full dashboard beside your design.
      </div>
      <div className="templates-grid">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="template-card">
            <div className="template-icon">{t.icon}</div>
            <div className="template-label">{t.label}</div>
            <div className="template-desc">{t.desc}</div>
            <div className="template-meta">
              <span>{t.components} components</span>
              <span>{t.worksheets} sheets</span>
              <span>{t.kpis} KPIs</span>
              {t.filters > 0 && <span>{t.filters} filters</span>}
            </div>
            <button
              className="btn-secondary template-apply"
              onClick={() => toPlugin({ type: "apply-template", templateId: t.id })}
            >
              Apply template
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
