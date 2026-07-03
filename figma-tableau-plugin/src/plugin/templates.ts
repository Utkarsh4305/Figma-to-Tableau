// ---------------------------------------------------------------------------
// Dashboard templates: layout definitions, palette, builders, and the
// applyTemplate entry point.
// ---------------------------------------------------------------------------

import { findDashboardFrame, fillCaption, fillKpiRows } from "./builders";
import { loadLabelFont } from "./drop";
import { DOMAIN_ACCENTS } from "../shared/constants";

export interface TChild {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: RGB;
  caption?: string;
  capColor?: RGB;
  radius?: number;
  fontSize?: number;
  label?: string;
  delta?: string;
  deltaColor?: RGB;
}

// Shared template palette (light cards on a dark canvas).
export const T_KPI: RGB = { r: 0.95, g: 0.96, b: 1.0 };
export const T_SH: RGB = { r: 0.93, g: 0.94, b: 0.98 };
export const T_FIL: RGB = { r: 1, g: 1, b: 1 };
export const T_SHCAP: RGB = { r: 0.25, g: 0.28, b: 0.42 };
export const T_VAL: RGB = { r: 0.1, g: 0.12, b: 0.2 };
export const T_UP: RGB = { r: 0.13, g: 0.6, b: 0.35 };
export const T_DOWN: RGB = { r: 0.86, g: 0.15, b: 0.15 };
export const T_BG: RGB = { r: 0.07, g: 0.075, b: 0.085 };
export const T_TITLE: RGB = { r: 0.92, g: 0.93, b: 0.97 };

export const tTitle = (name: string, x: number, y: number, w: number, caption: string): TChild =>
  ({ name, x, y, w, h: 30, fill: T_BG, caption, capColor: T_TITLE, fontSize: 16 });
export const tKpi = (
  name: string, x: number, y: number, w: number, h: number,
  value: string, label: string, delta?: string, deltaColor: RGB = T_UP,
): TChild => ({ name, x, y, w, h, fill: T_KPI, caption: value, capColor: T_VAL, fontSize: h >= 96 ? 30 : 26, label, delta, deltaColor });
export const tSheet = (name: string, x: number, y: number, w: number, h: number, caption: string): TChild =>
  ({ name, x, y, w, h, fill: T_SH, caption, capColor: T_SHCAP });
export const tFilter = (name: string, x: number, y: number, w: number, h: number, caption: string): TChild =>
  ({ name, x, y, w, h, fill: T_FIL, caption, capColor: T_SHCAP, radius: 8 });

const WHITE: RGB = { r: 1, g: 1, b: 1 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };
/** Blend `f` of color `c` into `base` (f=0 → base, f=1 → c). */
export const mix = (c: RGB, base: RGB, f: number): RGB => ({
  r: c.r * f + base.r * (1 - f),
  g: c.g * f + base.g * (1 - f),
  b: c.b * f + base.b * (1 - f),
});

