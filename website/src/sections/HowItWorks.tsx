import { motion } from "framer-motion";
import { Figma, MousePointerClick, LayoutDashboard, Rocket } from "lucide-react";
import SectionHeading from "../components/ui/SectionHeading";
import { stagger, fadeUp, viewportOnce } from "../lib/motion";

const STEPS = [
  {
    icon: Figma,
    title: "Design in Figma",
    text: "Lay out your dashboard like any other design. Name layers with the plugin grammar to say what each block becomes.",
    hue: "blue" as const,
    num: "01",
  },
  {
    icon: MousePointerClick,
    title: "Run the plugin",
    text: "Select one frame or many. The plugin reads geometry, colors, text and prototype links—your file never leaves Figma.",
    hue: "purple" as const,
    num: "02",
  },
  {
    icon: LayoutDashboard,
    title: "Generate workbook",
    text: "Get a real .twbx: pixel-faithful zones, worksheets, quick filters and native navigation buttons.",
    hue: "cyan" as const,
    num: "03",
  },
  {
    icon: Rocket,
    title: "Publish & iterate",
    text: "Open in Tableau, bind your data sources, and publish. Change the design and re-export in one click.",
    hue: "vermilion" as const,
    num: "04",
  },
];

export default function HowItWorks() {
  return (
    <section className="section how-it-works" id="how-it-works">
      <div className="orb orb--blue" style={{ width: 480, height: 480, top: -120, left: "-8%" }} />
      <div className="orb orb--purple" style={{ width: 360, height: 360, bottom: 0, right: "-4%" }} />
      <div className="container">
        <SectionHeading
          center
          eyebrow="How it works"
          title={
            <>
              From canvas to workbook in{" "}
              <span className="grad-text">four simple steps.</span>
            </>
          }
          blurb="A workflow that respects both crafts: designers stay in Figma, developers get real Tableau artifacts."
        />
        <div className="timeline">
          {/* Thread connecting the four step nodes, drawn in on scroll */}
          <div className="timeline__path" aria-hidden="true">
            {/* observer must sit on the rendered <svg>; the mask rect inside
                <defs> is never "in view" on its own */}
            <motion.svg
              viewBox="0 0 1000 4"
              preserveAspectRatio="none"
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
            >
              <defs>
                {/* userSpaceOnUse: bbox gradients vanish on zero-height (horizontal) lines */}
                <linearGradient id="tl-grad" gradientUnits="userSpaceOnUse" x1="125" y1="0" x2="875" y2="0">
                  <stop offset="0" stopColor="#0d9488" />
                  <stop offset="0.45" stopColor="#e58ab5" />
                  <stop offset="1" stopColor="#00d9a0" />
                </linearGradient>
                {/* explicit region: the default %-of-bbox mask region collapses on a zero-height line */}
                <mask id="tl-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="4">
                  <motion.rect
                    x="0"
                    y="0"
                    height="4"
                    fill="#fff"
                    variants={{ hidden: { width: 0 }, show: { width: 1000 } }}
                    transition={{ duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  />
                </mask>
              </defs>
              <path
                d="M125 2 H875"
                stroke="url(#tl-grad)"
                strokeWidth="3"
                strokeDasharray="7 9"
                strokeLinecap="round"
                opacity="0.7"
                mask="url(#tl-mask)"
              />
            </motion.svg>
          </div>

          <motion.div
            className="timeline__steps"
            variants={stagger(0, 0.12)}
            initial="hidden"
            whileInView="show"
            viewport={viewportOnce}
          >
            {STEPS.map((s) => (
              <motion.div key={s.title} className="timeline__step" variants={fadeUp}>
                <div className={`timeline__node timeline__node--${s.hue}`}>
                  {s.num}
                </div>
                <div className="timeline__icon">
                  <s.icon size={26} strokeWidth={1.5} />
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
