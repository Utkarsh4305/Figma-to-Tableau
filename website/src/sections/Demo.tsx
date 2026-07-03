import { motion } from "framer-motion";
import { ArrowRight, BarChart3, LineChart, PieChart, Table2, SlidersHorizontal, Type, TrendingUp, TrendingDown } from "lucide-react";
import SectionHeading from "../components/ui/SectionHeading";
import Reveal from "../components/ui/Reveal";
import CountUp from "../components/ui/CountUp";

const COMPONENTS = [
  { icon: BarChart3,          label: "KPI Card",    value: "$128.4K", wide: false },
  { icon: LineChart,          label: "Line Chart",  value: "+12.5%",  wide: true  },
  { icon: PieChart,           label: "Donut Chart", value: "84%",     wide: false },
  { icon: SlidersHorizontal,  label: "Filter",      value: "Region",  wide: false },
  { icon: Table2,             label: "Table",       value: "42 rows", wide: false },
  { icon: Type,               label: "Text Block",  value: "Q3 Overview", wide: false },
];

const KPI_DATA = [
  { label: "Revenue",    value: 128400, prefix: "$", suffix: "",  decimals: 0, change: "+18.4%", up: true },
  { label: "New Users",  value: 8347,   prefix: "",  suffix: "",  decimals: 0, change: "+7.1%",  up: true },
  { label: "Churn Rate", value: 1.2,    prefix: "",  suffix: "%", decimals: 1, change: "-0.3%",  up: false },
];

const BARS = [0.85, 0.62, 0.74, 0.43, 0.91, 0.56, 0.78];

export default function Demo() {
  return (
    <section className="section" id="demo" style={{ background: "linear-gradient(180deg, #edf8f0 0%, #fbf8f1 100%)" }}>
      <div className="orb orb--cyan"   style={{ width: 360, height: 360, top: 60,    left: "-4%"  }} />
      <div className="orb orb--orange" style={{ width: 280, height: 280, bottom: 60, right: "6%"  }} />
      <div className="container">
        <SectionHeading
          center
          eyebrow="Try it live"
          title={
            <>
              Your canvas, your{" "}
              <span className="grad-text">Tableau.</span>
            </>
          }
          blurb="Drag components onto the builder, arrange them how you want, and watch the Tableau preview update in real time."
        />
        <Reveal>
          <div className="playground">
            {/* ── Left: info ── */}
            <div className="playground__info">
              <h3 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 16 }}>
                Build dashboards
                <br />
                <span className="grad-text">in minutes.</span>
              </h3>
              <p>
                Name layers, drag components, and export. Every change in Figma becomes a live
                Tableau update — no manual rebuilding, no data binding delay.
              </p>
              <a href="#cta" className="btn btn--primary" style={{ marginTop: 8 }}>
                Get started free <ArrowRight size={16} strokeWidth={2.5} />
              </a>
              <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
                {["Floating, tiled, or image export", "Native navigation buttons", "Real worksheet swap"].map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-dim)" }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "rgba(244,81,44,0.08)", border: "1.5px solid rgba(244,81,44,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--accent)", flexShrink: 0, fontSize: 12, fontWeight: 700
                    }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Center: drag builder ── */}
            <div className="playground__builder">
              <div className="playground__builder-header">
                <span className="playground__builder-title">Drag components</span>
                <div className="playground__builder-actions">
                  <span style={{ background: "#ff5f56" }} />
                  <span style={{ background: "#ffbd2e" }} />
                  <span style={{ background: "#27c93f" }} />
                </div>
              </div>
              <div className="playground__grid">
                {COMPONENTS.map((c) => (
                  <motion.div
                    key={c.label}
                    className={`playground__card ${c.wide ? "playground__card--wide" : ""}`}
                    whileHover={{ y: -4, rotate: -0.6, boxShadow: "0 10px 36px rgba(244,81,44,0.14)" }}
                    whileTap={{ scale: 0.97 }}
                    drag
                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    dragElastic={0.1}
                  >
                    <div className="playground__card-header">
                      <c.icon size={14} strokeWidth={2} style={{ color: "var(--accent)" }} />
                      <span className="playground__card-label">{c.label}</span>
                    </div>
                    <div className="playground__card-value">{c.value}</div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* ── Right: live preview panel ── */}
            <div className="playground__preview">
              <div className="playground__preview-header">
                <span className="playground__preview-title">Tableau Preview</span>
                <span className="playground__preview-status">
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px var(--green)", display: "inline-block" }} />
                  Live
                </span>
              </div>

              <div className="playground__preview-content">
                {/* KPI row */}
                <div className="playground__kpi-row">
                  {KPI_DATA.map((k) => (
                    <div key={k.label} className="playground__kpi">
                      <div className="playground__kpi-label">{k.label}</div>
                      <div className="playground__kpi-value">
                        <CountUp to={k.value} prefix={k.prefix} suffix={k.suffix} decimals={k.decimals} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: k.up ? "#0aa268" : "#e14b4b", display: "flex", alignItems: "center", gap: 3 }}>
                        {k.up
                          ? <TrendingUp size={11} strokeWidth={2.5} />
                          : <TrendingDown size={11} strokeWidth={2.5} />}
                        {k.change}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bar chart */}
                <div className="playground__chart">
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)", marginBottom: 10 }}>
                    Monthly Revenue
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 68 }}>
                    {BARS.map((h, i) => (
                      <motion.div
                        key={i}
                        style={{
                          flex: 1, borderRadius: "4px 4px 0 0",
                          background: "linear-gradient(180deg, var(--accent) 0%, var(--amber) 100%)",
                          height: `${h * 100}%`,
                          opacity: 0.7 + h * 0.3,
                        }}
                        initial={{ scaleY: 0, originY: 1 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
