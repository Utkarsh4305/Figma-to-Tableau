import { motion } from "framer-motion";
import {
  LayoutTemplate,
  Replace,
  Navigation,
  Layers,
  Type,
  Palette,
  Ruler,
  BrainCircuit,
} from "lucide-react";
import SectionHeading from "../components/ui/SectionHeading";
import { stagger, fadeUp, viewportOnce } from "../lib/motion";

const FEATURES = [
  {
    icon: LayoutTemplate,
    title: "Automatic layout conversion",
    text: "Every frame becomes a dashboard with pixel-faithful zones — floating, tiled, or a single-image mode when you just need the visual.",
    hue: "blue",
  },
  {
    icon: Replace,
    title: "Worksheet swapping",
    text: "Import an existing workbook and SHEET/ layers bind to your real worksheets — live charts and data land exactly where the design says.",
    hue: "violet",
  },
  {
    icon: Navigation,
    title: "Native navigation",
    text: "Figma prototype interactions become real Tableau navigation actions. Multi-page dashboard flows survive the export.",
    hue: "cyan",
  },
  {
    icon: Layers,
    title: "Multi-dashboard export",
    text: "Select N frames, get N dashboards in one workbook — shared data sources, deduplicated sheets, one download.",
    hue: "blue",
  },
  {
    icon: Type,
    title: "Text that never clips",
    text: "A text-fitting engine measures every string and normalizes fonts so Tableau renders your copy at the designed size — no overflow, no ellipsis.",
    hue: "violet",
  },
  {
    icon: Palette,
    title: "15 domain templates",
    text: "Clinical, sales, finance, operations, executive and more — production-grade starting points with per-domain palettes.",
    hue: "cyan",
  },
  {
    icon: Ruler,
    title: "Pixel-perfect fidelity",
    text: "Rounded cards, tinted canvases, exact spacing. The workbook opens in Tableau 2026.2 looking like the design — verified against real exports.",
    hue: "blue",
  },
  {
    icon: BrainCircuit,
    title: "AI-assisted, by design",
    text: "The layer grammar is machine-readable end to end — the foundation for upcoming AI layout suggestions and auto-mapping.",
    hue: "violet",
    soon: true,
  },
];

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <SectionHeading
          eyebrow="Features"
          title={
            <>
              Everything between <span className="grad-text">design and production</span>
            </>
          }
          blurb="Built by studying what Tableau actually loads — not what the spec says it should."
        />
        <motion.div
          className="features"
          variants={stagger(0, 0.08)}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
        >
          {FEATURES.map((f) => (
            <motion.article key={f.title} className="feature glass glass--hover" variants={fadeUp}>
              <span className={`feature__icon feature__icon--${f.hue}`}>
                <f.icon size={20} strokeWidth={1.8} />
              </span>
              <h3>
                {f.title}
                {f.soon && <span className="feature__soon">soon</span>}
              </h3>
              <p>{f.text}</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