export const TEMPLATES: Record<string, { name: string; w: number; h: number; bg?: RGB; children: TChild[] }> = {
  "clinical": {
    name: "Clinical Dashboard",
    w: 1300, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 520, "Clinical Performance Dashboard"),
      tKpi("KPI/Total Patients", 24, 64, 250, 100, "1,284", "Total Patients", "+4.2% MoM"),
      tKpi("KPI/Readmission Rate", 24, 176, 250, 100, "3.2%", "Readmission Rate", "-0.6% MoM"),
      tKpi("KPI/Avg Length of Stay", 24, 288, 250, 100, "4.7 d", "Avg Length of Stay", "-0.3 d"),
      tKpi("KPI/Bed Occupancy", 24, 400, 250, 100, "87%", "Bed Occupancy", "+2 pts"),
      tFilter("FILTER/Department", 24, 512, 250, 44, "Department \u25BE"),
      tFilter("FILTER/Month", 24, 568, 250, 44, "Month \u25BE"),
      tSheet("SHEET/Admissions Trend[line]", 298, 64, 978, 280, "Admissions Trend"),
      tSheet("SHEET/Admissions by Department[bar]", 298, 360, 478, 200, "Admissions by Department"),
      tSheet("SHEET/Patient Mix[pie]", 792, 360, 484, 200, "Patient Mix"),
      tSheet("SHEET/Readmissions vs Admissions[scatter]", 298, 576, 978, 224, "Readmissions vs Admissions"),
    ],
  },
  "sales": {
    name: "Sales Dashboard",
    w: 1280, h: 800,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Sales Performance Dashboard"),
      tFilter("FILTER/Region", 944, 22, 150, 36, "Region \u25BE"),
      tFilter("FILTER/Month", 1106, 22, 150, 36, "Month \u25BE"),
      tKpi("KPI/Revenue", 24, 74, 290, 90, "$2.4M", "Revenue", "+12.5% YoY"),
      tKpi("KPI/Growth", 330, 74, 290, 90, "+12.5%", "Growth", "vs last year"),
      tKpi("KPI/Orders", 636, 74, 290, 90, "8,432", "Orders", "+6.1%"),
      tKpi("KPI/Conversion", 942, 74, 290, 90, "3.8%", "Conversion", "+0.4 pts"),
      tSheet("SHEET/Sales Trend[area]", 24, 176, 860, 320, "Sales Trend"),
      tSheet("SHEET/Sales by Region[bar]", 900, 176, 356, 320, "Sales by Region"),
      tSheet("SHEET/Product Mix[pie]", 24, 508, 396, 272, "Product Mix"),
      tSheet("SHEET/Orders by Region[bar]", 436, 508, 396, 272, "Orders by Region"),
      tSheet("SHEET/Revenue Forecast[area]", 848, 508, 408, 272, "Revenue Forecast"),
    ],
  },
  "finance": {
    name: "Finance Dashboard",
    w: 1260, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Financial Overview Dashboard"),
      tFilter("FILTER/Quarter", 980, 22, 130, 36, "Quarter \u25BE"),
      tFilter("FILTER/Category", 1122, 22, 114, 36, "Category \u25BE"),
      tKpi("KPI/Revenue", 24, 74, 232, 88, "$8.2M", "Revenue", "+9% YoY"),
      tKpi("KPI/Expenses", 268, 74, 232, 88, "$5.1M", "Expenses", "+4% YoY", T_DOWN),
      tKpi("KPI/Net Income", 512, 74, 232, 88, "$3.1M", "Net Income", "+18% YoY"),
      tKpi("KPI/Margin", 756, 74, 232, 88, "37.8%", "Margin", "+2.1 pts"),
      tKpi("KPI/Cash Flow", 1000, 74, 236, 88, "$1.2M", "Cash Flow", "+0.3M"),
      tSheet("SHEET/Revenue & Expense Trend[line]", 24, 174, 596, 330, "Revenue & Expense Trend"),
      tSheet("SHEET/Budget vs Actual[bar]", 24, 520, 596, 320, "Budget vs Actual"),
      tSheet("SHEET/Revenue by Category[bar]", 640, 174, 596, 330, "Revenue by Category"),
      tSheet("SHEET/Expense Breakdown[pie]", 640, 520, 596, 320, "Expense Breakdown"),
    ],
  },
  "executive": {
    name: "Executive Dashboard",
    w: 1280, h: 780,
    children: [
      tTitle("TEXT/Title", 24, 20, 420, "Executive Overview"),
      tSheet("SHEET/Revenue Trend[line]", 24, 60, 1232, 256, "Revenue Trend"),
      tKpi("KPI/Total Revenue", 24, 336, 296, 100, "$24.8M", "Total Revenue", "+18.3% YoY"),
      tKpi("KPI/YoY Growth", 332, 336, 296, 100, "+18.3%", "YoY Growth", "vs last year"),
      tKpi("KPI/Active Users", 640, 336, 296, 100, "42.5K", "Active Users", "+9.7%"),
      tKpi("KPI/NPS Score", 948, 336, 296, 100, "72", "NPS Score", "+5 pts"),
      tSheet("SHEET/Revenue by Channel[bar]", 24, 452, 396, 308, "Revenue by Channel"),
      tSheet("SHEET/Market Share[pie]", 436, 452, 396, 308, "Market Share"),
      tSheet("SHEET/Channel Scorecard[table]", 848, 452, 408, 308, "Channel Scorecard"),
    ],
  },
  "operations": {
    name: "Operations Dashboard",
    w: 1320, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 420, "Operations Monitoring"),
      tFilter("FILTER/Department", 1050, 22, 128, 36, "Department \u25BE"),
      tFilter("FILTER/Week", 1190, 22, 106, 36, "Week \u25BE"),
      tKpi("KPI/Efficiency", 24, 74, 244, 88, "94.2%", "Efficiency", "+1.3%"),
      tKpi("KPI/Downtime", 280, 74, 244, 88, "2.1 h", "Downtime", "-0.4 h"),
      tKpi("KPI/Throughput", 536, 74, 244, 88, "1,842", "Throughput", "+3.5%"),
      tKpi("KPI/Quality Score", 792, 74, 244, 88, "98.5%", "Quality Score", "+0.2%"),
      tKpi("KPI/On-Time Rate", 1048, 74, 248, 88, "96%", "On-Time Rate", "+1 pt"),
      tSheet("SHEET/Production Trend[line]", 24, 174, 870, 300, "Production Trend"),
      tSheet("SHEET/Downtime by Cause[bar]", 910, 174, 386, 300, "Downtime by Cause"),
      tSheet("SHEET/Quality Metrics[heatmap]", 24, 490, 410, 340, "Quality Metrics"),
      tSheet("SHEET/Bottleneck Analysis[scatter]", 450, 490, 430, 340, "Bottleneck Analysis"),
      tSheet("SHEET/Output by Department[bar]", 896, 490, 400, 340, "Output by Department"),
    ],
  },
  "marketing": {
    name: "Marketing Dashboard",
    w: 1300, h: 840,
    children: [
      tTitle("TEXT/Title", 24, 20, 480, "Marketing Campaign Performance"),
      tFilter("FILTER/Channel", 1000, 22, 130, 36, "Channel ▾"),
      tFilter("FILTER/Week", 1142, 22, 134, 36, "Week ▾"),
      tKpi("KPI/Leads", 24, 74, 296, 92, "18.2K", "Leads (MQLs)", "+14% WoW"),
      tKpi("KPI/CTR", 336, 74, 296, 92, "3.6%", "Click-Through", "+0.5 pts"),
      tKpi("KPI/CAC", 648, 74, 296, 92, "$42", "Cost per Lead", "-$6 WoW"),
      tKpi("KPI/ROAS", 960, 74, 296, 92, "4.8x", "Return on Ad Spend", "+0.4x"),
      tSheet("SHEET/Conversion Funnel[bar]", 24, 182, 420, 634, "Conversion Funnel"),
      tSheet("SHEET/Leads Trend[area]", 468, 182, 390, 302, "Leads Trend"),
      tSheet("SHEET/Leads by Channel[bar]", 874, 182, 402, 302, "Leads by Channel"),
      tSheet("SHEET/Channel Mix[pie]", 468, 500, 390, 316, "Channel Mix"),
      tSheet("SHEET/Conversions vs Leads[scatter]", 874, 500, 402, 316, "Conversions vs Leads"),
    ],
  },
  "hr": {
    name: "HR Dashboard",
    w: 1300, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 520, "People & Workforce Analytics"),
      tSheet("SHEET/Headcount Trend[line]", 24, 64, 978, 280, "Headcount Trend"),
      tSheet("SHEET/Attrition by Department[bar]", 24, 360, 478, 200, "Attrition by Department"),
      tSheet("SHEET/Workforce Mix[pie]", 518, 360, 484, 200, "Workforce Mix"),
      tSheet("SHEET/Headcount by Department[bar]", 24, 576, 978, 224, "Headcount by Department"),
      tKpi("KPI/Headcount", 1026, 64, 250, 100, "1,204", "Headcount", "+38 MoM"),
      tKpi("KPI/Attrition", 1026, 176, 250, 100, "7.2%", "Attrition Rate", "-0.8% MoM"),
      tKpi("KPI/Time to Hire", 1026, 288, 250, 100, "28 d", "Time to Hire", "-3 d"),
      tKpi("KPI/eNPS", 1026, 400, 250, 100, "41", "Employee NPS", "+6 pts"),
      tFilter("FILTER/Department", 1026, 512, 250, 44, "Department ▾"),
      tFilter("FILTER/Month", 1026, 568, 250, 44, "Month ▾"),
    ],
  },
  "supplychain": {
    name: "Supply Chain Dashboard",
    w: 1280, h: 880,
    children: [
      tTitle("TEXT/Title", 24, 20, 480, "Supply Chain & Logistics"),
      tFilter("FILTER/Warehouse", 1004, 22, 130, 36, "Warehouse ▾"),
      tFilter("FILTER/Week", 1146, 22, 110, 36, "Week ▾"),
      tKpi("KPI/Shipments", 24, 74, 296, 90, "42.1K", "Shipments", "+5.2% WoW"),
      tKpi("KPI/On-Time", 336, 74, 296, 90, "94.6%", "On-Time Delivery", "+1.1%"),
      tKpi("KPI/Backorders", 648, 74, 296, 90, "312", "Backorders", "-48 WoW"),
      tKpi("KPI/Inventory Turns", 960, 74, 296, 90, "8.4", "Inventory Turns", "+0.3"),
      tSheet("SHEET/Shipments Trend[line]", 24, 180, 1232, 250, "Shipments Trend"),
      tSheet("SHEET/On-Time by Warehouse[bar]", 24, 446, 1232, 200, "On-Time by Warehouse"),
      tSheet("SHEET/Shipments by Warehouse[bar]", 24, 662, 396, 194, "Shipments by Warehouse"),
      tSheet("SHEET/Backorder Mix[pie]", 436, 662, 396, 194, "Backorder Mix"),
      tSheet("SHEET/Backorders vs Shipments[scatter]", 848, 662, 408, 194, "Backorders vs Shipments"),
    ],
  },
  "support": {
    name: "Customer Support Dashboard",
    w: 1280, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Customer Support Performance"),
      tFilter("FILTER/Channel", 1000, 22, 130, 36, "Channel ▾"),
      tFilter("FILTER/Week", 1142, 22, 114, 36, "Week ▾"),
      tSheet("SHEET/Tickets Trend[line]", 24, 70, 610, 300, "Tickets Trend"),
      tSheet("SHEET/Tickets by Channel[bar]", 650, 70, 606, 300, "Tickets by Channel"),
      tSheet("SHEET/Resolved vs Open[bar]", 24, 386, 610, 300, "Resolved vs Open"),
      tSheet("SHEET/Channel Mix[pie]", 650, 386, 606, 300, "Channel Mix"),
      tKpi("KPI/Tickets", 24, 702, 232, 134, "6,842", "Tickets", "+3.1% WoW"),
      tKpi("KPI/CSAT", 268, 702, 232, 134, "4.6", "CSAT (of 5)", "+0.2"),
      tKpi("KPI/First Response", 512, 702, 232, 134, "1.2 h", "First Response", "-0.3 h"),
      tKpi("KPI/Resolution", 756, 702, 232, 134, "8.4 h", "Resolution Time", "-1.1 h"),
      tKpi("KPI/SLA", 1000, 702, 256, 134, "97%", "SLA Met", "+2 pts"),
    ],
  },
  "product": {
    name: "Product Analytics Dashboard",
    w: 1280, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Product Analytics"),
      tSheet("SHEET/Active Users Trend[area]", 24, 64, 820, 300, "Active Users Trend"),
      tSheet("SHEET/Feature Adoption Mix[pie]", 860, 64, 396, 300, "Feature Adoption Mix"),
      tKpi("KPI/DAU", 24, 380, 296, 96, "42.5K", "Daily Active Users", "+8.3% WoW"),
      tKpi("KPI/Retention", 332, 380, 296, 96, "68%", "30-Day Retention", "+2 pts"),
      tKpi("KPI/Sessions", 640, 380, 296, 96, "128K", "Sessions", "+11%"),
      tKpi("KPI/Churn", 948, 380, 296, 96, "3.1%", "Churn Rate", "-0.4 pts"),
      tSheet("SHEET/Usage by Feature[bar]", 24, 492, 610, 304, "Usage by Feature"),
      tSheet("SHEET/Sessions vs Users[scatter]", 650, 492, 606, 304, "Sessions vs Users"),
    ],
  },
  "itops": {
    name: "IT Operations Dashboard",
    w: 1320, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "IT Operations & Reliability"),
      tFilter("FILTER/Service", 1044, 22, 140, 36, "Service ▾"),
      tFilter("FILTER/Day", 1196, 22, 100, 36, "Day ▾"),
      tSheet("SHEET/Service Health[heatmap]", 24, 74, 420, 742, "Service Health"),
      tKpi("KPI/Uptime", 468, 74, 400, 100, "99.95%", "Uptime", "+0.02%"),
      tKpi("KPI/Requests", 884, 74, 412, 100, "48.2M", "Requests / day", "+6.1%"),
      tKpi("KPI/Error Rate", 468, 186, 400, 100, "0.12%", "Error Rate", "-0.03 pts"),
      tKpi("KPI/Latency", 884, 186, 412, 100, "142 ms", "p95 Latency", "-8 ms"),
      tSheet("SHEET/Requests Trend[line]", 468, 302, 828, 250, "Requests Trend"),
      tSheet("SHEET/Errors by Service[bar]", 468, 568, 406, 248, "Errors by Service"),
      tSheet("SHEET/Errors vs Requests[scatter]", 890, 568, 406, 248, "Errors vs Requests"),
    ],
  },
  "manufacturing": {
    name: "Manufacturing Dashboard",
    w: 1320, h: 860,
    children: [
      tTitle("TEXT/Title", 24, 20, 460, "Manufacturing & Production"),
      tFilter("FILTER/Line", 1044, 22, 140, 36, "Line ▾"),
      tFilter("FILTER/Week", 1196, 22, 100, 36, "Week ▾"),
      tKpi("KPI/OEE", 24, 74, 300, 90, "82.4%", "OEE", "+1.6%"),
      tKpi("KPI/Units", 336, 74, 300, 90, "94.2K", "Units Produced", "+4.1% WoW"),
      tKpi("KPI/Defect Rate", 648, 74, 300, 90, "1.8%", "Defect Rate", "-0.3 pts"),
      tKpi("KPI/Yield", 960, 74, 300, 90, "96.5%", "First-Pass Yield", "+0.7%"),
      tSheet("SHEET/Output Trend[line]", 24, 180, 420, 310, "Output Trend"),
      tSheet("SHEET/Units by Line[bar]", 460, 180, 424, 310, "Units by Line"),
      tSheet("SHEET/Yield by Line[bar]", 24, 506, 420, 310, "Yield by Line"),
      tSheet("SHEET/Defects vs Units[scatter]", 460, 506, 424, 310, "Defects vs Units"),
      tSheet("SHEET/Defect Heatmap[heatmap]", 900, 180, 396, 636, "Defect Heatmap"),
    ],
  },
  "retail": {
    name: "Retail Dashboard",
    w: 1280, h: 840,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Retail & E-commerce Overview"),
      tFilter("FILTER/Category", 978, 22, 140, 36, "Category ▾"),
      tFilter("FILTER/Month", 1130, 22, 126, 36, "Month ▾"),
      tKpi("KPI/Revenue", 24, 74, 296, 92, "$4.8M", "Revenue", "+9.4% MoM"),
      tKpi("KPI/AOV", 336, 74, 296, 92, "$68", "Avg Order Value", "+$4"),
      tKpi("KPI/Conversion", 648, 74, 296, 92, "3.1%", "Checkout Conversion", "+0.3 pts"),
      tKpi("KPI/Returns", 960, 74, 296, 92, "4.2%", "Return Rate", "-0.5 pts"),
      tSheet("SHEET/Revenue Trend[area]", 24, 182, 800, 330, "Revenue Trend"),
      tSheet("SHEET/Units by Category[bar]", 24, 528, 800, 288, "Units by Category"),
      tSheet("SHEET/Category Mix[pie]", 840, 182, 416, 240, "Category Mix"),
      tSheet("SHEET/Revenue by Category[bar]", 840, 438, 416, 180, "Revenue by Category"),
      tSheet("SHEET/Units vs Revenue[scatter]", 840, 634, 416, 182, "Units vs Revenue"),
    ],
  },
  "project": {
    name: "Project Management Dashboard",
    w: 1300, h: 840,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "Project Delivery & Velocity"),
      tFilter("FILTER/Team", 1020, 22, 120, 36, "Team ▾"),
      tFilter("FILTER/Sprint", 1152, 22, 124, 36, "Sprint ▾"),
      tKpi("KPI/Velocity", 24, 74, 404, 96, "48", "Velocity (pts)", "+5 pts"),
      tSheet("SHEET/Completed Trend[line]", 24, 186, 404, 630, "Completed by Sprint"),
      tKpi("KPI/Open", 452, 74, 404, 96, "74", "Open Items", "-11"),
      tSheet("SHEET/Open by Team[bar]", 452, 186, 404, 630, "Open Items by Team"),
      tKpi("KPI/On-Track", 880, 74, 396, 96, "86%", "On-Track", "+4 pts"),
      tSheet("SHEET/Status Mix[pie]", 880, 186, 396, 630, "Status Mix"),
    ],
  },
  "esg": {
    name: "ESG Dashboard",
    w: 1280, h: 820,
    children: [
      tTitle("TEXT/Title", 24, 20, 500, "ESG & Sustainability"),
      tFilter("FILTER/Facility", 1000, 22, 130, 36, "Facility ▾"),
      tFilter("FILTER/Quarter", 1142, 22, 114, 36, "Quarter ▾"),
      tSheet("SHEET/Energy Mix[pie]", 24, 74, 500, 452, "Energy Mix"),
      tKpi("KPI/Emissions", 24, 542, 242, 122, "12.4K t", "CO₂ Emissions", "-6.2% YoY"),
      tKpi("KPI/Renewable", 282, 542, 242, 122, "58%", "Renewable Energy", "+7 pts"),
      tKpi("KPI/Water", 24, 680, 242, 116, "-9%", "Water Intensity", "vs baseline"),
      tKpi("KPI/Diversion", 282, 680, 242, 116, "74%", "Waste Diversion", "+5 pts"),
      tSheet("SHEET/Emissions Trend[line]", 548, 74, 708, 350, "Emissions Trend"),
      tSheet("SHEET/Emissions by Facility[bar]", 548, 440, 708, 170, "Emissions by Facility"),
      tSheet("SHEET/Renewable by Facility[bar]", 548, 626, 708, 170, "Renewable by Facility"),
    ],
  },
};

