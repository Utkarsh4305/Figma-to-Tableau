import { motion } from "framer-motion";
import { Zap } from "lucide-react";

/**
 * The conversion beam between the Figma frame and the Tableau dashboard:
 * a gradient rail with energy pulses travelling along it and a glowing
 * one-click badge at its center.
 */
export default function FlowBeam() {
  return (
    <div className="beam" aria-hidden="true">
      <svg viewBox="0 0 160 60" className="beam__svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="beam-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#dcd3f0" stopOpacity="0.2" />
            <stop offset="0.5" stopColor="#7a6fa2" />
            <stop offset="1" stopColor="#cce1f2" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <line x1="0" y1="30" x2="160" y2="30" stroke="url(#beam-g)" strokeWidth="2" />
        <line x1="0" y1="30" x2="160" y2="30" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeDasharray="3 14" className="beam__dash" />
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            r="3"
            cy="30"
            fill="#7a6fa2"
            initial={{ cx: -6, opacity: 0 }}
            animate={{ cx: 166, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.2, delay: i * 0.75, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </svg>
      <div className="beam__badge">
        <Zap size={14} strokeWidth={2.5} />
        <span>one-click export</span>
      </div>
    </div>
  );
}
