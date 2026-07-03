import { Link } from "react-router-dom";

/** Wordmark: a Figma-frame → bar-chart glyph plus the product name. */
export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Figma to Tableau — home">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4D8DFF" />
            <stop offset="0.55" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#3BD6FF" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="#10141f" />
        <rect x="12" y="12" width="18" height="18" rx="5" fill="none" stroke="url(#logo-g)" strokeWidth="3" />
        <path d="M33 21h10m0 0-4-4m4 4-4 4" stroke="url(#logo-g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="36" y="40" width="4" height="12" rx="1.5" fill="#4D8DFF" />
        <rect x="43" y="34" width="4" height="18" rx="1.5" fill="#8B5CF6" />
        <rect x="50" y="44" width="4" height="8" rx="1.5" fill="#3BD6FF" />
        <rect x="12" y="38" width="18" height="3" rx="1.5" fill="#2A3350" />
        <rect x="12" y="45" width="12" height="3" rx="1.5" fill="#2A3350" />
      </svg>
      <span>
        Figma <em>to</em> Tableau
      </span>
    </Link>
  );
}
