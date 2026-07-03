import { motion } from "framer-motion";
import SectionHeading from "../components/ui/SectionHeading";
import CountUp from "../components/ui/CountUp";
import { stagger, fadeUp, viewportOnce } from "../lib/motion";

const STATS = [
  { value: <CountUp to={90} suffix="%" />, label: "less manual rebuild work", note: "layouts arrive done—you bind data, not draw zones" },
  { value: <CountUp to={10} suffix="×" />, label: "faster design iterations", note: "change the Figma file, re-export, done" },
  { value: <>1:1</>, label: "pixel-faithful layouts", note: "geometry, colors and text land where the design says" },
  { value: <CountUp to={3} />, label: "export modes", note: "floating, tiled, or single-image dashboards" },
];

const AUDIENCE = [
  "Tableau Developers",
  "BI Engineers",
  "Analytics Engineers",
  "Data Analysts",
  "Dashboard Designers",
  "Consulting Teams",
  "Enterprise BI",
  "Design Systems Teams",
];

export default function Benefits() {
  return (
    <section className="section section--tight" id="benefits">
      <div className="orb orb--orange" style={{ width: 350, height: 350, top: 100, left: "-5%" }} />
      <div className="container">
        <SectionHeading
          eyebrow="Why teams switch"
          title={
            <>
              The handoff that used to take <span className="grad-text">weeks</span>
            </>
          }
          blurb="Design-to-dashboard automation turns the slowest step of BI delivery into a click."
        />
        <motion.div
          className="stats"
          variants={stagger(0, 0.1)}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
        >
          {STATS.map((s) => (
            <motion.div key={s.label} className="stat" variants={fadeUp}>
              <span className="stat__value grad-text">{s.value}</span>
              <span className="stat__label">{s.label}</span>
              <span className="stat__note">{s.note}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="audience"
          variants={stagger(0.1, 0.05)}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
        >
          <span className="audience__label">Built for</span>
          {AUDIENCE.map((a) => (
            <motion.span key={a} className="audience__pill" variants={fadeUp}>
              {a}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
