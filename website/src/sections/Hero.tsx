import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Check, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import FigmaFrame from "../components/illustrations/FigmaFrame";
import TableauDashboard from "../components/illustrations/TableauDashboard";
import FloatingPaths from "../components/illustrations/FloatingPaths";
import Particles from "../components/illustrations/Particles";
import { PLUGIN_URL, FREE_EXPORT_LIMIT } from "../config";

const entrance = (delay: number) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
});

const TRUST_BADGES = [
  { icon: TrendingUp, label: "50+ exports/day" },
  { icon: Users,      label: "Tableau professionals" },
  { icon: Zap,        label: "No rebuild needed" },
];

export default function Hero() {
  const sceneRef = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [2.5, -2.5]), { stiffness: 90, damping: 22 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-3.5, 3.5]), { stiffness: 90, damping: 22 });

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <section className="hero" onMouseMove={onMouseMove}>
      {/* Background orbs */}
      <div className="orb orb--blue"   style={{ width: 600, height: 600, top: -200, left: "-10%", opacity: 0.18 }} />
      <div className="orb orb--purple" style={{ width: 500, height: 500, top: -100, right: "5%",  opacity: 0.14 }} />
      <div className="orb orb--cyan"   style={{ width: 400, height: 400, top: 500,  left: "42%",  opacity: 0.12 }} />

      {/* Subtle dot grid */}
      <div className="bg-grid" />

      <Particles />

      <div className="container hero__inner">
        {/* ── Left: copy ── */}
        <div className="hero__left">
          <motion.span className="hero__eyebrow" {...entrance(0)}>
            <span className="dot" />
            The Figma plugin for Tableau professionals
          </motion.span>

          <motion.h1 className="hero__title" {...entrance(0.08)}>
            Design in{" "}
            <span className="word-figma">Figma.</span>
            <br />
            Generate in{" "}
            <span className="hero__accent">
              <span className="word-tableau">Tableau.</span>
              <svg className="hero__accent-swash" viewBox="0 0 220 24" aria-hidden="true">
                <motion.path
                  d="M8 17 C 62 7, 152 5, 212 13"
                  fill="none"
                  stroke="var(--orange)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.8 }}
                  transition={{ duration: 0.9, delay: 1, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p className="hero__sub" {...entrance(0.16)}>
            Stop rebuilding layouts by hand. Name your layers, run the plugin, and get a real{" "}
            <code>.twbx</code> workbook — pixel-faithful zones, worksheets, filters and navigation,
            ready to bind to your data.
          </motion.p>

          <motion.div className="hero__ctas" {...entrance(0.24)}>
            <a href={PLUGIN_URL} target="_blank" rel="noreferrer" className="btn btn--primary btn--lg">
              Get started free
              <ArrowRight size={18} strokeWidth={2.5} />
            </a>
            <Link to="/upgrade" className="btn btn--ghost btn--lg">
              <Sparkles size={16} />
              Buy Premium
            </Link>
          </motion.div>

          <motion.div className="hero__pills" {...entrance(0.3)}>
            <span className="hero__pill">
              <Check size={13} strokeWidth={2.5} /> No credit card
            </span>
            <span className="hero__pill">
              <Check size={13} strokeWidth={2.5} /> {FREE_EXPORT_LIMIT} free exports
            </span>
            <span className="hero__pill">
              <Check size={13} strokeWidth={2.5} /> Export to .twbx
            </span>
          </motion.div>

          {/* Trust strip */}
          <motion.div className="hero__trust" {...entrance(0.38)}>
            <span className="hero__trust-label">Trusted by</span>
            <div className="hero__trust-logos">
              {TRUST_BADGES.map((b) => (
                <span key={b.label} className="floating-badge" style={{ fontSize: 12 }}>
                  <b.icon size={14} strokeWidth={2} style={{ color: "var(--accent)" }} />
                  {b.label}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Right: scene ── */}
        <motion.div
          className="hero__scene"
          ref={sceneRef}
          initial={{ opacity: 0, x: 56 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ perspective: 1400 }}
        >
          <motion.div className="hero__stage" style={{ rotateX: rx, rotateY: ry }}>
            <motion.div
              className="hero__window hero__window--figma"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="hero__window-header">
                <div className="hero__window-dots">
                  <span className="hero__window-dot hero__window-dot--red" />
                  <span className="hero__window-dot hero__window-dot--yellow" />
                  <span className="hero__window-dot hero__window-dot--green" />
                </div>
                <span className="hero__window-title">Figma Design</span>
              </div>
              <div className="hero__window-body">
                <FigmaFrame className="hero__svg" />
              </div>
            </motion.div>

            <div className="hero__arrow">
              <motion.div
                className="hero__arrow-icon"
                animate={{ boxShadow: [
                  "0 6px 28px rgba(244,81,44,0.45)",
                  "0 6px 40px rgba(244,81,44,0.7)",
                  "0 6px 28px rgba(244,81,44,0.45)",
                ]}}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowRight size={22} strokeWidth={2.5} />
              </motion.div>
              <span className="hero__arrow-label">Generate</span>
            </div>

            <motion.div
              className="hero__window hero__window--tableau"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="hero__window-header">
                <div className="hero__window-dots">
                  <span className="hero__window-dot hero__window-dot--red" />
                  <span className="hero__window-dot hero__window-dot--yellow" />
                  <span className="hero__window-dot hero__window-dot--green" />
                </div>
                <span className="hero__window-title">Tableau Workbook</span>
              </div>
              <div className="hero__window-body">
                <TableauDashboard className="hero__svg" />
              </div>
            </motion.div>
          </motion.div>

          <FloatingPaths />

          {/* Floating confirmation badge */}
          <motion.div
            className="hero__generated-badge floating-badge"
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 1.7, type: "spring", stiffness: 220, damping: 18 }}
          >
            <motion.span
              className="hero__generated-check"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <Check size={11} strokeWidth={3} />
            </motion.span>
            Workbook generated
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
