import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Figma, KeyRound } from "lucide-react";
import { PLUGIN_URL } from "../config";

export default function Login() {
  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" />Sign in</span>
          <h1>
            Your Figma account <span className="grad-text">is the account.</span>
          </h1>
          <p className="page-hero__blurb">
            There's no separate password to remember: the plugin identifies you through Figma, and
            your license is keyed to that identity. A web dashboard sign-in is on the roadmap.
          </p>
        </div>
      </div>

      <div className="container license-check">
        <motion.div
          className="license-result"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="license-result__icon" style={{ background: "rgba(162,89,255,0.14)", color: "var(--purple)" }}>
            <Figma size={19} strokeWidth={2} />
          </span>
          <div>
            <h3>Everything happens in the plugin</h3>
            <p>
              Open <b>Figma → Plugins → Figma to Tableau → Account</b>: your profile, plan, usage
              stats and the upgrade button all live there, already signed in as you.
            </p>
          </div>
        </motion.div>

        <motion.div
          className="license-result"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="license-result__icon" style={{ background: "rgba(244,81,44,0.12)", color: "var(--accent)" }}>
            <KeyRound size={19} strokeWidth={2.1} />
          </span>
          <div>
            <h3>Just need your license status?</h3>
            <p>
              Use the <Link to="/account" style={{ color: "var(--accent)", fontWeight: 600 }}>license checker</Link>{" "}
              with your Figma user id — no sign-in required.
            </p>
          </div>
        </motion.div>

        <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href={PLUGIN_URL} target="_blank" rel="noreferrer" className="btn btn--primary">
            Open the plugin <ArrowRight size={16} strokeWidth={2.4} />
          </a>
          <Link to="/account" className="btn btn--ghost">Check a license</Link>
        </div>
      </div>
    </>
  );
}
