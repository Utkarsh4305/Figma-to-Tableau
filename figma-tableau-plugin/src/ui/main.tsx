import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

function showFatal(msg: string) {
  const el = document.getElementById("root");
  if (el)
    el.innerHTML =
      '<div style="padding:16px;font:12px/1.5 system-ui;color:#b42318">' +
      "<b>Plugin UI failed to start</b><br/>" +
      msg.replace(/</g, "&lt;") +
      "</div>";
}

const container = document.getElementById("root");
if (!container) {
  showFatal("Missing #root element.");
} else {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
