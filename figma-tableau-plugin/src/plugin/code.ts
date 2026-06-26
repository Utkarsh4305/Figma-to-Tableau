// ---------------------------------------------------------------------------
// code.ts — the Figma plugin main thread (sandbox). Has the `figma` global,
// no DOM. Opens the UI, parses the selection into a DashboardModel, and posts
// it to the UI. All Tableau generation / zipping / downloading happens in the
// UI iframe (which has Blob + JSZip + FileSaver).
// ---------------------------------------------------------------------------

import { parseSelection, attachImages, applyAutoTags } from "./parser";
import { parseFaithful, attachFaithfulImages } from "./faithful";
import type { UiToPlugin, PluginToUi } from "../shared/types";
import { UI_SIZE } from "../shared/constants";

figma.showUI(__html__, { width: UI_SIZE.width, height: UI_SIZE.height, themeColors: true });

function post(msg: PluginToUi): void {
  figma.ui.postMessage(msg);
}

async function parseAndSend(): Promise<void> {
  try {
    const model = parseSelection();
    // Rasterizing logos is best-effort: a failure must not block the model.
    try {
      await attachImages(model);
    } catch {
      /* images just won't render as bitmaps */
    }
    post({ type: "model-ready", model });
  } catch (e) {
    post({ type: "model-ready", model: null, error: (e as Error).message });
  }
}

// Rename detected layers with SHEET//KPI/… prefixes, then re-parse so the UI
// reflects the now-explicit classification.
async function applyTagsAndResend(): Promise<void> {
  try {
    const n = await applyAutoTags();
    figma.notify(n ? `Tagged ${n} layer(s) — re-reading…` : "Nothing new to tag.");
    await parseAndSend();
  } catch (e) {
    post({ type: "model-ready", model: null, error: (e as Error).message });
  }
}

// Faithful transpile: recreate the whole frame as native zones, rasterizing
// icons/vectors. Best-effort images must not block the model.
async function sendFaithful(): Promise<void> {
  try {
    const model = parseFaithful();
    try {
      await attachFaithfulImages(model);
    } catch {
      /* some images just won't render */
    }
    post({ type: "faithful-ready", model });
  } catch (e) {
    post({ type: "faithful-ready", model: null, error: (e as Error).message });
  }
}

// Re-parse whenever the user changes their selection.
figma.on("selectionchange", () => void parseAndSend());

figma.ui.onmessage = (msg: UiToPlugin) => {
  switch (msg.type) {
    case "request-parse":
      void parseAndSend();
      break;
    case "apply-tags":
      void applyTagsAndResend();
      break;
    case "request-faithful":
      void sendFaithful();
      break;
    case "resize":
      figma.ui.resize(Math.max(360, msg.width), Math.max(420, msg.height));
      break;
    case "notify":
      figma.notify(msg.message);
      break;
  }
};

// Initial parse on launch.
void parseAndSend();
