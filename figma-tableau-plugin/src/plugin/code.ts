// ---------------------------------------------------------------------------
// code.ts — the Figma plugin main thread (sandbox). Has the `figma` global,
// no DOM. Opens the UI, parses the selection into a DashboardModel, and posts
// it to the UI. All Tableau generation / zipping / downloading happens in the
// UI iframe (which has Blob + JSZip + FileSaver).
// ---------------------------------------------------------------------------

import { parseSelection, attachImages, applyAutoTags } from "./parser";
import { parseFaithfulAll, attachFaithfulImages, expandNavTargets, collectFrames, attachBackgroundImage, buildImageOnlyModel } from "./faithful";
import type { UiToPlugin } from "../shared/types";
import { UI_SIZE } from "../shared/constants";
import { findDashboardFrame } from "./builders";
import { insertLibraryComponent, insertDefault } from "./insert";
import { handleDrop, loadLabelFont } from "./drop";
import { restoreImport, sendAccountInfo, logExport, saveUiState, restoreUiState, clearImport, exportAllowed, setPremium } from "./persistence";
import { FREE_EXPORT_LIMIT, PREMIUM_PRICE_LABEL } from "../shared/constants";
import { applyTemplate } from "./templates";
import { post } from "./messaging";

figma.showUI(__html__, { width: UI_SIZE.width, height: UI_SIZE.height });

