import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Pixelmentis — home">
      <span className="logo__icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          {/* the plugin's launch icon, unchanged: matte charcoal squircle,
              chalk bars, one muted-lavender accent node */}
          <rect width="64" height="64" rx="16" fill="#25282d" />
          <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" stroke="#ffffff" strokeOpacity="0.16" />
          <rect x="17.5" y="32" width="7.5" height="15" rx="2.6" fill="#ffffff" opacity="0.42" />
          <rect x="28.25" y="25" width="7.5" height="22" rx="2.6" fill="#ffffff" opacity="0.7" />
          <rect x="39" y="18" width="7.5" height="29" rx="2.6" fill="#ffffff" />
          <circle cx="42.75" cy="12.5" r="3.4" fill="#c6b8f0" />
        </svg>
      </span>
      <span>
        Pixel<em>mentis</em>
      </span>
    </Link>
  );
}
