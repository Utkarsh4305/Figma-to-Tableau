import Features from "../sections/Features";
import Benefits from "../sections/Benefits";
import Demo from "../sections/Demo";
import Faq from "../sections/Faq";
import CtaBanner from "../sections/CtaBanner";

/**
 * Dedicated /features page. Reuses the home Features grid in its centered
 * standalone layout, then reinforces it with the benefits, the live demo and
 * the FAQ so the page stands on its own.
 */
export default function FeaturesPage() {
  return (
    <div className="page-offset">
      <Features standalone />
      <Benefits />
      <Demo />
      <Faq />
      <CtaBanner />
    </div>
  );
}
