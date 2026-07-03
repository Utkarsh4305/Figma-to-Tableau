import Reveal from "../components/ui/Reveal";
import { SUPPORT_EMAIL } from "../config";

export default function Privacy() {
  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" />Privacy</span>
          <h1>
            Your designs <span className="grad-text">stay yours.</span>
          </h1>
          <p className="page-hero__blurb">
            The short version: generation happens locally in the Figma plugin. We never see your
            frames, your data, or your workbooks.
          </p>
        </div>
      </div>

      <div className="container">
        <Reveal className="prose">
          <span className="prose__updated">Last updated: July 3, 2026</span>

          <h2>What never leaves your machine</h2>
          <p>
            The plugin parses your selection and generates the <b>.twbx</b> entirely inside the
            Figma plugin sandbox. Your frames, layer names, text, images, and any workbook you
            import for worksheet swapping are processed locally and are <b>never uploaded to our
            servers</b>.
          </p>

          <h2>What we store</h2>
          <ul>
            <li><b>Your Figma user id</b> — the key your license is tied to.</li>
            <li><b>License status</b> — plan, validity date, and the payment reference that granted it.</li>
            <li><b>Export count</b> — kept in Figma's own plugin storage on your account, used to enforce the free-plan limit.</li>
          </ul>
          <p>That's the whole list. We don't run trackers on the plugin and don't sell or share data.</p>

          <h2>Payments</h2>
          <p>
            Checkout and card handling are performed by <b>Razorpay</b> on their hosted, PCI-DSS
            compliant pages. We never receive or store card numbers — only the payment confirmation
            needed to activate your license.
          </p>

          <h2>Network calls the plugin makes</h2>
          <ul>
            <li>A license check against our billing server (sends your Figma user id, nothing else).</li>
            <li>Opening the checkout / upgrade page when you ask it to.</li>
          </ul>

          <h2>This website</h2>
          <p>
            The marketing site serves static pages and doesn't set advertising cookies. The license
            checker on the account page sends only the user id you type into it.
          </p>

          <h2>Data removal</h2>
          <p>
            Want your license record deleted? Email <b>{SUPPORT_EMAIL}</b> from any address with
            your Figma user id and we'll remove it within 30 days (this also ends any active
            subscription).
          </p>

          <h2>Contact</h2>
          <p>Questions about this policy: <b>{SUPPORT_EMAIL}</b>.</p>
        </Reveal>
      </div>
    </>
  );
}
