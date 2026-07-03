import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BadgeCheck, CircleDashed, Search, WifiOff } from "lucide-react";
import { BACKEND_URL, PLUGIN_URL } from "../config";

interface License {
  premium: boolean;
  validUntil?: number;
  status?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; license: License }
  | { kind: "error" };

export default function Account() {
  const [uid, setUid] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = uid.trim();
    if (!id) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${BACKEND_URL}/api/license/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "done", license: (await res.json()) as License });
    } catch {
      setState({ kind: "error" });
    }
  };

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" />Account</span>
          <h1>
            Check your <span className="grad-text">license.</span>
          </h1>
          <p className="page-hero__blurb">
            Your plan lives with your Figma account — day to day you manage it from the plugin's
            Account tab. Paste your Figma user id here to look up its status from the license server.
          </p>
        </div>
      </div>

      <div className="container license-check">
        <form className="license-check__form" onSubmit={check}>
          <input
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="Figma user id (shown in the plugin's Account tab)"
            aria-label="Figma user id"
          />
          <button type="submit" className="btn btn--primary" disabled={state.kind === "loading"}>
            <Search size={15} strokeWidth={2.4} />
            {state.kind === "loading" ? "Checking…" : "Check"}
          </button>
        </form>

        {state.kind === "done" && (
          <motion.div
            className="license-result"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {state.license.premium ? (
              <>
                <span className="license-result__icon" style={{ background: "rgba(10,207,131,0.15)", color: "#0aa268" }}>
                  <BadgeCheck size={20} strokeWidth={2.2} />
                </span>
                <div>
                  <h3>Premium — active</h3>
                  <p>
                    Unlimited exports.
                    {state.license.validUntil
                      ? ` Valid until ${new Date(state.license.validUntil).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.`
                      : ""}{" "}
                    The plugin refreshes this automatically once per session.
                  </p>
                </div>
              </>
            ) : (
              <>
                <span className="license-result__icon" style={{ background: "rgba(255,181,36,0.18)", color: "#b97e0a" }}>
                  <CircleDashed size={20} strokeWidth={2.2} />
                </span>
                <div>
                  <h3>Free plan</h3>
                  <p>
                    No active Premium license for this id. If you just paid, open the plugin and
                    click <b>Refresh status</b> on the Account tab — or <Link to="/upgrade" style={{ color: "var(--accent)", fontWeight: 600 }}>upgrade now</Link>.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}

        {state.kind === "error" && (
          <motion.div
            className="license-result"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="license-result__icon" style={{ background: "rgba(239,68,68,0.12)", color: "#d33" }}>
              <WifiOff size={19} strokeWidth={2.2} />
            </span>
            <div>
              <h3>Couldn't reach the license server</h3>
              <p>
                Check your connection and try again. The plugin itself keeps working offline for
                3 days between license checks, so exports aren't blocked in the meantime.
              </p>
            </div>
          </motion.div>
        )}

        <div className="hint-card">
          <b>Where's my user id?</b> Open the plugin in Figma → <b>Account</b> tab — your id sits
          under your profile. Subscription management (cancel, invoices) from this page is on the
          roadmap; today it's handled via{" "}
          <Link to="/support" style={{ color: "var(--accent)", fontWeight: 600 }}>support</Link>.
          {" "}Don't have the plugin yet?{" "}
          <a href={PLUGIN_URL} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>Get it here</a>.
        </div>
      </div>
    </>
  );
}