/** The template's field accent as a Figma RGB. Template ids match the
 * DOMAIN_ACCENTS keys except "operations" (the domain key is "ops"). */
export function templateAccent(templateId: string): RGB | undefined {
  const hex = DOMAIN_ACCENTS[templateId === "operations" ? "ops" : templateId];
  if (!hex) return undefined;
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

/**
 * A guaranteed-EMPTY page position for a new dashboard: just past the
 * rightmost top-level node on the page (nothing extends beyond it, so the spot
 * can never overlap an existing design), top-aligned with the selected
 * dashboard frame when there is one (else with the topmost node).
 */
export function emptyPlacement(): { x: number; y: number } {
  const nodes = figma.currentPage.children;
  if (!nodes.length) return { x: 0, y: 0 };
  const frame = findDashboardFrame();
  let maxRight = -Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    maxRight = Math.max(maxRight, n.x + n.width);
    minY = Math.min(minY, n.y);
  }
  return { x: Math.ceil(maxRight + 160), y: Math.round(frame ? frame.y : minY) };
}

export async function applyTemplate(templateId: string): Promise<void> {
  const font = await loadLabelFont();
  const t = TEMPLATES[templateId];
  if (!t) return;
  const accent = templateAccent(templateId);

  const pal = accent
    ? {
        bg: mix(accent, BLACK, 0.6),
        sheet: mix(accent, WHITE, 0.07),
        kpi: mix(accent, WHITE, 0.12),
        stroke: mix(accent, WHITE, 0.35),
      }
    : undefined;

  const spot = emptyPlacement();

  const dash = figma.createFrame();
  dash.name = t.name;
  dash.resize(t.w, t.h);
  dash.x = spot.x;
  dash.y = spot.y;
  dash.cornerRadius = 10;
  dash.fills = [{ type: "SOLID", color: pal ? pal.bg : T_BG }];

  for (const c of t.children) {
    const child = figma.createFrame();
    child.name = c.name;
    child.resize(c.w, c.h);
    child.x = c.x;
    child.y = c.y;
    child.cornerRadius = c.radius ?? 10;
    const fill =
      pal && c.fill === T_SH ? pal.sheet
      : pal && c.fill === T_KPI ? pal.kpi
      : pal && c.fill === T_BG ? pal.bg
      : c.fill;
    child.fills = [{ type: "SOLID", color: fill }];
    if (c.name.startsWith("SHEET/") || c.name.startsWith("URL/") || c.name.startsWith("Image/") || c.name.startsWith("FILTER/")) {
      child.strokes = [{ type: "SOLID", color: pal ? pal.stroke : { r: 0.78, g: 0.8, b: 0.9 } }];
      child.strokeWeight = 1;
    }
    if (font && (c.caption || c.label)) {
      const fontSize = c.fontSize ?? 14;
      const color = c.capColor ?? { r: 0.25, g: 0.28, b: 0.42 };
      if (c.name.startsWith("KPI/") && c.label) {
        const rows: Array<{ text: string; size: number; color: RGB }> = [
          { text: c.label, size: 13, color: { r: 0.4, g: 0.43, b: 0.55 } },
          { text: c.caption ?? "", size: fontSize, color: accent ?? color },
        ];
        if (c.delta) rows.push({ text: c.delta, size: 12, color: c.deltaColor ?? T_UP });
        fillKpiRows(child, font, rows);
      } else if (c.name.startsWith("KPI/") || c.name.startsWith("TEXT/")) {
        fillCaption(child, font, c.caption ?? "", fontSize, color, 10, 10);
      } else {
        const txt = figma.createText();
        txt.fontName = font;
        txt.characters = c.caption ?? "";
        txt.fontSize = fontSize;
        const capCol = accent && c.name.startsWith("SHEET/") ? accent : color;
        txt.fills = [{ type: "SOLID", color: capCol }];
        child.appendChild(txt);
        txt.x = 10;
        txt.y = Math.max(6, (c.h - txt.height) / 2);
      }
    }
    dash.appendChild(child);
  }

  figma.currentPage.appendChild(dash);
  figma.currentPage.selection = [dash];
  figma.viewport.scrollAndZoomIntoView([dash]);
  figma.notify(`Created "${t.name}" (${t.children.length} components) in empty space beside your designs.`);
}
