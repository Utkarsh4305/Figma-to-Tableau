import { motion } from "framer-motion";

/**
 * A stylized light-mode Figma canvas: a selected dashboard frame whose layers
 * use the plugin's real naming syntax (KPI/, SHEET/, FILTER/, Nav/).
 * Everything is wireframe-dashed on purpose — this is the *design*, not the
 * result.
 */
export default function FigmaFrame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 320" className={className} role="img" aria-label="A dashboard designed in Figma">
      <defs>
        <linearGradient id="ff-sel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a6fa2" />
          <stop offset="1" stopColor="#a79ccb" />
        </linearGradient>
      </defs>

      {/* Canvas */}
      <rect width="400" height="320" rx="18" fill="#f1f3f7" stroke="rgba(31,33,37,0.08)" />
      {/* Figma toolbar dots */}
      <circle cx="22" cy="20" r="4" fill="#f0bdc2" />
      <circle cx="38" cy="20" r="4" fill="#dcd3f0" />
      <circle cx="54" cy="20" r="4" fill="#cce1f2" />
      <text x="378" y="24" textAnchor="end" fontFamily="SF Mono, Consolas, monospace" fontSize="10" fill="#969ca9">
        dashboard.fig
      </text>

      {/* Selected frame */}
      <rect x="28" y="44" width="344" height="252" rx="8" fill="#ffffff" stroke="url(#ff-sel)" strokeWidth="1.6" />
      {/* Selection handles */}
      {[
        [28, 44],
        [372, 44],
        [28, 296],
        [372, 296],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 3.5} y={y - 3.5} width="7" height="7" rx="1.5" fill="#fff" stroke="#7a6fa2" strokeWidth="1.5" />
      ))}
      <text x="30" y="38" fontFamily="SF Mono, Consolas, monospace" fontSize="10.5" fill="#5f5580">
        Frame: Clinical Overview
      </text>

      {/* KPI row — three wireframe cards with layer tags */}
      {[44, 152, 260].map((x, i) => (
        <g key={x}>
          <rect x={x} y="62" width="96" height="52" rx="6" fill="#f0ecf9" stroke="rgba(122,111,162,0.5)" strokeDasharray="4 3" />
          <rect x={x + 10} y="74" width="42" height="9" rx="2" fill="rgba(31,33,37,0.28)" />
          <rect x={x + 10} y="90" width="64" height="6" rx="2" fill="rgba(31,33,37,0.12)" />
          <text x={x} y="58" fontFamily="SF Mono, Consolas, monospace" fontSize="9" fill="#5f5580">
            {["KPI/Enrolled", "KPI/Sites", "KPI/Retention"][i]}
          </text>
        </g>
      ))}

      {/* Main chart area */}
      <rect x="44" y="130" width="200" height="112" rx="6" fill="#f0ecf9" stroke="rgba(122,111,162,0.5)" strokeDasharray="4 3" />
      <text x="44" y="126" fontFamily="SF Mono, Consolas, monospace" fontSize="9" fill="#5f5580">
        SHEET/Enrollment Trend
      </text>
      {/* wireframe line sketch */}
      <path
        d="M56 224 L86 200 L116 208 L146 178 L176 186 L206 158 L232 164"
        fill="none"
        stroke="rgba(31,33,37,0.35)"
        strokeWidth="1.6"
        strokeDasharray="5 4"
      />
      <circle cx="146" cy="178" r="3" fill="none" stroke="rgba(31,33,37,0.45)" />

      {/* Side panel: filter + bar sketch */}
      <rect x="256" y="130" width="100" height="50" rx="6" fill="#f0ecf9" stroke="rgba(122,111,162,0.5)" strokeDasharray="4 3" />
      <text x="256" y="126" fontFamily="SF Mono, Consolas, monospace" fontSize="9" fill="#5f5580">
        FILTER/Region
      </text>
      <rect x="266" y="142" width="80" height="8" rx="4" fill="rgba(31,33,37,0.15)" />
      <rect x="266" y="158" width="56" height="8" rx="4" fill="rgba(31,33,37,0.09)" />

      <rect x="256" y="192" width="100" height="50" rx="6" fill="#f0ecf9" stroke="rgba(122,111,162,0.5)" strokeDasharray="4 3" />
      <text x="256" y="188" fontFamily="SF Mono, Consolas, monospace" fontSize="9" fill="#5f5580">
        SHEET/By Site
      </text>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={266 + i * 26} y={230 - i * 9 - 8} width="16" height={i * 9 + 8} rx="2" fill="rgba(31,33,37,0.18)" />
      ))}

      {/* Nav button layer */}
      <rect x="44" y="256" width="88" height="26" rx="6" fill="#f0ecf9" stroke="rgba(122,111,162,0.5)" strokeDasharray="4 3" />
      <text x="44" y="252" fontFamily="SF Mono, Consolas, monospace" fontSize="9" fill="#5f5580">
        Nav/Details
      </text>
      <rect x="56" y="266" width="52" height="6" rx="3" fill="rgba(31,33,37,0.3)" />

      {/* Live cursor */}
      <motion.g
        initial={false}
        animate={{ x: [0, 60, 42, 0], y: [0, -26, 12, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      >
        <path d="M300 250 l6 16 3.5-6.5 7-2z" fill="#25282d" stroke="#fff" strokeWidth="1" />
        <rect x="312" y="262" width="34" height="15" rx="4" fill="#25282d" />
        <text x="329" y="273" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9.5" fontWeight="700" fill="#ffffff">
          you
        </text>
      </motion.g>
    </svg>
  );
}
