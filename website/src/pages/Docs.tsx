import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import Reveal from "../components/ui/Reveal";
import { PLUGIN_URL, FREE_EXPORT_LIMIT, PREMIUM_PRICE, PREMIUM_PERIOD } from "../config";

/* ── Content (mirrors the plugin's Library → Syntax tab) ─────────────── */

const PREFIXES = [
  { tag: "SHEET/Name[type]", title: "Worksheet", desc: "A real Tableau worksheet named after the prefix. The optional [type] tag picks the chart; :options make clicks act on the dashboard. If a workbook is uploaded, a SHEET/ whose name matches an imported worksheet swaps in that real sheet and its data." },
  { tag: "KPI/Label", title: "KPI card", desc: "A metric card. Its label, value and change lines are recreated pixel-faithfully as fitted Tableau text zones — they never clip or overlap on export." },
  { tag: "FILTER/Field", title: "Quick filter", desc: "A Tableau quick-filter card on that dimension, bound to a chart on the same dashboard." },
  { tag: "Nav/Label", title: "Navigation (interaction)", desc: "A native nav button. Its destination comes from the layer's Figma prototype link — wire a “Navigate to” connection to the target frame (or to a SHEET/ layer to open that worksheet). Unselected destinations are pulled into the export automatically." },
  { tag: "BUTTON/Label > Target", title: "Navigation (named)", desc: "A nav button whose target dashboard is named after the “>” (“->” works too). With two dashboards and no “>”, it toggles to the other one. The caption is the text you drew inside the button." },
  { tag: "TEXT/Heading", title: "Text", desc: "A text zone with the layer's real text, font, size and color. Multi-line and mixed-style text is split and fitted so every line renders." },
  { tag: "Image/Name", title: "Image", desc: "Rasterized to a bitmap. IMG/ and LOGO/ work too. Vectors and icons are auto-rasterized even without the prefix." },
  { tag: "URL/page", title: "Web page object", desc: "A Tableau web-page object that loads the URL. WEB/ works too; bare hosts get https://." },
  { tag: "CONTAINER/Name", title: "Layout container", desc: "A layout group. GROUP/ works too. Auto-Layout frames are also reconstructed as flow containers." },
];

const CHART_TAGS = [
  { tag: "[bar]", mark: "Bar", note: "also column, bar-hor, bar-vert — and the default when no tag is given" },
  { tag: "[line]", mark: "Line", note: "also trend" },
  { tag: "[area]", mark: "Area", note: "" },
  { tag: "[pie]", mark: "Pie", note: "also donut, doughnut" },
  { tag: "[scatter]", mark: "Circle", note: "also bubble, circle" },
  { tag: "[heatmap]", mark: "Square", note: "also square, map" },
  { tag: "[table]", mark: "Text table", note: "also text, crosstab" },
];

const SHEET_OPTIONS = [
  { tag: ":showTitle", desc: "Render the worksheet's title inside its zone." },
  { tag: ":filter", desc: "Clicking a mark in this sheet filters the other sheets on the dashboard." },
  { tag: ":highlight", desc: "Clicking a mark highlights the matching marks in the other sheets." },
];

const SECTIONS = [
  { id: "getting-started", label: "Getting started", color: "#5f5580" },
  { id: "prefixes", label: "Layer prefixes", color: "#9c4f63" },
  { id: "chart-types", label: "Chart types", color: "#3f5f7a" },
  { id: "options", label: "Sheet options", color: "#3d8254" },
  { id: "navigation", label: "Navigation", color: "#8a5733" },
  { id: "swap", label: "Worksheet swap", color: "#5f5580" },
  { id: "export-modes", label: "Export modes", color: "#9c4f63" },
  { id: "templates", label: "Templates", color: "#3f5f7a" },
  { id: "plans", label: "Plans & limits", color: "#3d8254" },
  { id: "troubleshooting", label: "Troubleshooting", color: "#8a5733" },
];

