import { useState, type ReactNode } from "react";
import type { TemplateId, UiToPlugin } from "../../shared/types";
import { svgProps as sharedSvgProps } from "../icons";

function toPlugin(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

type IconName =
  | "clinical" | "sales" | "finance" | "executive" | "operations"
  | "marketing" | "hr" | "supplychain" | "support" | "product"
  | "itops" | "manufacturing" | "retail" | "project" | "esg";

const svgProps = sharedSvgProps(24);

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
  // Marketing — megaphone
  marketing: (
    <svg {...svgProps}>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l7 4V6l-7 4H4a1 1 0 0 0-1 1z" />
      <path d="M18 8a4 4 0 0 1 0 8" />
    </svg>
  ),
  // HR — people
  hr: (
    <svg {...svgProps}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M17 8a3 3 0 0 1 0 6M21 20v-1a4 4 0 0 0-3-3.8" />
    </svg>
  ),
  // Supply chain — truck
  supplychain: (
    <svg {...svgProps}>
      <rect x="2" y="7" width="11" height="9" rx="1" />
      <path d="M13 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  ),
  // Customer support — headset
  support: (
    <svg {...svgProps}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.2" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.2" />
      <path d="M20 19a4 4 0 0 1-4 3h-3" />
    </svg>
  ),
  // Product analytics — layers
  product: (
    <svg {...svgProps}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  ),
  // IT operations — server stack
  itops: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  ),
  // Manufacturing — factory
  manufacturing: (
    <svg {...svgProps}>
      <path d="M3 21V10l6 4V10l6 4V6h6v15z" />
      <path d="M7 21v-4M12 21v-4M17 21v-4" />
    </svg>
  ),
  // Retail / e-commerce — shopping bag
  retail: (
    <svg {...svgProps}>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  ),
  // Project management — kanban / checklist
  project: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="7" height="16" rx="1.2" />
      <rect x="14" y="4" width="7" height="10" rx="1.2" />
    </svg>
  ),
  // ESG / sustainability — leaf
  esg: (
    <svg {...svgProps}>
      <path d="M4 20c0-8 6-14 16-14 0 10-6 14-14 14" />
      <path d="M4 20c2-5 6-8 11-9" />
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
    desc: "Left rail of patient KPIs beside an admissions trend, admissions by department, patient mix, and a readmissions-vs-admissions scatter. Department + month filters.",
    icon: "clinical",
    components: 11,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
  {
    id: "sales",
    label: "Sales Dashboard",
    desc: "A hero sales trend with a region rail, then product mix, orders by region, and a revenue forecast. Four revenue KPIs with region/month filters.",
    icon: "sales",
    components: 12,
    worksheets: 5,
    kpis: 4,
    filters: 2,
  },
  {
    id: "finance",
    label: "Finance Dashboard",
    desc: "Two-column P&L: revenue/expense trend and budget-vs-actual on the left, revenue by category and expense breakdown on the right, under a five-KPI strip.",
    icon: "finance",
    components: 12,
    worksheets: 4,
    kpis: 5,
    filters: 2,
  },
  {
    id: "executive",
    label: "Executive Dashboard",
    desc: "A full-width revenue-trend hero, four leadership KPIs, then revenue by channel, market share, and a channel scorecard table.",
    icon: "executive",
    components: 9,
    worksheets: 4,
    kpis: 4,
    filters: 0,
  },
  {
    id: "operations",
    label: "Operations Dashboard",
    desc: "Monitoring grid: production trend and downtime by cause, then a quality heatmap, bottleneck scatter, and output-by-department bar. Department/week filters.",
    icon: "operations",
    components: 13,
    worksheets: 5,
    kpis: 5,
    filters: 2,
  },
  {
    id: "marketing",
    label: "Marketing Dashboard",
    desc: "Funnel tower: a tall conversion funnel fills the left column, with a 2×2 grid of leads trend, channel bars, channel mix and a conversions scatter beside it. Campaign KPIs on top.",
    icon: "marketing",
    components: 12,
    worksheets: 5,
    kpis: 4,
    filters: 2,
  },
  {
    id: "hr",
    label: "HR / People Dashboard",
    desc: "Right sidebar: charts fill the left (headcount trend, attrition, workforce mix, department bars) with a rail of people KPIs and filters down the right.",
    icon: "hr",
    components: 11,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
  {
    id: "supplychain",
    label: "Supply Chain Dashboard",
    desc: "Stacked bands: two full-width flow charts (shipments trend, then on-time by warehouse) over a 3-up detail row of warehouse bars, backorder mix and a scatter.",
    icon: "supplychain",
    components: 12,
    worksheets: 5,
    kpis: 4,
    filters: 2,
  },
  {
    id: "support",
    label: "Customer Support Dashboard",
    desc: "Quadrant: four equal service-desk charts in a 2×2 (tickets trend, channel bars, resolved-vs-open, channel mix) with five KPIs as a summary strip along the bottom.",
    icon: "support",
    components: 12,
    worksheets: 4,
    kpis: 5,
    filters: 2,
  },
  {
    id: "product",
    label: "Product Analytics Dashboard",
    desc: "Split hero: a wide active-users trend beside a tall adoption pie, growth KPIs through the middle, then usage-by-feature and a sessions scatter below.",
    icon: "product",
    components: 9,
    worksheets: 4,
    kpis: 4,
    filters: 0,
  },
  {
    id: "itops",
    label: "IT Operations Dashboard",
    desc: "Status board: a tall service-health heatmap owns the left rail; beside it a 2×2 reliability KPI block, the requests trend, and error charts.",
    icon: "itops",
    components: 11,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
  {
    id: "manufacturing",
    label: "Manufacturing Dashboard",
    desc: "Shop floor: KPI strip, a 2×2 of production charts on the left, and a tall defect heatmap running down the right rail.",
    icon: "manufacturing",
    components: 12,
    worksheets: 5,
    kpis: 4,
    filters: 2,
  },
  {
    id: "retail",
    label: "Retail / E-commerce Dashboard",
    desc: "Asymmetric columns: a wide storefront column (revenue trend + units by category) beside a narrow merchandising column (category mix, revenue bars, basket scatter).",
    icon: "retail",
    components: 12,
    worksheets: 5,
    kpis: 4,
    filters: 2,
  },
  {
    id: "project",
    label: "Project Management Dashboard",
    desc: "Kanban lanes: three equal delivery columns — velocity over the burn-up trend, open items over the team bars, on-track over the status mix.",
    icon: "project",
    components: 9,
    worksheets: 3,
    kpis: 3,
    filters: 2,
  },
  {
    id: "esg",
    label: "ESG / Sustainability Dashboard",
    desc: "Mix spotlight: a big energy-mix pie with a 2×2 impact KPI block beneath it, and stacked emissions charts (trend + facility bars) on the right.",
    icon: "esg",
    components: 11,
    worksheets: 4,
    kpis: 4,
    filters: 2,
  },
];

export default function DashboardTemplates() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? TEMPLATES.filter((t) => `${t.label} ${t.desc}`.toLowerCase().includes(q))
    : TEMPLATES;

  return (
    <div>
      <div className="section-label">Dashboard Templates</div>
      <div className="syntax-intro">
        Pre-built dashboard layouts with KPI cards, worksheets, and filters already positioned.
        Apply one to create the full dashboard beside your design.
      </div>
      <input
        type="text"
        className="template-search"
        placeholder={`Search ${TEMPLATES.length} templates…`}
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="templates-grid">
        {shown.map((t) => (
          <div key={t.id} className="template-card">
            <div className="template-head">
              <div className="template-icon">{ICONS[t.icon]}</div>
              <div className="template-headinfo">
                <div className="template-label">{t.label}</div>
                <div className="template-meta-line">
                  {t.worksheets} sheets · {t.kpis} KPIs
                  {t.filters > 0 ? ` · ${t.filters} filters` : ""}
                </div>
              </div>
              <button
                className="btn-secondary template-apply-sm"
                onClick={() => toPlugin({ type: "apply-template", templateId: t.id })}
              >
                Apply
              </button>
            </div>
            <div className="template-desc" title={t.desc}>{t.desc}</div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="template-none">
            No template matches “{query}” — try “sales”, “ops” or “KPI”.
          </div>
        )}
      </div>
    </div>
  );
}
