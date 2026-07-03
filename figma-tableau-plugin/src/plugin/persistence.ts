// ---------------------------------------------------------------------------
// Client-storage persistence helpers: import data, account info, UI state.
// ---------------------------------------------------------------------------

import { post } from "./messaging";

/** Restore the imported workbook data persisted from a prior session. */
export async function restoreImport(): Promise<void> {
  try {
    const stored = await figma.clientStorage.getAsync("ft-import");
    post({ type: "import-restored", data: stored ?? null });
  } catch {
    post({ type: "import-restored", data: null });
  }
}

/** Send the Account-tab info: the Figma user's name + the persisted export count. */
export async function sendAccountInfo(): Promise<void> {
  let exportCount = 0;
  try {
    const stored = await figma.clientStorage.getAsync("ft-export-count");
    if (typeof stored === "number" && isFinite(stored)) exportCount = stored;
  } catch {
    /* counter is cosmetic — default to 0 */
  }
  post({
    type: "account-info",
    userName: figma.currentUser ? figma.currentUser.name : null,
    exportCount,
  });
}

/** Bump the persisted export counter, then refresh the Account tab. */
export async function logExport(): Promise<void> {
  let count = 0;
  try {
    const stored = await figma.clientStorage.getAsync("ft-export-count");
    if (typeof stored === "number" && isFinite(stored)) count = stored;
    await figma.clientStorage.setAsync("ft-export-count", count + 1);
  } catch {
    /* counter is cosmetic — never block the export flow */
  }
  void sendAccountInfo();
}

/** Persist the plugin UI state (window size + active tab) across sessions. */
export async function saveUiState(data: { width: number; height: number; tab: string }): Promise<void> {
  try {
    await figma.clientStorage.setAsync("ft-ui-state", data);
  } catch {
    /* UI state is cosmetic — swallow silently */
  }
}

/** Restore the persisted UI state on the next plugin launch. */
export async function restoreUiState(): Promise<void> {
  try {
    const stored = await figma.clientStorage.getAsync("ft-ui-state");
    post({ type: "ui-state-restored", data: stored ?? null });
  } catch {
    post({ type: "ui-state-restored", data: null });
  }
}

/** Forget the imported workbook persisted across sessions. */
export async function clearImport(): Promise<void> {
  try {
    await figma.clientStorage.deleteAsync("ft-import");
    figma.notify("Stored Tableau workbook cleared — charts will use demo data until you upload again.");
  } catch {
    figma.notify("Couldn't clear the stored workbook — try again.");
  }
}
