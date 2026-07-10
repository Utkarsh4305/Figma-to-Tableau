// ---------------------------------------------------------------------------
// razorpay.ts — inline Razorpay Checkout for the marketing site. Runs the same
// Standard-Checkout order flow as the backend's hosted /checkout page, but
// opens the modal in-place so the pricing section can take a payment without a
// full-page redirect:
//
//   create-order (backend)  →  Razorpay modal  →  verify-payment (backend)
//
// Premium is keyed to a Figma user id. When the plugin links here it passes
// ?uid=<figma id>, so the license unlocks the plugin directly. Callers must
// supply that uid — inline checkout is only offered to visitors who arrived
// from the plugin, so a payment can never be stranded on an id the plugin
// can't query (direct web visitors are routed to /upgrade instead).
// ---------------------------------------------------------------------------

import { BACKEND_URL, RAZORPAY_KEY_ID, detectCurrency, type Currency } from "../config";

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

export type BillingPlan = "monthly" | "annual";

/** Open the Razorpay modal for Premium. Reports progress via onStatus. */
export async function openPremiumCheckout(opts: {
  uid: string;
  name?: string;
  plan?: BillingPlan;
  currency?: Currency;
  onStatus: (s: CheckoutStatus) => void;
}): Promise<void> {
  const { uid, name, plan = "monthly", currency = detectCurrency(), onStatus } = opts;

  if (!RAZORPAY_KEY_ID) {
    onStatus({ state: "error", message: "Payments aren't configured yet. Set VITE_RAZORPAY_KEY_ID." });
    return;
  }

  // A license is keyed to the Figma user id; refuse to take a payment we
  // couldn't attach to an account (guards against orphaned purchases).
  if (!uid.trim()) {
    onStatus({ state: "error", message: "Start your upgrade from the plugin's Account tab so we can link Premium to your Figma account." });
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
      body: JSON.stringify({ uid, plan, currency }),
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
    name: "Pixelmentis",
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