/** Highlights the ToC entry of the section currently in view. */
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids]);
  return active;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const meta = SECTIONS.find((s) => s.id === id)!;
  const num = String(SECTIONS.indexOf(meta) + 1).padStart(2, "0");
  return (
    <Reveal>
      <section className="docs__section" id={id}>
        <h2>
          <span className="docs__num" style={{ background: meta.color }}>{num}</span>
          {title}
        </h2>
        {children}
      </section>
    </Reveal>
  );
}

export default function Docs() {
  const active = useScrollSpy(SECTIONS.map((s) => s.id));

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" />Documentation</span>
          <h1>
            Everything the plugin <span className="grad-text">understands.</span>
          </h1>
          <p className="page-hero__blurb">
            The whole product is a naming grammar: name a Figma layer with a prefix and it becomes
            that Tableau object on export. This page is the complete reference.
          </p>
        </div>
      </div>

      <div className="container docs">
        <nav className="docs__toc" aria-label="Documentation sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? "is-active" : ""}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="docs__body">
          <Section id="getting-started" title="Getting started">
            <p>
              Install the plugin from the <a href={PLUGIN_URL} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>Figma Community</a>,
              then the full loop is four moves:
            </p>
            <ol>
              <li><b>Design your dashboard</b> as a Figma frame — any size, any style. What you draw is what Tableau renders.</li>
              <li><b>Name the layers that matter</b> with the grammar below (<code>SHEET/</code>, <code>KPI/</code>, <code>FILTER/</code>…). Anything unnamed is treated as decoration and rendered faithfully.</li>
              <li><b>Select the frame</b> (or several — each becomes its own dashboard) and press <b>Export</b> in the plugin.</li>
              <li><b>Open the downloaded <code>.twbx</code></b> in Tableau 2026.2 or newer and bind your real data sources.</li>
            </ol>
            <div className="docs-callout">
              <Lightbulb size={17} strokeWidth={2.2} />
              <span>
                Your file never leaves Figma — parsing and generation run locally in the plugin
                sandbox. The only network calls are the license check and checkout.
              </span>
            </div>
          </Section>

          <Section id="prefixes" title="Layer prefixes">
            <p>Nine prefixes cover every Tableau object the exporter can build:</p>
            <div className="docs-table">
              {PREFIXES.map((p) => (
                <div key={p.tag} className="docs-table__row">
                  <code>{p.tag}</code>
                  <div><b>{p.title}.</b> {p.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="chart-types" title="Chart types">
            <p>
              Append a <code>[type]</code> tag to a <code>SHEET/</code> name — e.g.{" "}
              <code>SHEET/Sales Trend[line]</code> — to pick the worksheet's mark type:
            </p>
            <div className="docs-table">
              {CHART_TAGS.map((c) => (
                <div key={c.tag} className="docs-table__row">
                  <code>{c.tag}</code>
                  <div><b>{c.mark} marks</b>{c.note ? <> — {c.note}</> : null}</div>
                </div>
              ))}
            </div>
            <div className="docs-callout">
              <Lightbulb size={17} strokeWidth={2.2} />
              <span>
                The exporter also reads the <b>most vivid color you drew inside the sheet</b> and
                uses it for the chart's marks — a blue mock exports a blue chart, not a gray placeholder.
              </span>
            </div>
          </Section>

          <Section id="options" title="Sheet options">
            <p>
              Suffixes stack after the name and tag — e.g.{" "}
              <code>SHEET/Trend[line]:showTitle:filter</code>:
            </p>
            <div className="docs-table">
              {SHEET_OPTIONS.map((o) => (
                <div key={o.tag} className="docs-table__row">
                  <code>{o.tag}</code>
                  <div>{o.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="navigation" title="Navigation">
            <p>Two ways to build native Tableau navigation buttons, both exported as real navigation actions:</p>
            <ul>
              <li>
                <b><code>Nav/Label</code> follows your prototype.</b> Wire a Figma "Navigate to" interaction
                from the button (or anything inside it) to the destination frame. If the destination isn't
                selected for export it's pulled in automatically. Pointing at a <code>SHEET/</code> layer
                opens that worksheet instead of a dashboard.
              </li>
              <li>
                <b><code>BUTTON/Label &gt; Target</code> names its target.</b> The text after{" "}
                <code>&gt;</code> (or <code>-&gt;</code>) must match another exported frame's name.
                With exactly two dashboards and no target, the button toggles to the other one.
              </li>
            </ul>
          </Section>

          <Section id="swap" title="Worksheet swap">
            <p>
              Upload an existing <code>.twbx</code> in the plugin and any <code>SHEET/</code> layer whose
              name matches one of its worksheets is <b>swapped in with its live charts and data</b> —
              the generated dashboard shows your real visualizations exactly where the design puts them.
            </p>
            <ul>
              <li>Matching is forgiving: case, extra spaces and the <code>[type]</code> tag are ignored.</li>
              <li>Using the same imported sheet on several dashboards shares one worksheet; using it twice on <b>one</b> dashboard splices in a renamed clone.</li>
              <li>If nothing matches, the plugin warns you and falls back to a generated placeholder chart.</li>
            </ul>
          </Section>

          <Section id="export-modes" title="Export modes">
            <div className="docs-table">
              <div className="docs-table__row">
                <code>Floating</code>
                <div><b>Pixel-faithful.</b> Every zone lands at its exact designed position and size. The default, and the closest to your mock.</div>
              </div>
              <div className="docs-table__row">
                <code>Tiled</code>
                <div><b>Responsive.</b> The layout is rebuilt as Tableau's native tiled containers so it reflows with the window. Great for published dashboards on mixed screens.</div>
              </div>
              <div className="docs-table__row">
                <code>Image</code>
                <div><b>One PNG.</b> The whole frame becomes a single image dashboard — no worksheets, no zones. Perfect for visual sign-off or static hand-offs.</div>
              </div>
            </div>
          </Section>

          <Section id="templates" title="Templates">
            <p>
              The plugin ships <b>15 domain templates</b> — clinical, sales, finance, operations,
              executive and more — each a production-grade dashboard layout with its own palette.
              Apply one from the Library tab, replace the placeholder content, and export.
            </p>
          </Section>

          <Section id="plans" title="Plans & limits">
            <ul>
              <li><b>Free:</b> the entire feature set with {FREE_EXPORT_LIMIT} exports. No credit card.</li>
              <li><b>Premium ({PREMIUM_PRICE}{PREMIUM_PERIOD}):</b> unlimited exports. The license is keyed to your Figma account and keeps working offline for 3 days between checks.</li>
              <li>Upgrade from the plugin's <b>Account tab</b> — it opens checkout with your account already linked. See <Link to="/pricing" style={{ color: "var(--accent)", fontWeight: 600 }}>pricing</Link>.</li>
            </ul>
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <div className="docs-table">
              <div className="docs-table__row">
                <code>No prefixes found</code>
                <div>The selected frame has no recognized layer names. Everything still exports as faithful decoration — name layers with <code>SHEET/</code> etc. to get live objects.</div>
              </div>
              <div className="docs-table__row">
                <code>Swap warning</code>
                <div>A <code>SHEET/</code> name didn't match any imported worksheet. Check the spelling against the workbook's sheet list; matching ignores case and spacing.</div>
              </div>
              <div className="docs-table__row">
                <code>Text looks resized</code>
                <div>That's the fitting engine: Tableau renders text ~1.5x larger than Figma, so the exporter normalizes font sizes to keep the designed visual size and prevent clipping.</div>
              </div>
              <div className="docs-table__row">
                <code>Workbook won't open</code>
                <div>Make sure you're on Tableau 2026.2 or newer. If it persists, <Link to="/support" style={{ color: "var(--accent)", fontWeight: 600 }}>send us the frame</Link> — we regularly fix loader edge cases.</div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
