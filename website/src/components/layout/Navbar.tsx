import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Sparkles } from "lucide-react";
import Logo from "./Logo";
import { PLUGIN_URL } from "../../config";

const LINKS = [
  { label: "How it works", to: "/#how-it-works" },
  { label: "Features", to: "/#features" },
  { label: "Demo", to: "/#demo" },
  { label: "Pricing", to: "/pricing" },
  { label: "Docs", to: "/docs" },
  { label: "FAQ", to: "/#faq" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile drawer whenever the route (or hash) changes.
  useEffect(() => setOpen(false), [location]);

  return (
    <header className={`nav ${scrolled ? "nav--scrolled" : ""}`}>
      <div className="container nav__inner">
        <Logo />
        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.label} to={l.to} className="nav__link">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav__actions">
          <a href={PLUGIN_URL} target="_blank" rel="noreferrer" className="btn btn--quiet">
            Get the plugin
          </a>
          <Link to="/upgrade" className="btn btn--primary">
            <Sparkles size={15} strokeWidth={2.2} />
            Buy Premium
          </Link>
        </div>
        <button
          className="nav__burger"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="nav__drawer">
          {LINKS.map((l) => (
            <Link key={l.label} to={l.to} className="nav__link">
              {l.label}
            </Link>
          ))}
          <Link to="/upgrade" className="btn btn--primary">
            Buy Premium
          </Link>
        </div>
      )}
    </header>
  );
}
