import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Lock, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { checkoutUrl, PREMIUM_PRICE, PREMIUM_PERIOD, FREE_EXPORT_LIMIT, PLUGIN_URL } from "../config";

/**
 * The page every premium CTA in the plugin lands on:
 *   /upgrade?uid=<figma user id>&name=<display name>
 *
 * With a uid we can hand off straight to the backend's secure Razorpay
 * checkout. Without one (someone browsing the site), we explain that the
 * license is tied to a Figma account and point them at the plugin.
 */
export default function Upgrade() {
  const [params] = useSearchParams();
  const uid = (params.get("uid") ?? "").trim();
  const name = (params.get("name") ?? "").trim();

  return (
    <section className="page page--upgrade noise">
      <div className="bg-grid" />
      <div className="orb orb--violet" style={{ width: 520, height: 520, top: -120, right: "10%" }} />
      <div className="orb orb--blue" style={{ width: 460, height: 460, top: 240, left: "-4%" }} />

      <div className="container upgrade">
        <motion.div
          className="upgrade__card glass"
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
          <div className="plan__price">
            <span className="plan__amount">{PREMIUM_PRICE}</span>
            <span className="plan__period">{PREMIUM_PERIOD}</span>
          </div>
          <ul className="plan__features">
            <li><Check size={15} strokeWidth={2.4} /> Unlimited .twbx exports — no more {FREE_EXPORT_LIMIT}-export cap</li>
            <li><Check size={15} strokeWidth={2.4} /> All export modes, worksheet swapping, navigation</li>
            <li><Check size={15} strokeWidth={2.4} /> License tied to your Figma account, 3-day offline grace</li>
            <li><Check size={15} strokeWidth={2.4} /> Priority support</li>
          </ul>

          {uid ? (
            <>
              <a href={checkoutUrl(uid, name)} className="btn btn--primary btn--lg upgrade__cta">
                <Lock size={16} strokeWidth={2.2} />
                Continue to secure checkout
                <ArrowRight size={17} strokeWidth={2.2} />
              </a>
              <p className="upgrade__note">
                <ShieldCheck size={14} /> Payments processed by Razorpay. After paying, return to Figma and click{" "}
                <b>“Refresh status”</b> in the plugin's Account tab — Premium activates instantly.
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
              <b>Pay once a month, cancel anytime.</b> Razorpay handles cards, UPI and netbanking on a secure
              hosted checkout.
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
