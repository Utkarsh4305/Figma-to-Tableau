import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import Reveal from "../components/ui/Reveal";
import { PLUGIN_URL } from "../config";

export default function CtaBanner() {
  return (
    <section className="section section--tight">
      <div className="container">
        <Reveal className="cta-banner noise">
          <div className="bg-grid" />
          <div className="orb orb--blue" style={{ width: 380, height: 380, top: -140, left: "10%" }} />
          <div className="orb orb--violet" style={{ width: 380, height: 380, bottom: -160, right: "8%" }} />
          <h2>
            Ship your next dashboard
            <br />
            <span className="grad-text">in minutes, not weeks.</span>
          </h2>
          <p>Design once in Figma. Generate the Tableau workbook. Keep the afternoon.</p>
          <div className="cta-banner__actions">
            <a href={PLUGIN_URL} target="_blank" rel="noreferrer" className="btn btn--primary btn--lg">
              Get started free
              <ArrowRight size={17} strokeWidth={2.2} />
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
