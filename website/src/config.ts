/**
 * Site-wide configuration. Everything that changes between dev and production
 * lives here (or in VITE_* env vars that override it).
 */

/** The billing backend (repo /backend) — hosts Razorpay checkout + license API. */
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";

/** Where "Get the plugin" points — the Figma Community listing once published. */
export const PLUGIN_URL = "https://www.figma.com/community/plugins";

/** Support inbox shown on /support and /contact. */
export const SUPPORT_EMAIL = "support@figmatotableau.dev";

/** Display price — the real amount lives on the backend / Razorpay plan. */
export const PREMIUM_PRICE = "$10";
export const PREMIUM_PERIOD = "/month";
export const FREE_EXPORT_LIMIT = 15;

/**
 * Build the secure-checkout URL for a Figma user. The plugin opens
 * /upgrade?uid=…&name=… on this site; the upgrade page hands off here.
 */
export function checkoutUrl(uid: string, name?: string): string {
  const params = new URLSearchParams({ uid });
  if (name) params.set("name", name);
  return `${BACKEND_URL}/checkout?${params.toString()}`;
}
