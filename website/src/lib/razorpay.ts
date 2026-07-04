// ---------------------------------------------------------------------------
// razorpay.ts — inline Razorpay Checkout for the marketing site. Runs the same
// Standard-Checkout order flow as the backend's hosted /checkout page, but
// opens the modal in-place so the pricing section can take a payment without a
// full-page redirect:
//
//   create-order (backend)  →  Razorpay modal  →  verify-payment (backend)
//
// Premium is keyed to a Figma user id. When the plugin links here it passes
// ?uid=<figma id>, so the license unlocks the plugin directly. A plain web
// visitor gets a stable per-browser id instead, so the payment still completes
// and is recorded — they finish activation from the plugin's Account tab.
// ---------------------------------------------------------------------------

import { BACKEND_URL, RAZORPAY_KEY_ID } from "../config";

export type CheckoutState = "loading" | "success" | "error" | "cancelled";
export interface CheckoutStatus {
  state: CheckoutState;
  message: string;
}

// Razorpay attaches a global constructor once checkout.js loads.
type RazorpayCtor = new (options: Record<string, unknown>) => {
  open(): void;
  on(event: string, handler: (resp: { error?: { description?: string } }) => void): void;
};
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let scriptPromise: Promise<boolean> | null = null;

/** Load Razorpay's checkout.js once, resolving false if it can't be fetched. */
function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/** Whether inline checkout can run at all (publishable key configured). */
export const razorpayReady = Boolean(RAZORPAY_KEY_ID);

/** A stable per-browser fallback id for visitors who didn't arrive from the plugin. */
export function resolveUid(urlUid?: string): string {
  const fromUrl = (urlUid ?? "").trim();
  if (fromUrl) return fromUrl;
  const KEY = "ft-web-uid";
  let v = localStorage.getItem(KEY);
  if (!v) {
    v = `web_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, v);
  }
  return v;
}

export type BillingPlan = "monthly" | "annual";

/** Open the Razorpay modal for Premium. Reports progress via onStatus. */
export async function openPremiumCheckout(opts: {
  uid: string;
  name?: string;
  plan?: BillingPlan;
  onStatus: (s: CheckoutStatus) => void;
}): Promise<void> {
  const { uid, name, plan = "monthly", onStatus } = opts;

  if (!RAZORPAY_KEY_ID) {
    onStatus({ state: "error", message: "Payments aren't configured yet. Set VITE_RAZORPAY_KEY_ID." });
    return;
  }

  onStatus({ state: "loading", message: "Starting secure checkout…" });

  const loaded = await loadRazorpay();
  if (!loaded || !window.Razorpay) {
    onStatus({ state: "error", message: "Couldn't reach Razorpay. Check your connection and try again." });
    return;
  }

  let order: { order_id: string; amount: number; currency: string };
  try {
    const r = await fetch(`${BACKEND_URL}/api/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, plan }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    order = await r.json();
  } catch {
    onStatus({ state: "error", message: "Couldn't start checkout — try again in a moment." });
    return;
  }

  const rzp = new window.Razorpay({
    key: RAZORPAY_KEY_ID,
    order_id: order.order_id,
    amount: order.amount,
    currency: order.currency,
    name: "Figma to Tableau",
    description: `Premium (${plan === "annual" ? "annual" : "monthly"}) — unlimited exports`,
    prefill: name ? { name } : undefined,
    notes: { figma_uid: uid },
    theme: { color: "#f4512c" },
    handler: (resp: {
      razorpay_payment_id?: string;
      razorpay_order_id?: string;
      razorpay_signature?: string;
    }) => {
      onStatus({ state: "loading", message: "Verifying payment…" });
      fetch(`${BACKEND_URL}/api/verify-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_signature: resp.razorpay_signature,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(() =>
          onStatus({
            state: "success",
            message: "Premium is active! Open the plugin's Account tab and click “Refresh status”.",
          })
        )
        .catch(() =>
          onStatus({
            state: "error",
            message: "Payment went through but activation failed — refresh your status in the plugin shortly, or contact support.",
          })
        );
    },
    modal: {
      ondismiss: () => onStatus({ state: "cancelled", message: "Checkout cancelled." }),
    },
  });
  rzp.on("payment.failed", (resp) => {
    onStatus({
      state: "error",
      message: "Payment failed: " + (resp.error?.description || "please try again."),
    });
  });
  rzp.open();
}
