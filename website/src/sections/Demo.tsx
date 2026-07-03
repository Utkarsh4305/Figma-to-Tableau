import { useEffect, useRef, useState } from "react";
import SectionHeading from "../components/ui/SectionHeading";
import Reveal from "../components/ui/Reveal";
import FigmaFrame from "../components/illustrations/FigmaFrame";
import TableauDashboard from "../components/illustrations/TableauDashboard";

/**
 * Before/after comparison: the Figma design and the generated Tableau
 * dashboard, revealed with a draggable wipe. The handle sweeps on its own
 * until the visitor grabs it.
 */
export default function Demo() {
  const [pos, setPos] = useState(62);
  const [touched, setTouched] = useState(false);
  const raf = useRef<number>();

  // Idle sweep: ease the divider back and forth until first interaction.
  useEffect(() => {
    if (touched) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const phase = ((t - t0) / 4200) * Math.PI * 2;
      setPos(55 + Math.sin(phase) * 28);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [touched]);

  return (
    <section className="section" id="demo">
      <div className="orb orb--violet" style={{ width: 480, height: 480, top: 60, right: "-6%" }} />
      <div className="container">
        <SectionHeading
          center
          eyebrow="Interactive demo"
          title={
            <>
              Same pixels, <span className="grad-text">real workbook</span>
            </>
          }
          blurb="Drag the divider — the wireframe on the left is Figma, the live dashboard on the right is the generated .twbx."
        />
        <Reveal className="compare-wrap">
          <div
            className="compare glass"
            onPointerDown={() => setTouched(true)}
          >
            <div className="compare__pane">
              <TableauDashboard className="compare__svg" />
              <span className="compare__tag compare__tag--after">Generated Tableau</span>
            </div>
            <div className="compare__pane compare__pane--top" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <FigmaFrame className="compare__svg" />
              <span className="compare__tag compare__tag--before">Figma design</span>
            </div>
            <div className="compare__handle" style={{ left: `${pos}%` }}>
              <span className="compare__grip">⟷</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              aria-label="Reveal the Figma design versus the generated Tableau dashboard"
              onChange={(e) => {
                setTouched(true);
                setPos(Number(e.target.value));
              }}
              className="compare__range"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
