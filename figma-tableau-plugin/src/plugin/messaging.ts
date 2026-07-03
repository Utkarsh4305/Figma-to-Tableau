// ---------------------------------------------------------------------------
// messaging.ts — Figma sandbox message helpers (plugin → UI).
// ---------------------------------------------------------------------------

import type { PluginToUi } from "../shared/types";

/** Post a typed message from the plugin sandbox to the React UI iframe. */
export function post(msg: PluginToUi): void {
  figma.ui.postMessage(msg);
}
