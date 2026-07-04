import { motion } from "framer-motion";
import { viewportOnce } from "../../lib/motion";

const BARS = [34, 52, 41, 66, 58, 82];

/**
 * The generated result: a light, Tableau-styled workbook using the Tableau 10
 * palette. Bars grow and the trend line draws itself when scrolled into view.
 */
export default function TableauDashboard({ className }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 400 320"
      className={className}
      role="img"
      aria-label="The generated Tableau dashboard"
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
    >
      <defs>
        <linearGradient id="td-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0d9488" />
          <stop offset="1" stopColor="#00d9a0" />
        </linearGradient>
      </defs>

      {/* Workbook window */}
      <rect width="400" height="320" rx="18" fill="#f4fbf9" />
      <rect width="400" height="34" rx="18" fill="#e7f5f1" />
      <rect x="0" y="17" width="400" height="17" fill="#e7f5f1" />
      <text x="18" y="22" fontFamily="Satoshi, sans-serif" fontSize="11" fontWeight="700" fill="#122320">
        Clinical Overview
      </text>
      <text x="382" y="22" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="9.5" fill="#8fa39c">
        .twbx
      </text>

      {/* KPI row */}
      {[
        { x: 16, v: "1,284", l: "Enrolled", c: "#0d9488" },
        { x: 146, v: "42", l: "Active Sites", c: "#a67c52" },
        { x: 276, v: "94.2%", l: "Retention", c: "#00d9a0" },
      ].map((k) => (
        <g key={k.l}>
          <rect x={k.x} y="48" width="108" height="56" rx="9" fill="#fff" stroke="#dce8e4" />
          <rect x={k.x} y="48" width="3.5" height="56" rx="1.75" fill={k.c} />
          <text x={k.x + 14} y="76" fontFamily="Clash Display, sans-serif" fontSize="17" fontWeight="600" fill="#122320">
            {k.v}
          </text>
          <text x={k.x + 14} y="93" fontFamily="Satoshi, sans-serif" fontSize="9.5" fill="#52645f">
            {k.l}
          </text>
        </g>
      ))}

      {/* Trend line sheet */}
      <rect x="16" y="116" width="238" height="128" rx="9" fill="#fff" stroke="#dce8e4" />
      <text x="30" y="136" fontFamily="Satoshi, sans-serif" fontSize="10" fontWeight="700" fill="#122320">
        Enrollment Trend
      </text>
      {[152, 176, 200, 224].map((y) => (
        <line key={y} x1="30" y1={y} x2="240" y2={y} stroke="#e7f5f1" />
      ))}
      <motion.path
        d="M32 224 L66 202 L100 210 L134 180 L168 188 L202 158 L238 148"
        fill="none"
        stroke="url(#td-line)"
        strokeWidth="2.4"
        strokeLinecap="round"
        variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1 } }}
        transition={{ duration: 1.6, delay: 0.3, ease: "easeInOut" }}
      />
      <motion.circle
        cx="238"
        cy="148"
        r="4"
        fill="#00d9a0"
        variants={{ hidden: { scale: 0, opacity: 0 }, show: { scale: 1, opacity: 1 } }}
        transition={{ delay: 1.9, type: "spring", stiffness: 300, damping: 15 }}
        style={{ transformOrigin: "238px 148px" }}
      />

      {/* Filter card */}
      <rect x="266" y="116" width="118" height="54" rx="9" fill="#fff" stroke="#dce8e4" />
      <text x="278" y="134" fontFamily="Satoshi, sans-serif" fontSize="10" fontWeight="700" fill="#122320">
        Region
      </text>
      <rect x="278" y="142" width="94" height="16" rx="5" fill="#e7f5f1" stroke="#d7e6e1" />
      <text x="286" y="153.5" fontFamily="Satoshi, sans-serif" fontSize="9" fill="#52645f">
        (All)
      </text>
      <path d="M362 146 l4 5 4-5" fill="none" stroke="#52645f" strokeWidth="1.4" />

      {/* Bar sheet */}
      <rect x="266" y="182" width="118" height="62" rx="9" fill="#fff" stroke="#dce8e4" />
      <text x="278" y="200" fontFamily="Satoshi, sans-serif" fontSize="10" fontWeight="700" fill="#122320">
        By Site
      </text>
      {[46, 30, 38].map((w, i) => (
        <motion.rect
          key={i}
          x="278"
          y={206 + i * 11}
          height="7"
          rx="2.5"
          width={w}
          fill={["#0d9488", "#a67c52", "#d9689f"][i]}
          variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1 } }}
          transition={{ duration: 0.7, delay: 0.5 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "278px 0px" }}
        />
      ))}

      {/* Bottom bar chart + nav button */}
      <rect x="16" y="256" width="238" height="48" rx="9" fill="#fff" stroke="#dce8e4" />
      {BARS.map((h, i) => (
        <motion.rect
          key={i}
          x={34 + i * 36}
          y={298 - h * 0.4}
          width="18"
          height={h * 0.4}
          rx="2.5"
          fill="#0d9488"
          opacity={0.55 + (i / BARS.length) * 0.45}
          variants={{ hidden: { scaleY: 0 }, show: { scaleY: 1 } }}
          transition={{ duration: 0.6, delay: 0.4 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: `0px 298px` }}
        />
      ))}
      <rect x="266" y="256" width="118" height="48" rx="9" fill="#0d9488" />
      <text x="325" y="284" textAnchor="middle" fontFamily="Satoshi, sans-serif" fontSize="11" fontWeight="700" fill="#fff">
        View Details →
      </text>
    </motion.svg>
  );
}
