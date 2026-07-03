import Hero from "../sections/Hero";
import SyntaxMarquee from "../sections/SyntaxMarquee";
import HowItWorks from "../sections/HowItWorks";
import Features from "../sections/Features";
import Demo from "../sections/Demo";
import Benefits from "../sections/Benefits";
import Pricing from "../sections/Pricing";
import Faq from "../sections/Faq";
import CtaBanner from "../sections/CtaBanner";

export default function Home() {
  return (
    <>
      <Hero />
      <SyntaxMarquee />
      <HowItWorks />
      <Features />
      <Demo />
      <Benefits />
      <Pricing />
      <Faq />
      <CtaBanner />
    </>
  );
}
