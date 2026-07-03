import { motion } from "framer-motion";
import { Figma, MousePointerClick, LayoutDashboard, Rocket, ArrowRight } from "lucide-react";
import SectionHeading from "../components/ui/SectionHeading";
import { stagger, fadeUp, viewportOnce } from "../lib/motion";

const STEPS = [
  {
    icon: Figma,
    title: "Design in Figma",
    text: "Lay out your dashboard like any other design. Name layers with the plugin grammar — SHEET/, KPI/, FILTER/, Nav/ — to say what each block becomes.",
    tag: "SHEET/Revenue Trend",
  },
  {
    icon: MousePointerClick,
    title: "Run the plugin",
    text: "Select one frame or many. The plugin reads geometry, colors, text and prototype links — your file never leaves Figma.",
    tag: "3 frames → 3 dashboards",
  },
  {
    icon: LayoutDashboard,
    title: "Generate the workbook",
    text: "Get a real .twbx: pixel-faithful zones, worksheets, quick filters and native navigation buttons. Floating, tiled or image mode.",
    tag: "export.twbx",
  },
  {
    icon: Rocket,
    title: "Fine-tune & publish",
    text: "Open in Tableau, bind your data sources, and publish to Server or Cloud. The layout work is already done.",
    tag: "Tableau 2026.2",
  },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how-it-works">
      <div className="container">
        <SectionHeading
          center
          eyebrow="How it works"
          title={
            <>
              From canvas to workbook in <span className="grad-text">four steps</span>
            </>
          }
          blurb="A workflow that respects both crafts: designers stay in Figma, developers get real Tableau artifacts."
        />
        <motion.ol
          className="steps"
          variants={stagger(0, 0.14)}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
        >
          {STEPS.map((s, i) => (
            <motion.li key={s.title} className="step glass glass--hover" variants={fadeUp}>
              <div className="step__head">
                <span className="step__icon">
                  <s.icon size={20} strokeWidth={1.8} />
                </span>
                <span className="step__num">0{i + 1}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className="chip">
                <b>{s.tag}</b>
              </span>
              {i < STEPS.length - 1 && (
                <span className="step__arrow" aria-hidden="true">
                  <ArrowRight size={18} />
                </span>
              )}
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
