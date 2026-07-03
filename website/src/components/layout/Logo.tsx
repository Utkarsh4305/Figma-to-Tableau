import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Figma to Tableau — home">
      <span className="logo__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 36 36" fill="none">
          <rect x="3" y="3" width="13" height="13" rx="3.5" stroke="white" strokeWidth="2.5" />
          <path d="M18 9.5h7.5m0 0-3-3m3 3-3 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="20" y="22" width="3.5" height="10" rx="1.2" fill="white" opacity="0.9" />
          <rect x="25.5" y="18" width="3.5" height="14" rx="1.2" fill="white" opacity="0.7" />
          <rect x="31" y="25" width="3.5" height="7" rx="1.2" fill="white" opacity="0.5" />
        </svg>
      </span>
      <span>
        Figma <em>to</em> Tableau
      </span>
    </Link>
  );
}
