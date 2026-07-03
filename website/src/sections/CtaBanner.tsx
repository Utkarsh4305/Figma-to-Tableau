import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import Reveal from "../components/ui/Reveal";
import { PLUGIN_URL } from "../config";

export default function CtaBanner() {
  return (
    <section className="section section--tight" id="cta">
      <div className="container">
        <Reveal className="cta-banner">
          <div className="orb orb--blue"   style={{ width: 360, height: 360, top: -160, left: "5%"   }} />
          <div className="orb orb--purple" style={{ width: 320, height: 320, bottom: -140, right: "8%" }} />
          <div className="orb orb--cyan"   style={{ width: 280, height: 280, top: 0, right: "30%"    }} />

          {/* Floating live badge */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <span className="floating-badge">
              <span className="floating-badge__dot" />
              Ready to transform your workflow?
            </span>
          </div>

          <h2>
            Design once.{" "}
            <span className="grad-text">Generate in Tableau.</span>
            <br />
            Keep the afternoon.
          </h2>
          <p>
            Join professionals who export pixel-faithful Tableau workbooks directly from Figma.
            <br />No rebuilding. No hand-off friction.
          </p>
          <div className="cta-banner__actions">
            <a href={PLUGIN_URL} target="_blank" rel="noreferrer" className="btn btn--primary btn--lg">
              Get started free
              <ArrowRight size={18} strokeWidth={2.5} />
            </a>
            <Link to="/upgrade" className="btn btn--ghost btn--lg">
              <Sparkles size={16} />
              Buy Premium
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
