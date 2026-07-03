// ---------------------------------------------------------------------------
// windowsXml.ts — windows XML generation (worksheet + dashboard windows).
// ---------------------------------------------------------------------------

import { esc, uid } from "./xmlUtils";

function wsCardsXml(filters: "left" | "right" | "hidden"): string {
  const leftCards = ["pages", "marks"];
  if (filters === "left") leftCards.splice(1, 0, "filters");
  const rightCards: string[] = [];
  if (filters === "right") rightCards.push("filters");
  const edgeXml = (edge: string, cards: string[]) =>
    cards.length
      ? `        <edge name='${edge}'>\n          <strip size='160'>\n${cards
          .map((c) => `            <card type='${c}' />\n`)
          .join("")}          </strip>\n        </edge>\n`
      : "";
  return (
    "      <cards>\n" +
    edgeXml("left", leftCards) +
    edgeXml("right", rightCards) +
    "        <edge name='top'>\n          <strip size='2147483647'>\n            <card type='columns' />\n          </strip>\n          <strip size='2147483647'>\n            <card type='rows' />\n          </strip>\n          <strip size='30'>\n            <card type='title' />\n          </strip>\n        </edge>\n" +
    "      </cards>\n"
  );
}

export function windowsXml(
  wsNames: string[],
  dashboards: { name: string; sheets: string[]; uuid: string }[],
  wsUuid: Map<string, string>,
  filterShelf: "left" | "right" | "hidden" = "right"
): string {
  const x: string[] = ["  <windows source-height='44'>\n"];
  for (const nm of wsNames) {
    x.push(`    <window class='worksheet' name='${esc(nm)}'>\n`);
    x.push(wsCardsXml(filterShelf));
    x.push("      <viewpoint>\n        <zoom type='entire-view' />\n      </viewpoint>\n");
    x.push(`      <simple-id uuid='${wsUuid.get(nm) ?? uid()}' />\n`);
    x.push("    </window>\n");
  }
  for (const d of dashboards) {
    x.push(`    <window class='dashboard' maximized='true' name='${esc(d.name)}'>\n`);
    x.push("      <viewpoints>\n");
    for (const s of d.sheets)
      x.push(
        `        <viewpoint name='${esc(s)}'>\n          <zoom type='entire-view' />\n        </viewpoint>\n`
      );
    x.push("      </viewpoints>\n");
    x.push("      <active id='-1' />\n");
    x.push(`      <simple-id uuid='${d.uuid}' />\n`);
    x.push("    </window>\n");
  }
  x.push("  </windows>\n");
  return x.join("");
}
