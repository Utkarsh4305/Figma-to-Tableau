import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// In `npm run dev` (browser, no Figma) mock the sandbox so the UI is testable.
// IMPORTANT: install the mock BEFORE rendering, so its message listener is
// attached before <App> mounts and posts `request-parse` (otherwise the reply
// is missed and the UI hangs on "Reading your Figma selection…").
function showFatal(msg: string) {
  // If anything below throws, never leave a blank white iframe — show why.
  const el = document.getElementById("root");
  if (el)
    el.innerHTML =
      '<div style="padding:16px;font:12px/1.5 system-ui;color:#b42318">' +
      "<b>Plugin UI failed to start</b><br/>" +
      msg.replace(/</g, "&lt;") +
      "</div>";
}

async function start() {
  if ((import.meta as any).env?.DEV) {
    const mock = await import("./devMock");
    mock.installDevSandbox();
  }
  const container = document.getElementById("root");
  if (!container) {
    showFatal("Missing #root element.");
    return;
  }
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

window.addEventListener("error", (e) => showFatal(String(e.message || e.error)));
start().catch((e) => showFatal(String((e as Error)?.stack || e)));
