import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "../config";

export default function Placeholder({
  title,
  blurb,
  showSupportEmail = false,
}: {
  title: string;
  blurb: string;
  showSupportEmail?: boolean;
}) {
  return (
    <section className="page page--placeholder">
      <div className="orb orb--blue" style={{ width: 480, height: 480, top: -140, left: "20%" }} />
      <div className="container container--narrow">
        <motion.div
          className="placeholder"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="eyebrow">
            <span className="dot" />
            {title}
          </span>
          <h1>{title}</h1>
          <p>{blurb}</p>
          <div className="placeholder__actions">
            {showSupportEmail && (
              <a className="btn btn--primary" href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail size={16} />
                {SUPPORT_EMAIL}
              </a>
            )}
            <Link to="/" className="btn btn--ghost">
              <ArrowLeft size={16} />
              Back to home
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
