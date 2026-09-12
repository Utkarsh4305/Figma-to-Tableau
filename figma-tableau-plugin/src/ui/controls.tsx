/**
 * Shared interaction primitives.
 *
 * Two things in this UI were doing their own thing and feeling abrupt for
 * it: the tab bars (a background that blinked between buttons) and the
 * disclosure rows (native <details>, which has no transition at all).
 * Both live here now so every tab bar in the plugin moves the same way and
 * every disclosure opens the same way.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from "react";

/* ── Segmented control ─────────────────────────────────────────────────────
   The active pill is ONE element that slides between segments. Because the
   segments are equal-width the indicator needs no measuring: CSS derives its
   width from `--seg-count` and its offset from `--seg-index`.

   Arrow keys move between tabs, so the whole nav is reachable without the
   mouse — see the roving-tabindex handling in `onKeyDown`. */
export type Segment<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Announced to screen readers in place of the visible label. */
  hint?: string;
};

export function Segmented<T extends string>({
  segments,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  segments: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const index = Math.max(0, segments.findIndex((s) => s.id === value));
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + segments.length) % segments.length;
    onChange(segments[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`seg ${className}`.trim()}
      style={
        {
          "--seg-count": segments.length,
          "--seg-index": index,
        } as React.CSSProperties
      }
      onKeyDown={onKeyDown}
    >
      <span className="seg-indicator" aria-hidden="true" />
      {segments.map((seg, i) => (
        <button
          key={seg.id}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          aria-selected={seg.id === value}
          tabIndex={seg.id === value ? 0 : -1}
          title={seg.hint ?? seg.label}
          className="seg-btn"
          onClick={() => onChange(seg.id)}
        >
          {seg.icon ? <span className="tab-icon">{seg.icon}</span> : null}
          <span>{seg.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Accordion ─────────────────────────────────────────────────────────────
   Replaces <details>, which opens with no transition at all. Animating to an
   unknown height needs the `grid-template-rows: 0fr -> 1fr` trick: the row
   resolves to the content's real height at both ends, so the browser can
   interpolate between them with nothing measured in JS. */
const CHEVRON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function Accordion({
  summary,
  children,
  defaultOpen = false,
  variant = "",
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Extra modifier on the wrapper, e.g. "acc--syntax". */
  variant?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <div className={`acc ${variant} ${className}`.trim()} data-open={open}>
      <button
        type="button"
        className="acc-summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="acc-main">{summary}</span>
        <span className="acc-chev">{CHEVRON}</span>
      </button>
      <div className="acc-panel" id={panelId} role="region">
        <div className="acc-panel-clip">
          <div className="acc-panel-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
