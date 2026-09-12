import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CreditCard, MousePointerClick, PartyPopper } from "lucide-react";

const STEPS = [
  {
    icon: CreditCard,
    color: "#5f5580",
    title: "Pay through checkout",
    text: "Complete the Razorpay checkout you reached from the plugin (cards, UPI or netbanking). The license is written to your Figma account the moment payment verifies.",
  },
  {
    icon: MousePointerClick,
    color: "#9c4f63",
    title: "Refresh in the plugin",
    text: "Back in Figma, open the plugin's Account tab and click “Refresh status”. The plugin also re-checks automatically once per session.",
  },
  {
    icon: PartyPopper,
    color: "#3d8254",
    title: "That's it — no keys",
    text: "Premium is active: unlimited exports, and a 3-day offline grace period between license checks. Nothing to paste, nothing to install.",
  },
];

export default function Activate() {
  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" />Activation</span>
          <h1>
            Licenses activate <span className="grad-text">themselves.</span>
          </h1>
          <p className="page-hero__blurb">
            There are no license keys. Activation is automatic after checkout — here's the whole flow.
          </p>
        </div>
      </div>

      <div className="container license-check">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            className="license-result"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="license-result__icon" style={{ background: `${s.color}1c`, color: s.color }}>
              <s.icon size={19} strokeWidth={2.1} />
            </span>
            <div>
              <h3>{i + 1}. {s.title}</h3>
              <p>{s.text}</p>
            </div>
          </motion.div>
        ))}

        <div className="hint-card">
          <b>Paid but still on Free?</b> Give it a minute, refresh once more, then verify with the{" "}
          <Link to="/account" style={{ color: "var(--accent)", fontWeight: 600 }}>license checker</Link>.
          Still stuck? <Link to="/support" style={{ color: "var(--accent)", fontWeight: 600 }}>Contact support</Link>{" "}
          with your Figma user id and payment reference — we'll sort it fast.
        </div>
      </div>
    </>
  );
}
