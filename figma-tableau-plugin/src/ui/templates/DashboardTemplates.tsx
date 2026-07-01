import type { ReactNode } from "react";
import type { TemplateId, UiToPlugin } from "../../shared/types";

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

type IconName = "clinical" | "sales" | "finance" | "executive" | "operations";

const svgProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<IconName, ReactNode> = {
  // Clinical — activity / vitals pulse
  clinical: (
    <svg {...svgProps}>
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </svg>
  ),
  // Sales — bar chart
  sales: (
    <svg {...svgProps}>
      <path d="M3 21h18" />
      <rect x="5" y="12" width="3.5" height="6" rx="0.5" />
      <rect x="10.25" y="8" width="3.5" height="10" rx="0.5" />
      <rect x="15.5" y="4" width="3.5" height="14" rx="0.5" />
    </svg>
  ),
  // Finance — dollar in circle
  finance: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 8.5a3 3 0 0 0-3-1.5c-1.66 0-3 .9-3 2.25S10.34 11.5 12 11.5s3 .9 3 2.25S13.66 16 12 16a3 3 0 0 1-3-1.5" />
      <path d="M12 5.5v13" />
    </svg>
  ),
  // Executive — trending up line
  executive: (
    <svg {...svgProps}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </svg>
  ),
  // Operations — gear
  operations: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
    </svg>
  ),
};

interface TemplateDef {
  id: TemplateId;
  label: string;
  desc: string;
  icon: IconName;
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
    icon: "clinical",
    components: 12,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
  {
    id: "sales",
    label: "Sales Dashboard",
    desc: "Revenue KPIs, sales trend, regional breakdown, product mix, and forecast with region/product filters.",
    icon: "sales",
    components: 12,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
  {
    id: "finance",
    label: "Finance Dashboard",
    desc: "P&L KPIs, profit/loss trend, category breakdown, budget vs actual, and expense analysis with period/department filters.",
    icon: "finance",
    components: 13,
    worksheets: 4,
    kpis: 5,
    filters: 2,
  },
  {
    id: "executive",
    label: "Executive Dashboard",
    desc: "High-level KPIs, revenue trend, channel performance, regional revenue, market share, and product scorecard.",
    icon: "executive",
    components: 10,
    worksheets: 5,
    kpis: 4,
    filters: 0,
  },
  {
    id: "operations",
    label: "Operations Dashboard",
    desc: "Efficiency KPIs, production trend, downtime analysis, quality metrics, and bottleneck analysis with department/shift filters.",
    icon: "operations",
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
            <div className="template-icon">{ICONS[t.icon]}</div>
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
