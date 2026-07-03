// ---------------------------------------------------------------------------
// domainData.ts — domain-flavored placeholder datasets
// ---------------------------------------------------------------------------

import type { SpecField } from "../shared/spec";
import type { FaithfulModel } from "../shared/types";
import { DOMAIN_KEYWORDS, DOMAIN_ACCENTS } from "../shared/constants";

export function sampleData(): { fields: SpecField[]; rows: string[][] } {
  const fields: SpecField[] = [
    { name: "Region", type: "string", role: "dimension" },
    { name: "Period", type: "string", role: "dimension" },
    { name: "Sales", type: "integer", role: "measure" },
    { name: "Profit", type: "integer", role: "measure" },
  ];
  const regions: [string, number][] = [["West", 1.0], ["East", 0.92], ["Central", 0.66], ["South", 0.5]];
  const periodVal = [9, 14, 20, 11, 17, 23, 15, 21, 27, 18, 24, 30];
  const years = [2021, 2022, 2023];
  const rows: string[][] = [];
  for (const [rname, rmul] of regions) {
    let pi = 0;
    for (const y of years) {
      for (let q = 1; q <= 4; q++) {
        const pv = periodVal[pi++];
        const sales = Math.round(rmul * pv * 2400);
        const profit = Math.round(sales * (0.18 + 0.04 * rmul));
        rows.push([rname, `${y} Q${q}`, String(sales), String(profit)]);
      }
    }
  }
  return { fields, rows };
}

export interface DomainDataset {
  fields: SpecField[];
  rows: string[][];
  catDim: string;
  trendDim: string;
  meas: [string, string];
  accent?: string;
}

export const DOMAIN_DATASETS: Record<
  string,
  {
    catDim: string;
    cats: [string, number][];
    trendDim: string;
    periods: string[];
    meas: [string, string];
    scale: number;
    ratio: number;
  }
