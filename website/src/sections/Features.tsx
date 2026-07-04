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
    text: "Every frame becomes a dashboard with pixel-faithful zones—floating, tiled, or single-image mode.",
    hue: "blue",
  },
  {
    icon: Replace,
    title: "Worksheet swapping",
    text: "Import an existing workbook and SHEET/ layers bind to your real worksheets—live charts land exactly where the design says.",
    hue: "purple",
  },
  {
    icon: Navigation,
    title: "Native navigation",
    text: "Figma prototype interactions become real Tableau navigation actions. Multi-page flows survive the export.",
    hue: "cyan",
  },
  {
    icon: Layers,
    title: "Multi-dashboard export",
    text: "Select N frames, get N dashboards in one workbook—shared data sources, deduplicated sheets.",
    hue: "orange",
  },
  {
    icon: Type,
    title: "Text that never clips",
    text: "A text-fitting engine measures every string and normalizes fonts so Tableau renders your copy at the designed size.",
    hue: "green",
  },
  {
    icon: Palette,
    title: "15 domain templates",
    text: "Clinical, sales, finance, operations, executive and more—production-grade starting points with per-domain palettes.",
    hue: "blue",
  },
  {
    icon: Ruler,
    title: "Pixel-perfect fidelity",
    text: "Rounded cards, tinted canvases, exact spacing. The workbook opens in Tableau looking like the design.",
    hue: "purple",
  },
  {
    icon: BrainCircuit,
    title: "AI-assisted, by design",
    text: "The layer grammar is machine-readable—the foundation for upcoming AI layout suggestions and auto-mapping.",
    hue: "cyan",
    soon: true,
  },
];

const HUE_ORDER = ["blue", "purple", "cyan", "orange", "green", "blue", "purple", "cyan"] as const;

export default function Features({ standalone = false }: { standalone?: boolean }) {
  return (
    <section className={`section ${standalone ? "section--page" : ""}`} id="features">
      <div className="orb orb--purple" style={{ width: 400, height: 400, top: 200, right: "-8%" }} />
      <div className="container">
        <SectionHeading
          center={standalone}
          eyebrow="Features"
          title={
            <>
              Everything between <span className="grad-text">design and production</span>
            </>
          }
          blurb="Built by studying what Tableau actually loads—not what the spec says it should."
        />
        <motion.div
          className="features"
          variants={stagger(0, 0.08)}
          initial="hidden"
          whileInView="show"
          viewport={viewportOnce}
        >
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              className="feature"
              variants={fadeUp}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
            >
              <span className={`feature__icon feature__icon--${HUE_ORDER[i]}`}>
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
