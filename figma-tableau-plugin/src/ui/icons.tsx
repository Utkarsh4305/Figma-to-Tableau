import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// icons.tsx — shared SVG icon set for the plugin UI. Every icon is a 24×24
// stroke glyph drawn in `currentColor`, so it inherits the text color of its
// container and scales via the width/height attributes (or CSS). The shared
// `svgProps` factory keeps stroke weight / caps identical across the UI.
// ---------------------------------------------------------------------------

/** Standard stroke-icon SVG attributes on the 24×24 grid. */
export const svgProps = (size = 24) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

// ── Top-level tab icons ──────────────────────────────────────────────────────

export const TAB_ICONS: Record<"dashboard" | "library" | "account", ReactNode> = {
  // Dashboard — 2×2 zone grid (a dashboard layout)
  dashboard: (
    <svg {...svgProps(14)}>
      <rect x="3" y="3" width="7.5" height="10" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
      <rect x="3" y="16" width="7.5" height="5" rx="1.5" />
    </svg>
  ),
  // Library — open book
  library: (
    <svg {...svgProps(14)}>
      <path d="M12 6.5C10.5 4.9 8.4 4 6 4H3v14h3c2.4 0 4.5.9 6 2.5 1.5-1.6 3.6-2.5 6-2.5h3V4h-3c-2.4 0-4.5.9-6 2.5z" />
      <path d="M12 6.5v14" />
    </svg>
  ),
  // Account — user in circle
  account: (
    <svg {...svgProps(14)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.2 18.4A6.5 6.5 0 0 1 12 15a6.5 6.5 0 0 1 5.8 3.4" />
    </svg>
  ),
};

// ── Library sub-tab icons ────────────────────────────────────────────────────

export const SUBTAB_ICONS: Record<"components" | "templates" | "syntax", ReactNode> = {
  // Components — square/circle/triangle shapes
  components: (
    <svg {...svgProps(12)}>
      <rect x="3" y="3" width="8" height="8" rx="1.2" />
      <circle cx="17" cy="17" r="4" />
      <path d="M7 14l4 7H3l4-7z" />
    </svg>
  ),
  // Templates — page with layout blocks
  templates: (
    <svg {...svgProps(12)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M10 9v12" />
    </svg>
  ),
  // Syntax — code brackets
  syntax: (
    <svg {...svgProps(12)}>
      <path d="M8 5L3 12l5 7" />
      <path d="M16 5l5 7-5 7" />
    </svg>
  ),
};

// ── Syntax-tab entry icons ───────────────────────────────────────────────────

export type SyntaxIconName =
  | "sheet" | "kpi" | "filter" | "nav" | "button" | "text" | "image" | "web"
  | "container" | "chart-tag" | "options" | "target";

export const SYNTAX_ICONS: Record<SyntaxIconName, ReactNode> = {
  // SHEET/ — bar chart
  sheet: (
    <svg {...svgProps(16)}>
      <path d="M3 21h18" />
      <rect x="5" y="12" width="3.5" height="6" rx="0.5" />
      <rect x="10.25" y="8" width="3.5" height="10" rx="0.5" />
      <rect x="15.5" y="4" width="3.5" height="14" rx="0.5" />
    </svg>
  ),
  // KPI/ — big number card
  kpi: (
    <svg {...svgProps(16)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h4M7 13.5l2-3v6M13.5 10.5a2 2 0 1 1 3.5 1.3l-3.5 4.2h4" />
    </svg>
  ),
  // FILTER/ — funnel
  filter: (
    <svg {...svgProps(16)}>
      <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
    </svg>
  ),
  // Nav/ — prototype arrow (node → node)
  nav: (
    <svg {...svgProps(16)}>
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
      <path d="M7.5 12h8M13 9.5l2.5 2.5-2.5 2.5" />
    </svg>
  ),
  // BUTTON/ — labelled button with arrow
  button: (
    <svg {...svgProps(16)}>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M9 12h6M13 9l3 3-3 3" />
    </svg>
  ),
  // TEXT/ — type glyph
  text: (
    <svg {...svgProps(16)}>
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  ),
  // Image/ — picture
  image: (
    <svg {...svgProps(16)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  // URL/ — globe
  web: (
    <svg {...svgProps(16)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </svg>
  ),
  // CONTAINER/ — nested boxes
  container: (
    <svg {...svgProps(16)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="4" rx="1" />
      <rect x="7" y="13" width="10" height="4" rx="1" />
    </svg>
  ),
  // [type] chart tag — tag label
  "chart-tag": (
    <svg {...svgProps(16)}>
      <path d="M3 5v6.6a2 2 0 0 0 .6 1.4l7.4 7.4a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L11.6 5.6A2 2 0 0 0 10.2 5H3z" transform="translate(1 -1)" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  // :options — sliders
  options: (
    <svg {...svgProps(16)}>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </svg>
  ),
  // > Target — crosshair target
  target: (
    <svg {...svgProps(16)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
};

// ── Account-tab row icons ────────────────────────────────────────────────────

export type AccountIconName = "plan" | "exports" | "sheets" | "storage" | "shield" | "info";

export const ACCOUNT_ICONS: Record<AccountIconName, ReactNode> = {
  // Plan — badge/star
  plan: (
    <svg {...svgProps(14)}>
      <path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.2l5.9-.9L12 3z" />
    </svg>
  ),
  // Exports — download arrow into tray
  exports: (
    <svg {...svgProps(14)}>
      <path d="M12 4v10m0 0l-4-4m4 4l4-4" />
      <path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2" />
    </svg>
  ),
  // Imported sheets — stacked sheets
  sheets: (
    <svg {...svgProps(14)}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
      <path d="M14 3v6h6" />
    </svg>
  ),
  // Storage — database
  storage: (
    <svg {...svgProps(14)}>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13" />
      <path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8" />
    </svg>
  ),
  // Privacy — shield
  shield: (
    <svg {...svgProps(14)}>
      <path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  // About — info circle
  info: (
    <svg {...svgProps(14)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
};
