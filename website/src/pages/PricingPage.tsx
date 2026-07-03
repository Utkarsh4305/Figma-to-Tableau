import Pricing from "../sections/Pricing";
import Faq from "../sections/Faq";
import CtaBanner from "../sections/CtaBanner";

export default function PricingPage() {
  return (
    <div className="page-offset">
      <Pricing standalone />
      <Faq />
      <CtaBanner />
    </div>
  );
}
