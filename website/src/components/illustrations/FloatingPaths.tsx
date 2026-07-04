import { motion } from "framer-motion";

/**
 * Flowing gradient beams that weave behind the two hero windows — the visual
 * metaphor for design flowing into a workbook. Each beam draws itself in,
 * then a small light pulse travels its length forever (SMIL animateMotion,
 * zero JS per frame).
 */
const BEAMS = [
  {
    d: "M-20,120 C160,30 400,60 620,210",
    gradient: "beam-blue",
    delay: 0.5,
    pulse: "#0d9488",
    pulseDur: "7s",
    pulseDelay: "1.4s",
  },
  {
    d: "M-20,250 C180,190 430,170 620,330",
    gradient: "beam-purple",
    delay: 0.9,
    pulse: "#e58ab5",
    pulseDur: "9s",
    pulseDelay: "2.6s",
  },
  {
    d: "M-20,400 C220,360 400,440 620,410",
    gradient: "beam-orange",
    delay: 1.3,
    pulse: "#00d9a0",
    pulseDur: "8s",
    pulseDelay: "3.4s",
  },
];

export default function FloatingPaths() {
  return (
    <svg
      className="hero__beams"
      viewBox="0 0 600 500"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="beam-blue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0d9488" stopOpacity="0" />
          <stop offset="0.5" stopColor="#0d9488" />
          <stop offset="1" stopColor="#e58ab5" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="beam-purple" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e58ab5" stopOpacity="0" />
          <stop offset="0.5" stopColor="#dd6fe6" />
          <stop offset="1" stopColor="#18a0fb" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="beam-orange" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#00d9a0" stopOpacity="0" />
          <stop offset="0.5" stopColor="#4de8c2" />
          <stop offset="1" stopColor="#00d9a0" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {BEAMS.map((b) => (
        <g key={b.d}>
          <motion.path
            d={b.d}
            fill="none"
            stroke={`url(#${b.gradient})`}
            strokeWidth="1.8"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.45 }}
            transition={{ duration: 2.2, delay: b.delay, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* travelling light pulse */}
          <circle r="3" fill={b.pulse} opacity="0.9">
            <animateMotion
              dur={b.pulseDur}
              begin={b.pulseDelay}
              repeatCount="indefinite"
              path={b.d}
            />
          </circle>
          <circle r="7" fill={b.pulse} opacity="0.18">
            <animateMotion
              dur={b.pulseDur}
              begin={b.pulseDelay}
              repeatCount="indefinite"
              path={b.d}
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}