async function parseAndSend(): Promise<void> {
  try {
    const model = parseSelection();
    // Rasterizing logos is best-effort: a failure must not block the model.
    try {
      await attachImages(model);
    } catch (e) {
      console.warn("attachImages failed (best-effort):", e);
    }
    // Every selected frame becomes its own Tableau dashboard on export — tell
    // the UI their names so the Selection card can reflect the real export scope.
    let frameNames: string[] | undefined;
    try {
      frameNames = collectFrames().map((f) => f.name || "Frame");
    } catch (e) {
      console.warn("collectFrames failed (best-effort):", e);
    }
    post({ type: "model-ready", model, frameNames });
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

// Faithful transpile: recreate every SELECTED frame as native zones (one Tableau
// dashboard each), rasterizing icons/vectors. Best-effort images must not block
// the models.
// When `options.exportMode === "image"`, the entire frame is rasterized as a
// single background PNG — no interactive zones, no worksheets, just the design.
async function sendFaithful(options?: { includeBackground?: boolean; exportMode?: string }): Promise<void> {
  try {
    // Image-only mode: rasterize each frame as a single PNG — no parsing.
    if (options?.exportMode === "image") {
      const frames = collectFrames();
      if (frames.length === 0) throw new Error("Select one or more frames to export as an image.");
      const models = [];
      for (const f of frames) {
        const m = await buildImageOnlyModel(f);
        models.push(m);
      }
      post({ type: "faithful-ready", models });
      return;
    }

    // dynamic-page docs: make sure every page (and its nodes' prototype reactions
    // + the frames those navigate to) is loaded before we read interactions.
    try {
      await figma.loadAllPagesAsync();
    } catch (e) {
      console.warn("loadAllPagesAsync failed (best-effort):", e);
    }
    // Pull in any Nav/ interaction destinations the user didn't select (so the
    // navigation has a real worksheet/dashboard to land on), THEN rasterize.
    let models = parseFaithfulAll();
    try {
      models = await expandNavTargets(models);
    } catch (e) {
      console.warn("expandNavTargets failed (best-effort):", e);
    }
    for (const m of models) {
      try {
        await attachFaithfulImages(m);
      } catch (e) {
        console.warn("attachFaithfulImages failed (best-effort):", e);
      }
    }
    // Background image: rasterize the entire frame as a background PNG behind
    // all other zones (captures gradients/complex fills). Only called for the
    // ORIGINAL user-selected models (not Nav/ auto-included destinations).
    if (options?.includeBackground) {
      const frames = collectFrames();
      for (let i = 0; i < Math.min(models.length, frames.length); i++) {
        try {
          await attachBackgroundImage(models[i], frames[i]);
        } catch (e) {
          console.warn("attachBackgroundImage failed (best-effort):", e);
        }
      }
    }
    post({ type: "faithful-ready", models });
  } catch (e) {
    post({ type: "faithful-ready", models: null, error: (e as Error).message });
  }
}

// Warm the font cache at startup so drag-and-drop can build labelled frames
// synchronously (see preloadedLabelFont).
void loadLabelFont();

/**
 * Create one `SHEET/<name>` placeholder frame per chosen imported worksheet,
 * placed INSIDE the dashboard frame in a tidy grid BELOW the existing content
 * (the frame is grown taller to fit). Inside-the-frame is what makes them export:
 * they're children of the dashboard, so the faithful walk picks them up and each
 * swaps in its real imported sheet. Below the content means they never overlap
 * the design — the user drags each up into place (or leaves it; it still exports).
 * The dashboard frame stays SELECTED so the very next export includes them.
 * Skips any `SHEET/<name>` already present so re-clicking is safe. With no
 * dashboard frame we fall back to dropping them on the page.
 */
async function addSheets(names: string[]): Promise<void> {
  const frame = findDashboardFrame();
  // Host = the dashboard frame itself (so the sheets are its children and export);
  // only fall back to the page when there's no frame at all.
  const host: BaseNode & ChildrenMixin =
    frame && "appendChild" in frame ? (frame as unknown as BaseNode & ChildrenMixin) : figma.currentPage;
  const inFrame = host === (frame as unknown);

  // Skip names already present among the host's direct SHEET/ children.
  const existing = new Set(
    ("children" in host ? host.children : [])
      .map((c) => c.name)
      .filter((n) => /^\s*sheet\s*\//i.test(n))
      .map((n) => n.replace(/^\s*sheet\s*\/\s*/i, "").trim().toLowerCase())
  );
  const todo = names.filter((n) => !existing.has(n.trim().toLowerCase()));
  if (todo.length === 0) {
    figma.notify("Those sheets are already on your dashboard.");
    return;
  }

  const font = await loadLabelFont();
  const SW = 360, SH = 240, GAP = 24, COLS = 2;
  // Inside the frame: a grid starting just below the current content (frame-
  // relative coords). On the page fallback: just right of the frame.
  const baseX = inFrame ? GAP : frame ? frame.x + frame.width + 80 : 0;
  const baseY = inFrame ? (frame ? frame.height + GAP : GAP) : frame ? frame.y : 0;
  const created: SceneNode[] = [];
  todo.forEach((name, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const f = figma.createFrame();
    f.name = `SHEET/${name}`;
    f.resize(SW, SH);
    f.x = baseX + col * (SW + GAP);
    f.y = baseY + row * (SH + GAP);
    f.cornerRadius = 10;
    f.fills = [{ type: "SOLID", color: { r: 0.93, g: 0.94, b: 0.98 } }];
    f.strokes = [{ type: "SOLID", color: { r: 0.78, g: 0.8, b: 0.9 } }];
    f.strokeWeight = 1;
    if (font) {
      const t = figma.createText();
      t.fontName = font;
      t.characters = name;
      t.fontSize = 16;
      t.fills = [{ type: "SOLID", color: { r: 0.25, g: 0.28, b: 0.42 } }];
      f.appendChild(t);
      t.x = 16;
      t.y = 16;
    }
    host.appendChild(f);
    created.push(f);
  });

  // Grow the dashboard frame so the new grid sits fully inside it (no overlap).
  if (inFrame && frame && created.length && "resize" in frame) {
    const rows = Math.ceil(todo.length / COLS);
    const neededH = baseY + rows * (SH + GAP);
    if (neededH > frame.height) (frame as FrameNode).resize(frame.width, Math.ceil(neededH));
  }

  if (created.length) {
    // Select the DASHBOARD (not the cards) so the next export targets it with the
    // sheets included; zoom to the new cards so the user can find/reposition them.
    figma.currentPage.selection = frame ? [frame] : created;
    figma.viewport.scrollAndZoomIntoView(created);
  }
  const where = inFrame ? "onto your dashboard (below the design)" : "beside your dashboard";
  figma.notify(`Added ${created.length} sheet(s) ${where} — reposition them, then export. They'll swap in their real data.`);
}

// Re-parse whenever the user changes their selection.
figma.on("selectionchange", () => void parseAndSend());

// Place a component dragged from the UI Library / Defaults cards onto the canvas.
// Returning false tells Figma we've handled the drop (no default behaviour).
figma.on("drop", (event: DropEvent) => {
  try {
    handleDrop(event);
  } catch (e) {
    figma.notify(`Couldn't drop component: ${(e as Error).message}`);
  }
  return false;
});

figma.ui.onmessage = (msg: UiToPlugin) => {
  switch (msg.type) {
    case "request-parse":
      void parseAndSend();
      void restoreImport();
      void restoreUiState();
      break;
    case "apply-tags":
      void applyTagsAndResend();
      break;
    case "request-faithful":
      // Export gate: free plan stops at FREE_EXPORT_LIMIT exports. Checked here
      // (the sandbox owns the counter + license cache) so the UI can't bypass it.
      void (async () => {
        if (await exportAllowed()) {
          await sendFaithful({ includeBackground: msg.includeBackground, exportMode: msg.exportMode });
        } else {
          post({
            type: "faithful-ready",
            models: null,
            error: `You've used all ${FREE_EXPORT_LIMIT} free exports. Upgrade to Premium (${PREMIUM_PRICE_LABEL}) on the Account tab for unlimited exports.`,
          });
        }
      })();
      break;
    case "add-sheets":
      void addSheets(msg.names);
      break;
    case "insert-default":
      void insertDefault(msg.kind);
      break;
    case "save-import":
      // Best-effort persistence: a large import (e.g. a .hyper extract) can
      // exceed the clientStorage quota — swallow the rejection so it doesn't
      // surface as an unhandled error; the user just re-uploads next session.
      figma.clientStorage.setAsync("ft-import", msg.data).catch((e) => { console.warn("Failed to persist import:", e); });
      break;
    case "save-ui-state":
      void saveUiState(msg.data);
      break;
    case "resize":
      figma.ui.resize(Math.max(360, msg.width), Math.max(420, msg.height));
      break;
    case "notify":
      figma.notify(msg.message);
      break;
    case "insert-library-component":
      void insertLibraryComponent(msg.componentId);
      break;
    case "apply-template":
      void applyTemplate(msg.templateId);
      break;
    case "request-account":
      void sendAccountInfo();
      break;
    case "log-export":
      void logExport();
      break;
    case "clear-import":
      void clearImport();
      break;
    case "set-premium":
      void setPremium({ premium: msg.premium, validUntil: msg.validUntil, subscriptionId: msg.subscriptionId });
      break;
  }
};

// Initial parse on launch + restore persisted import data + UI state.
void parseAndSend();
void restoreImport();
void restoreUiState();
