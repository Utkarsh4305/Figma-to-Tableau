import { Link } from "react-router-dom";
import Logo from "./Logo";
import { PLUGIN_URL, SUPPORT_EMAIL } from "../../config";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", to: "/#how-it-works" },
      { label: "Features", to: "/features" },
      { label: "Pricing", to: "/pricing" },
      { label: "Get the plugin", to: PLUGIN_URL, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", to: "/docs" },
      { label: "Blog", to: "/blog" },
      { label: "GitHub", to: "https://github.com", external: true },
      { label: "License activation", to: "/activate" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", to: "/contact" },
      { label: "Support", to: "/support" },
      { label: "Email us", to: `mailto:${SUPPORT_EMAIL}`, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <Logo />
            <p>
              Design once in Figma.
              <br />
              Generate Tableau dashboards in minutes.
            </p>
          </div>
          <div className="footer__cols">
            {COLUMNS.map((col) => (
              <div key={col.title} className="footer__col">
                <h4>{col.title}</h4>
                {col.links.map((l) =>
                  l.external ? (
                    <a key={l.label} href={l.to} target={l.to.startsWith("mailto") ? undefined : "_blank"} rel="noreferrer">
                      {l.label}
                    </a>
                  ) : (
                    <Link key={l.label} to={l.to}>
                      {l.label}
                    </Link>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="footer__bottom">
          <span>&copy; {new Date().getFullYear()} Pixelmentis. Not affiliated with Figma, Inc. or Salesforce/Tableau.</span>
          <span className="chip">
            <b>.twbx</b> Tableau 2026.2 ready
          </span>
        </div>
      </div>
    </footer>
  );
}
