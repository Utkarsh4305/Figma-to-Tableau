import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Pixelmentis — home">
      <span className="logo__icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="navLogoBadge" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0d9488" />
              <stop offset="1" stopColor="#00d9a0" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="16" fill="url(#navLogoBadge)" />
          <rect x="17.5" y="32" width="7.5" height="15" rx="2.6" fill="#ffffff" opacity="0.55" />
          <rect x="28.25" y="25" width="7.5" height="22" rx="2.6" fill="#ffffff" opacity="0.78" />
          <rect x="39" y="18" width="7.5" height="29" rx="2.6" fill="#ffffff" />
          <circle cx="42.75" cy="12.5" r="3.4" fill="#c6fff0" />
        </svg>
      </span>
      <span>
        Pixel<em>mentis</em>
      </span>
    </Link>
  );
}
