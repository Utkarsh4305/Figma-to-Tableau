import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import FigmaFrame from "../components/illustrations/FigmaFrame";
import TableauDashboard from "../components/illustrations/TableauDashboard";
import FlowBeam from "../components/illustrations/FlowBeam";
import { PLUGIN_URL, FREE_EXPORT_LIMIT } from "../config";

const entrance = (delay: number) => ({
  initial: { opacity: 0, y: 26 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] as const },
});

/** Floating syntax chips around the scene — the plugin's actual layer grammar. */
const CHIPS = [
  { text: "SHEET/", accent: "Revenue Trend", top: "6%", left: "-3%", dur: 7 },
  { text: "KPI/", accent: "Total Sales", top: "72%", left: "2%", dur: 9 },
  { text: "Nav/", accent: "Details", top: "12%", left: "88%", dur: 8 },
  { text: ".twbx", accent: "2026.2", top: "78%", left: "86%", dur: 6.5 },
];

export default function Hero() {
  const sceneRef = useRef<HTMLDivElement>(null);

  // Mouse parallax: tilt the scene a few degrees toward the cursor.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [4, -4]), { stiffness: 120, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), { stiffness: 120, damping: 20 });

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <section className="hero noise" onMouseMove={onMouseMove}>
      <div className="bg-grid" />
      <div className="orb orb--blue" style={{ width: 560, height: 560, top: -180, left: "8%" }} />
      <div className="orb orb--violet" style={{ width: 520, height: 520, top: -120, right: "4%" }} />
      <div className="orb orb--cyan" style={{ width: 420, height: 420, top: 420, left: "42%" }} />

      <div className="container hero__inner">
        <motion.span className="eyebrow" {...entrance(0)}>
          <span className="dot" />
          The Figma plugin for Tableau professionals
        </motion.span>

        <motion.h1 className="hero__title" {...entrance(0.08)}>
          Design Tableau dashboards in Figma.
          <br />
          <span className="grad-text">Generate them instantly.</span>
        </motion.h1>

        <motion.p className="hero__sub" {...entrance(0.16)}>
          Stop rebuilding layouts by hand. Name your layers, run the plugin, and get a real{" "}
          <code>.twbx</code> workbook — pixel-faithful zones, worksheets, filters and navigation,
          ready to bind to your data.
        </motion.p>

        <motion.div className="hero__ctas" {...entrance(0.24)}>
          <a href={PLUGIN_URL} target="_blank" rel="noreferrer" className="btn btn--primary btn--lg">
            Get started free
            <ArrowRight size={17} strokeWidth={2.2} />
          </a>
          <Link to="/upgrade" className="btn btn--ghost btn--lg">
            <Sparkles size={16} />
            Buy Premium
          </Link>
          <a href="#demo" className="btn btn--quiet btn--lg">
            <Play size={15} fill="currentColor" />
            Watch it work
          </a>
        </motion.div>

        <motion.p className="hero__trust" {...entrance(0.3)}>
          {FREE_EXPORT_LIMIT} free exports · No credit card · Tableau 2026.2 ready
        </motion.p>

        {/* The transformation scene */}
        <motion.div
          className="hero__scene"
          ref={sceneRef}
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ perspective: 1400 }}
        >
          <motion.div className="hero__stage" style={{ rotateX: rx, rotateY: ry }}>
            <div className="hero__panel hero__panel--figma">
              <FigmaFrame className="hero__svg" />
              <span className="hero__panel-label">Your Figma design</span>
            </div>
            <FlowBeam />
            <div className="hero__panel hero__panel--tableau">
              <TableauDashboard className="hero__svg" />
              <span className="hero__panel-label">Generated Tableau workbook</span>
            </div>

            {CHIPS.map((c) => (
              <motion.span
                key={c.text + c.accent}
                className="chip hero__chip"
                style={{ top: c.top, left: c.left }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
              >
                <b>{c.text}</b>
                {c.accent}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
