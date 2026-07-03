/**
 * An infinite strip of real layer names from the plugin grammar — the whole
 * product in one scrolling line. Pauses on hover; chips tilt like stickers.
 */
const CHIPS: Array<{ prefix: string; rest: string; color: string }> = [
  { prefix: "SHEET/", rest: "Revenue Trend[line]", color: "#f4512c" },
  { prefix: "KPI/", rest: "Conversion", color: "#8a4dff" },
  { prefix: "FILTER/", rest: "Region", color: "#18a0fb" },
  { prefix: "Nav/", rest: "Overview", color: "#0aa268" },
  { prefix: "SHEET/", rest: "Mix[pie]:filter", color: "#dd7714" },
  { prefix: "TEXT/", rest: "Q3 Summary", color: "#8a4dff" },
  { prefix: "BUTTON/", rest: "Details > Sales", color: "#f4512c" },
  { prefix: "SHEET/", rest: "By Site[bar]", color: "#18a0fb" },
  { prefix: "IMG/", rest: "Logo", color: "#0aa268" },
  { prefix: "SHEET/", rest: "Heat[heatmap]:showTitle", color: "#dd7714" },
  { prefix: "CONTAINER/", rest: "Header", color: "#8a4dff" },
  { prefix: "URL/", rest: "status.example.com", color: "#18a0fb" },
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
