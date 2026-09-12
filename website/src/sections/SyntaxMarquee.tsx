/**
 * An infinite strip of real layer names from the plugin grammar — the whole
 * product in one scrolling line. Pauses on hover; chips tilt like stickers.
 */
const CHIPS: Array<{ prefix: string; rest: string; color: string }> = [
  { prefix: "SHEET/", rest: "Revenue Trend[line]", color: "#5f5580" },
  { prefix: "KPI/", rest: "Conversion", color: "#9c4f63" },
  { prefix: "FILTER/", rest: "Region", color: "#3f5f7a" },
  { prefix: "Nav/", rest: "Overview", color: "#3d8254" },
  { prefix: "SHEET/", rest: "Mix[pie]:filter", color: "#8a5733" },
  { prefix: "TEXT/", rest: "Q3 Summary", color: "#9c4f63" },
  { prefix: "BUTTON/", rest: "Details > Sales", color: "#5f5580" },
  { prefix: "SHEET/", rest: "By Site[bar]", color: "#3f5f7a" },
  { prefix: "IMG/", rest: "Logo", color: "#3d8254" },
  { prefix: "SHEET/", rest: "Heat[heatmap]:showTitle", color: "#8a5733" },
  { prefix: "CONTAINER/", rest: "Header", color: "#9c4f63" },
  { prefix: "URL/", rest: "status.example.com", color: "#3f5f7a" },
];

function ChipRow() {
  return (
    <div className="marquee__group" aria-hidden="true">
      {CHIPS.map((c, i) => (
        <span key={i} className="marquee__chip">
          <b style={{ color: c.color }}>{c.prefix}</b>
          {c.rest}
        </span>
      ))}
    </div>
  );
}

export default function SyntaxMarquee() {
  return (
    <section className="marquee" aria-label="Layer naming grammar examples">
      <div className="marquee__mask">
        <div className="marquee__track">
          <ChipRow />
          <ChipRow />
        </div>
      </div>
    </section>
  );
}
