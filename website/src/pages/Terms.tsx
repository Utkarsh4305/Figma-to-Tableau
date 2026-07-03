import Reveal from "../components/ui/Reveal";
import { SUPPORT_EMAIL, FREE_EXPORT_LIMIT } from "../config";

export default function Terms() {
  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" />Terms</span>
          <h1>
            The <span className="grad-text">fine print,</span> kept short.
          </h1>
          <p className="page-hero__blurb">
            Plain-language terms for using the Figma to Tableau plugin and this website.
          </p>
        </div>
      </div>

      <div className="container">
        <Reveal className="prose">
          <span className="prose__updated">Last updated: July 3, 2026</span>

          <h2>1. The service</h2>
          <p>
            "Figma to Tableau" is a Figma plugin that converts Figma frames into Tableau workbook
            files, plus this website and a licensing service. By installing the plugin or buying
            Premium you agree to these terms.
          </p>

          <h2>2. Your content</h2>
          <p>
            Everything you design, and every workbook the plugin generates, is <b>yours</b>. We
            claim no rights over your designs, data, or exports, and — as described in the privacy
            policy — we never receive them.
          </p>

          <h2>3. Plans</h2>
          <ul>
            <li><b>Free:</b> full feature set, limited to {FREE_EXPORT_LIMIT} exports per Figma account.</li>
            <li><b>Premium:</b> unlimited exports, billed monthly through Razorpay, tied to your Figma user id. Cancel anytime; access runs to the end of the paid period.</li>
          </ul>

          <h2>4. Fair use</h2>
          <p>
            Don't share one Premium license across a team, resell exports of the plugin itself, or
            attempt to bypass the export limit. Enterprise/team licensing is coming — until then,
            one license per person.
          </p>

          <h2>5. Refunds</h2>
          <p>
            If Premium didn't work for you, email us within 14 days of a charge and we'll refund
            it. No forms, no hoops.
          </p>

          <h2>6. Warranty & liability</h2>
          <p>
            The plugin is provided "as is". We test generated workbooks against real Tableau
            releases, but we can't guarantee every design opens perfectly in every Tableau version.
            Our total liability is capped at the amount you paid us in the last 12 months.
          </p>

          <h2>7. Trademarks</h2>
          <p>
            Figma is a trademark of Figma, Inc.; Tableau is a trademark of Salesforce, Inc. This
            project is affiliated with neither.
          </p>

          <h2>8. Changes</h2>
          <p>
            We may update these terms; material changes will be announced on the blog and in the
            plugin. Continued use after a change means acceptance.
          </p>

          <h2>9. Contact</h2>
          <p>Questions: <b>{SUPPORT_EMAIL}</b>.</p>
        </Reveal>
      </div>
    </>
  );
}
