import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <section className="page page--placeholder">
      <div className="container container--narrow">
        <div className="placeholder">
          <span className="eyebrow">
            <span className="dot" />
            404
          </span>
          <h1>
            This zone didn't make it <span className="grad-text">into the workbook</span>
          </h1>

          {/* An empty, still-dashed wireframe zone — the page that never exported */}
          <motion.div
            className="zone404"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="zone404__tag">SHEET/This Page</span>
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              zone not found — nothing was drawn here
            </motion.span>
          </motion.div>

          <p>The URL you followed doesn't exist (yet).</p>
          <div className="placeholder__actions">
            <Link to="/" className="btn btn--primary">
              <ArrowLeft size={16} />
              Back to home
            </Link>
            <Link to="/docs" className="btn btn--ghost">
              Read the docs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
