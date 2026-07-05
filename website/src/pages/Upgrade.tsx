import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Lock, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import {
  PREMIUM_PRICE,
  PREMIUM_PERIOD,
  PREMIUM_ANNUAL_PRICE,
  PREMIUM_ANNUAL_PERIOD,
  FREE_EXPORT_LIMIT,
  PLUGIN_URL,
} from "../config";
import {
  openPremiumCheckout,
  razorpayReady,
  type BillingPlan,
  type CheckoutStatus,
} from "../lib/razorpay";

export default function Upgrade() {
  const [params] = useSearchParams();
  const uid = (params.get("uid") ?? "").trim();
  const name = (params.get("name") ?? "").trim();
  const [billing, setBilling] = useState<BillingPlan>("monthly");
  const [status, setStatus] = useState<CheckoutStatus | null>(null);

  const price = billing === "annual" ? PREMIUM_ANNUAL_PRICE : PREMIUM_PRICE;
  const period = billing === "annual" ? PREMIUM_ANNUAL_PERIOD : PREMIUM_PERIOD;

  // Inline Razorpay checkout keyed to the Figma uid — passes the selected plan
  // so annual actually charges (and grants) the annual amount, not monthly.
  const buy = () => {
    if (status?.state === "loading") return;
    openPremiumCheckout({ uid, name, plan: billing, onStatus: setStatus });
  };

  return (
    <section className="page page--upgrade">
      <div className="orb orb--purple" style={{ width: 520, height: 520, top: -120, right: "10%" }} />
      <div className="orb orb--blue" style={{ width: 460, height: 460, top: 240, left: "-4%" }} />

      <div className="container upgrade">
        <motion.div
          className="upgrade__card"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="plan__badge">
            <Sparkles size={13} strokeWidth={2.4} /> Premium
          </span>
          <h1>
            {name ? `${name}, unlock` : "Unlock"} <span className="grad-text">unlimited exports</span>
          </h1>

          {uid && razorpayReady && (
            <div className="billing-toggle" role="group" aria-label="Billing period">
              <button
                type="button"
                className={`billing-toggle__opt ${billing === "monthly" ? "is-active" : ""}`}
                aria-pressed={billing === "monthly"}
                onClick={() => setBilling("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`billing-toggle__opt ${billing === "annual" ? "is-active" : ""}`}
                aria-pressed={billing === "annual"}
                onClick={() => setBilling("annual")}
              >
                Annual <span className="billing-toggle__save">Save 17%</span>
              </button>
            </div>
          )}

          <div className="plan__price">
            <span className="plan__amount">{price}</span>
            <span className="plan__period">{period}</span>
          </div>
          {billing === "annual" && <span className="plan__save-note">2 months free vs monthly</span>}

          <ul className="plan__features">
            <li><Check size={15} strokeWidth={2.4} /> Unlimited .twbx exports — no more {FREE_EXPORT_LIMIT}-export cap</li>
            <li><Check size={15} strokeWidth={2.4} /> All export modes, worksheet swapping, navigation</li>
            <li><Check size={15} strokeWidth={2.4} /> License tied to your Figma account, 3-day offline grace</li>
            <li><Check size={15} strokeWidth={2.4} /> Priority support</li>
          </ul>

          {uid && razorpayReady ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--lg upgrade__cta"
                onClick={buy}
                disabled={status?.state === "loading"}
              >
                <Lock size={16} strokeWidth={2.2} />
                {status?.state === "loading" ? "Working…" : `Pay ${price}${period} securely`}
                <ArrowRight size={17} strokeWidth={2.2} />
              </button>
              {status && (
                <p className={`plan__status plan__status--${status.state}`}>{status.message}</p>
              )}
              <p className="upgrade__note">
                <ShieldCheck size={14} /> Payments processed by Razorpay. After paying, return to Figma and click{" "}
                <b>"Refresh status"</b> in the plugin's Account tab — Premium activates instantly.
              </p>
            </>
          ) : (
            <>
              <div className="upgrade__nouid">
                <p>
                  Premium is tied to your <b>Figma account</b>, so checkout starts inside the plugin: open{" "}
                  <b>Figma → Plugins → Figma to Tableau → Account</b> and click <b>Upgrade to Premium</b> — it
                  brings you right back here with your account linked.
                </p>
              </div>
              <a href={PLUGIN_URL} target="_blank" rel="noreferrer" className="btn btn--primary btn--lg upgrade__cta">
                Open the plugin
                <ArrowRight size={17} strokeWidth={2.2} />
              </a>
            </>
          )}
        </motion.div>

        <motion.aside
          className="upgrade__aside"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2>What happens next</h2>
          <ol>
            <li>
              <b>Pick monthly or annual, pay once.</b> Razorpay handles cards, UPI and netbanking on a secure
              checkout — annual saves ~2 months versus monthly.
            </li>
            <li>
              <b>Your license activates server-side.</b> It's keyed to your Figma user id — no license keys to
              paste, nothing to install.
            </li>
            <li>
              <b>Export without limits.</b> The plugin re-checks your license once per session and keeps
              working offline for 3 days between checks.
            </li>
          </ol>
          <p className="upgrade__aside-links">
            Questions? Read the <Link to="/docs">docs</Link>, check the <Link to="/pricing">plans</Link>, or{" "}
            <Link to="/support">contact support</Link>.
          </p>
        </motion.aside>
      </div>
    </section>
  );
}
