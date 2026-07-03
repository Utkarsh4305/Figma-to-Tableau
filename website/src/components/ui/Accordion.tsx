import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

export interface AccordionItem {
  q: string;
  a: string;
}

/** FAQ accordion — one item open at a time, animated height + icon rotation. */
export default function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="accordion">
      {items.map((item, i) => {
        const open = openIdx === i;
        return (
          <div key={item.q} className={`accordion__item glass ${open ? "is-open" : ""}`}>
            <button
              className="accordion__head"
              aria-expanded={open}
              onClick={() => setOpenIdx(open ? null : i)}
            >
              <span>{item.q}</span>
              <motion.span
                className="accordion__icon"
                animate={{ rotate: open ? 45 : 0 }}
                transition={{ duration: 0.25 }}
              >
                <Plus size={18} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  className="accordion__body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p>{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
