// ---------------------------------------------------------------------------
// devMock.ts — DEV ONLY. Lets you run the UI in a plain browser (npm run dev)
// without Figma. It impersonates the Figma sandbox: when the UI posts
// `request-parse`, it replies with a sample DashboardModel via window.message
// (in a browser tab `parent === window`, so the UI's own listener receives it).
// This file is never loaded in the real plugin (main.tsx guards on import.meta.env.DEV).
// ---------------------------------------------------------------------------

import type { DashboardModel } from "../shared/types";

function color(hex: string) {
  return { r: 0, g: 0, b: 0, a: 1, hex };
}

const SAMPLE: DashboardModel = {
  title: "Clinical Trial Dashboard",
  width: 1280,
  height: 800,
  background: color("#F4F5FB"),
  palette: ["#2563EB", "#10B981", "#F59E0B", "#FFFFFF", "#101828"],
  fonts: ["Inter"],
  elements: [
    { id: "1", name: "Dashboard Title", figmaType: "TEXT", rect: { x: 40, y: 24, w: 600, h: 40 }, role: "text", text: "Clinical Trial Dashboard", fontSize: 24, bold: true, fill: color("#101828") },
    { id: "2", name: "Filter Panel", figmaType: "FRAME", rect: { x: 40, y: 80, w: 1200, h: 48 }, role: "filter", fill: color("#FFFFFF") },
    { id: "3", name: "Enrolled KPI", figmaType: "FRAME", rect: { x: 40, y: 140, w: 280, h: 110 }, role: "kpi", chartKind: "kpi", text: "1,248", fill: color("#FFFFFF") },
    { id: "4", name: "Active Sites KPI", figmaType: "FRAME", rect: { x: 340, y: 140, w: 280, h: 110 }, role: "kpi", chartKind: "kpi", text: "37", fill: color("#FFFFFF") },
    { id: "5", name: "Screen Failures KPI", figmaType: "FRAME", rect: { x: 640, y: 140, w: 280, h: 110 }, role: "kpi", chartKind: "kpi", text: "82", fill: color("#FFFFFF") },
    { id: "6", name: "Enrollment by Site", figmaType: "FRAME", rect: { x: 40, y: 270, w: 580, h: 480 }, role: "worksheet", chartKind: "bar", fill: color("#FFFFFF") },
    { id: "7", name: "Enrollment Trend", figmaType: "FRAME", rect: { x: 660, y: 270, w: 580, h: 480 }, role: "worksheet", chartKind: "line", fill: color("#FFFFFF") },
  ],
};

export function installDevSandbox(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === "request-parse") {
      // reply the way the Figma sandbox would
      window.postMessage({ pluginMessage: { type: "model-ready", model: SAMPLE } }, "*");
    } else if (msg.type === "notify") {
      // eslint-disable-next-line no-console
      console.log("[figma.notify]", msg.message);
    }
    // "resize" is ignored in the browser
  });
  // eslint-disable-next-line no-console
  console.log("[devMock] Figma sandbox mocked — sample dashboard loaded.");
}
