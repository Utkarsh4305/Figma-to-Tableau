import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, Sparkles, Building2 } from "lucide-react";
import SectionHeading from "../components/ui/SectionHeading";
import { stagger, fadeUp, viewportOnce } from "../lib/motion";
import { PLUGIN_URL, PREMIUM_PRICE, PREMIUM_PERIOD, FREE_EXPORT_LIMIT } from "../config";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Everything you need to try the full workflow.",
    features: [
      `${FREE_EXPORT_LIMIT} .twbx exports`,
      "All export modes (floating, tiled, image)",
      "Worksheet swapping & navigation",
      "15 domain templates",
      "Community support",
    ],
    cta: { label: "Get the plugin", to: PLUGIN_URL, external: true, ghost: true },
  },
  {
    name: "Premium",
    price: PREMIUM_PRICE,
    period: PREMIUM_PERIOD,
    blurb: "For professionals shipping dashboards every week.",
    features: [
      "Unlimited .twbx exports",
      "Everything in Free",
      "License tied to your Figma account",
      "3-day offline grace period",
      "Priority support",
    ],
    cta: { label: "Upgrade to Premium", to: "/upgrade", external: false, ghost: false },
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "coming soon",
    blurb: "For consultancies and BI teams at scale.",
    features: [
      "Team licenses & central billing",
      "Design-system governance",
      "Private template libraries",
      "SSO & audit logs",
      "Dedicated support",
    ],
    cta: { label: "Talk to us", to: "/contact", external: false, ghost: true },
    soon: true,
  },
];

export default function Pricing({ standalone = false }: { standalone?: boolean }) {
  return (
    <section className={`section ${standalone ? "section--page" : ""}`} id="pricing">
      <div className="orb orb--blue" style={{ width: 400, height: 400, top: 120, left: "-6%" }} />
      <div className="orb orb--purple" style={{ width: 350, height: 350, bottom: 60, right: "-4%" }} />
      <div className="container">
        <SectionHeading
          center
          eyebrow="Pricing"
          title={
            <>
              Start free. <span className="grad-text">Upgrade when it pays for itself.</span>
            </>
          }
          blurb="One saved rebuild covers a year of Premium."
        />
        <motion.div
          className="plans"
          variants={stagger(0, 0.12)}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
        >
          {PLANS.map((p) => (
            <motion.div
              key={p.name}
              className={`plan ${p.highlight ? "plan--highlight" : ""} ${p.soon ? "plan--soon" : ""}`}
              variants={fadeUp}
            >
              {p.highlight && (
                <span className="plan__badge">
                  <Sparkles size={13} strokeWidth={2.4} /> Most popular
                </span>
              )}
              {p.soon && (
                <span className="plan__badge plan__badge--soon">
                  <Building2 size={13} strokeWidth={2.2} /> Coming soon
                </span>
              )}
              <h3>{p.name}</h3>
              <div className="plan__price">
                <span className="plan__amount">{p.price}</span>
                <span className="plan__period">{p.period}</span>
              </div>
              <p className="plan__blurb">{p.blurb}</p>
              <ul className="plan__features">
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={15} strokeWidth={2.4} />
                    {f}
                  </li>
                ))}
              </ul>
              {p.cta.external ? (
                <a href={p.cta.to} target="_blank" rel="noreferrer" className={`btn ${p.cta.ghost ? "btn--ghost" : "btn--primary"}`}>
                  {p.cta.label}
                </a>
              ) : (
                <Link to={p.cta.to} className={`btn ${p.cta.ghost ? "btn--ghost" : "btn--primary"}`}>
                  {p.cta.label}
                </Link>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
