import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <section className="page page--placeholder noise">
      <div className="bg-grid" />
      <div className="container container--narrow">
        <div className="placeholder glass">
          <span className="eyebrow">
            <span className="dot" />
            404
          </span>
          <h1>
            This zone didn't make it <span className="grad-text">into the workbook</span>
          </h1>
          <p>The page you're looking for doesn't exist (yet).</p>
          <div className="placeholder__actions">
            <Link to="/" className="btn btn--primary">
              <ArrowLeft size={16} />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