> = {
  clinical: {
    catDim: "Department",
    cats: [["Cardiology", 1.0], ["Oncology", 0.82], ["Neurology", 0.7], ["Emergency", 0.95], ["Pediatrics", 0.6]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Admissions", "Readmissions"],
    scale: 220,
    ratio: 0.08,
  },
  sales: {
    catDim: "Region",
    cats: [["North", 1.0], ["South", 0.72], ["East", 0.9], ["West", 0.63]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Revenue", "Orders"],
    scale: 48000,
    ratio: 0.015,
  },
  finance: {
    catDim: "Category",
    cats: [["Operations", 1.0], ["Marketing", 0.55], ["R&D", 0.78], ["Sales", 0.92], ["Admin", 0.4]],
    trendDim: "Quarter",
    periods: ["2022 Q1", "2022 Q2", "2022 Q3", "2022 Q4", "2023 Q1", "2023 Q2", "2023 Q3", "2023 Q4"],
    meas: ["Revenue", "Expense"],
    scale: 120000,
    ratio: 0.62,
  },
  ops: {
    catDim: "Department",
    cats: [["Assembly", 1.0], ["Packaging", 0.85], ["Molding", 0.7], ["Finishing", 0.6]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Output", "Downtime"],
    scale: 1500,
    ratio: 0.05,
  },
  executive: {
    catDim: "Channel",
    cats: [["Direct", 1.0], ["Online", 0.9], ["Partner", 0.62], ["Retail", 0.75]],
    trendDim: "Quarter",
    periods: ["2022 Q1", "2022 Q2", "2022 Q3", "2022 Q4", "2023 Q1", "2023 Q2", "2023 Q3", "2023 Q4"],
    meas: ["Revenue", "Growth"],
    scale: 90000,
    ratio: 0.04,
  },
  marketing: {
    catDim: "Channel",
    cats: [["Email", 1.0], ["Social", 0.85], ["Search", 0.95], ["Display", 0.55], ["Referral", 0.45]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Leads", "Conversions"],
    scale: 820,
    ratio: 0.14,
  },
  hr: {
    catDim: "Department",
    cats: [["Engineering", 1.0], ["Sales", 0.8], ["Marketing", 0.5], ["Support", 0.65], ["Operations", 0.72]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Headcount", "Attrition"],
    scale: 140,
    ratio: 0.07,
  },
  supplychain: {
    catDim: "Warehouse",
    cats: [["North DC", 1.0], ["South DC", 0.8], ["East DC", 0.9], ["West DC", 0.68]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Shipments", "Backorders"],
    scale: 1300,
    ratio: 0.06,
  },
  support: {
    catDim: "Channel",
    cats: [["Email", 1.0], ["Chat", 0.9], ["Phone", 0.72], ["Social", 0.48]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Tickets", "Resolved"],
    scale: 640,
    ratio: 0.88,
  },
  product: {
    catDim: "Feature",
    cats: [["Dashboards", 1.0], ["Reports", 0.82], ["Search", 0.7], ["Mobile", 0.6], ["API", 0.5]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Active Users", "Sessions"],
    scale: 5200,
    ratio: 2.4,
  },
  itops: {
    catDim: "Service",
    cats: [["API", 1.0], ["Web", 0.9], ["Database", 0.72], ["Auth", 0.6], ["CDN", 0.82]],
    trendDim: "Day",
    periods: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    meas: ["Requests", "Errors"],
    scale: 9200,
    ratio: 0.02,
  },
  manufacturing: {
    catDim: "Line",
    cats: [["Line 1", 1.0], ["Line 2", 0.86], ["Line 3", 0.7], ["Line 4", 0.6]],
    trendDim: "Week",
    periods: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"],
    meas: ["Units", "Defects"],
    scale: 2100,
    ratio: 0.03,
  },
  retail: {
    catDim: "Category",
    cats: [["Apparel", 1.0], ["Electronics", 0.92], ["Home", 0.72], ["Beauty", 0.6], ["Grocery", 0.85]],
    trendDim: "Month",
    periods: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    meas: ["Revenue", "Units"],
    scale: 52000,
    ratio: 0.02,
  },
  project: {
    catDim: "Team",
    cats: [["Alpha", 1.0], ["Beta", 0.82], ["Gamma", 0.7], ["Delta", 0.6]],
    trendDim: "Sprint",
    periods: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"],
    meas: ["Completed", "Open"],
    scale: 48,
    ratio: 0.42,
  },
  esg: {
    catDim: "Facility",
    cats: [["Plant A", 1.0], ["Plant B", 0.8], ["Plant C", 0.62], ["HQ Office", 0.4]],
    trendDim: "Quarter",
    periods: ["2022 Q1", "2022 Q2", "2022 Q3", "2022 Q4", "2023 Q1", "2023 Q2", "2023 Q3", "2023 Q4"],
    meas: ["Emissions", "Renewable"],
    scale: 900,
    ratio: 0.55,
  },
};

export function buildDomainDataset(cfg: (typeof DOMAIN_DATASETS)[string]): DomainDataset {
  const fields: SpecField[] = [
    { name: cfg.catDim, type: "string", role: "dimension" },
    { name: cfg.trendDim, type: "string", role: "dimension" },
    { name: cfg.meas[0], type: "integer", role: "measure" },
    { name: cfg.meas[1], type: "integer", role: "measure" },
  ];
  const n = cfg.periods.length;
  const rows: string[][] = [];
  for (const [cname, cmul] of cfg.cats) {
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const trend = 0.6 + 0.8 * t + 0.15 * Math.sin(i * 1.7);
      const m0 = Math.max(1, Math.round(cmul * trend * cfg.scale));
      const m1 = Math.max(1, Math.round(m0 * cfg.ratio * (0.9 + 0.2 * cmul)));
      rows.push([cname, cfg.periods[i], String(m0), String(m1)]);
    }
  }
  return { fields, rows, catDim: cfg.catDim, trendDim: cfg.trendDim, meas: cfg.meas };
}

export function domainLabel(domain: string): string {
  const map: Record<string, string> = {
    clinical: "Clinical", sales: "Sales", finance: "Finance", ops: "Operations",
    executive: "Executive", marketing: "Marketing", hr: "HR", supplychain: "Supply Chain",
    support: "Customer Support", product: "Product Analytics", itops: "IT Operations",
    manufacturing: "Manufacturing", retail: "Retail", project: "Project Management",
    esg: "ESG", generic: "Sample",
  };
  return map[domain] ?? "Sample";
}

export function domainDatasetFor(domain: string): DomainDataset {
  const cfg = DOMAIN_DATASETS[domain];
  if (!cfg) {
    const { fields, rows } = sampleData();
    return { fields, rows, catDim: "Region", trendDim: "Period", meas: ["Sales", "Profit"] };
  }
  const ds = buildDomainDataset(cfg);
  ds.accent = DOMAIN_ACCENTS[domain];
  return ds;
}

export function detectFaithfulDomain(models: FaithfulModel[]): string {
  const hay = models
    .map((m) => (m.title || "") + " " + m.zones.map((z) => `${z.name || ""} ${z.sheetName || ""} ${z.text || ""}`).join(" "))
    .join(" ")
    .toLowerCase();
  for (const { domain, words } of DOMAIN_KEYWORDS) if (words.some((w) => hay.includes(w))) return domain;
  return "generic";
}
