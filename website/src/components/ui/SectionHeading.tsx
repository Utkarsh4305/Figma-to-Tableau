import type { ReactNode } from "react";
import Reveal from "./Reveal";

export default function SectionHeading({
  eyebrow,
  title,
  blurb,
  center = false,
}: {
  eyebrow: string;
  title: ReactNode;
  blurb?: ReactNode;
  center?: boolean;
}) {
  return (
    <Reveal className={`section-heading ${center ? "section-heading--center" : ""}`}>
      <span className="eyebrow">
        <span className="dot" />
        {eyebrow}
      </span>
      <h2>{title}</h2>
      {blurb && <p>{blurb}</p>}
    </Reveal>
  );
}
