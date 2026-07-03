import SectionHeading from "../components/ui/SectionHeading";
import Reveal from "../components/ui/Reveal";
import Accordion from "../components/ui/Accordion";

const ITEMS = [
  {
    q: "What exactly does the plugin generate?",
    a: "A complete .twbx workbook: one dashboard per selected Figma frame, with pixel-faithful zones, worksheets for every SHEET/ layer, quick filters, KPI text, and native navigation buttons built from your Figma prototype interactions. It opens directly in Tableau 2026.2.",
  },
  {
    q: "Do I need to learn a special syntax?",
    a: "Just layer-name prefixes: SHEET/ for charts, KPI/ for metric cards, FILTER/ for quick filters, TEXT/ for copy, Nav/ for navigation. Anything unnamed is treated as decoration and rendered faithfully. The full grammar lives in the plugin's Library tab and the docs.",
  },
  {
    q: "Can it use my real data and worksheets?",
    a: "Yes — import an existing workbook into the plugin and any SHEET/ layer whose name matches one of your worksheets is swapped in, so the generated dashboard shows your live charts, not placeholders.",
  },
  {
    q: "Does my design or data leave Figma?",
    a: "No. Generation runs locally inside the Figma plugin sandbox. The only network calls are the license check and checkout — your frames and any imported workbook never touch our servers.",
  },
  {
    q: "What does the free plan include?",
    a: "The entire feature set with 15 free exports. After that, Premium ($10/month) unlocks unlimited exports. No credit card is needed to start.",
  },
  {
    q: "How is the license managed?",
    a: "It's tied to your Figma account. Pay once through our secure Razorpay checkout, then click “Refresh status” in the plugin's Account tab — Premium activates instantly and keeps working offline with a 3-day grace period.",
  },
  {
    q: "Which Tableau versions are supported?",
    a: "Workbooks are generated against the Tableau 2026.2 format and verified by opening real exports in it. Newer versions read older workbooks, so 2026.2+ is safe.",
  },
];

export default function Faq() {
  return (
    <section className="section section--tight" id="faq">
      <div className="container container--narrow">
        <SectionHeading
          center
          eyebrow="FAQ"
          title="Questions, answered"
        />
        <Reveal>
          <Accordion items={ITEMS} />
        </Reveal>
      </div>
    </section>
  );
}
