/**
 * Site-wide configuration. Everything that changes between dev and production
 * lives here (or in VITE_* env vars that override it).
 */

/**
 * The billing backend (repo /backend) — hosts Razorpay checkout + license API.
 * Production default is the Render deployment; local dev overrides it via
 * VITE_BACKEND_URL=http://localhost:3000 in website/.env.
 */
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "https://figma-tableau-backend-xuvn.onrender.com";

/**
 * Razorpay publishable key id (rzp_test_… / rzp_live_…). Safe to expose on the
 * client — it only identifies your account for the Checkout modal; the secret
 * stays on the backend. Set VITE_RAZORPAY_KEY_ID to enable inline checkout on
 * the pricing page; when empty, the buy button falls back to the /upgrade flow.
 */
export const RAZORPAY_KEY_ID =
  import.meta.env.VITE_RAZORPAY_KEY_ID ?? "rzp_live_TBjDYOWOGNX8bn";

/** Where "Get the plugin" points — the Figma Community listing once published. */
export const PLUGIN_URL = "https://www.figma.com/community/plugins";

/** Support inbox shown on /support and /contact. */
export const SUPPORT_EMAIL = "support@figmatotableau.dev";

/** Display prices — the real charged amounts live on the backend (per plan). */
export const PREMIUM_PRICE = "$10";
export const PREMIUM_PERIOD = "/month";
/** Annual plan: one payment a year, cheaper than 12× monthly. */
export const PREMIUM_ANNUAL_PRICE = "$100";
export const PREMIUM_ANNUAL_PERIOD = "/year";
export const FREE_EXPORT_LIMIT = 15;

/**
 * Dual-currency billing. Indian visitors are charged in INR (which unlocks UPI,
 * netbanking and wallets at Razorpay); everyone else in USD (card checkout —
 * the only rail that carries a foreign currency). The backend is authoritative
 * on the amount; these strings are display-only and must mirror its price table.
 */
export type Currency = "INR" | "USD";

/** Best-effort region → currency from the browser's time zone. */
export function detectCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/Asia\/(Kolkata|Calcutta)/i.test(tz)) return "INR";
  } catch {
    /* Intl unavailable — fall through to USD */
  }
  return "USD";
}

/** Per-currency display prices (mirror backend PRICING). */
export const PRICES: Record<Currency, { monthly: string; annual: string }> = {
  USD: { monthly: "$10", annual: "$100" },
  INR: { monthly: "₹850", annual: "₹8,500" },
};

/**
 * Build the secure-checkout URL for a Figma user. The plugin opens
 * /upgrade?uid=…&name=… on this site; the upgrade page hands off here.
 */
export function checkoutUrl(uid: string, name?: string): string {
  const params = new URLSearchParams({ uid });
  if (name) params.set("name", name);
  return `${BACKEND_URL}/checkout?${params.toString()}`;
}
