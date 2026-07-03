// ---------------------------------------------------------------------------
// Client-storage persistence helpers: import data, account info, UI state.
// ---------------------------------------------------------------------------

import { post } from "./messaging";
import { FREE_EXPORT_LIMIT } from "../shared/constants";

// --- Premium license cache ----------------------------------------------------
// The UI verifies the Razorpay subscription against the payment server and asks
// us (via "set-premium") to cache the result here, so the export gate works
// without a network round-trip and across sessions.

export interface PremiumRecord {
  premium: boolean;
  validUntil?: number; // ms epoch the subscription is paid through
  subscriptionId?: string;
}

// Renewal charges land via webhook, so give the cached expiry a grace window —
// a paying user must never be locked out on the renewal day itself.
const PREMIUM_GRACE_MS = 3 * 24 * 3600 * 1000;

/** Read the cached Premium state; an expired validUntil (past grace) = free. */
export async function getPremium(): Promise<PremiumRecord> {
  try {
    const stored = await figma.clientStorage.getAsync("ft-premium");
    if (stored && typeof stored === "object" && (stored as PremiumRecord).premium === true) {
      const rec = stored as PremiumRecord;
      if (!rec.validUntil || rec.validUntil + PREMIUM_GRACE_MS > Date.now()) return rec;
    }
  } catch {
    /* unreadable cache = free plan */
  }
  return { premium: false };
}

/** Cache the server-verified Premium state, then refresh the Account tab. */
export async function setPremium(rec: PremiumRecord): Promise<void> {
  try {
    await figma.clientStorage.setAsync("ft-premium", rec);
  } catch (e) {
    console.warn("Failed to persist premium state:", e);
  }
  void sendAccountInfo();
}

/** Read the persisted all-time export counter (0 when unset/unreadable). */
async function getExportCount(): Promise<number> {
  try {
    const stored = await figma.clientStorage.getAsync("ft-export-count");
    if (typeof stored === "number" && isFinite(stored)) return stored;
  } catch {
    /* fall through */
  }
  return 0;
}

/** The export gate: Premium is unlimited; free stops at FREE_EXPORT_LIMIT. */
export async function exportAllowed(): Promise<boolean> {
  const p = await getPremium();
  if (p.premium) return true;
  return (await getExportCount()) < FREE_EXPORT_LIMIT;
}

/** Restore the imported workbook data persisted from a prior session. */
export async function restoreImport(): Promise<void> {
  try {
    const stored = await figma.clientStorage.getAsync("ft-import");
    post({ type: "import-restored", data: stored ?? null });
  } catch {
    post({ type: "import-restored", data: null });
  }
}

/** Send the Account-tab info: Figma user, export count, and Premium state. */
export async function sendAccountInfo(): Promise<void> {
  const exportCount = await getExportCount();
  const prem = await getPremium();
  post({
    type: "account-info",
    userName: figma.currentUser ? figma.currentUser.name : null,
    userId: figma.currentUser ? figma.currentUser.id : null,
    exportCount,
    premium: prem.premium,
    premiumValidUntil: prem.validUntil,
  });
}

/** Bump the persisted export counter, then refresh the Account tab. */
export async function logExport(): Promise<void> {
  try {
    const count = await getExportCount();
    await figma.clientStorage.setAsync("ft-export-count", count + 1);
  } catch {
    /* counter write failed — never block the export flow */
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
