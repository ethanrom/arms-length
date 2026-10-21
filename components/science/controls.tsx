"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Renders its children once it is within 600 px of the viewport, and keeps them mounted after that. Heavy widgets (canvas,
 * workers, fetches) therefore cost nothing until the reader gets near them.
 */
export function LazyMount({ children, minHeight = 520, label }: { children: ReactNode; minHeight?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (on || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setOn(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);

  return (
    <div ref={ref}>
      {on ? (
        children
      ) : (
        <div className="sci-plate sci-hatch grid place-items-center text-[0.875rem] text-muted" style={{ minHeight }}>
          <p>{label} loads as you scroll to it.</p>
        </div>
      )}
    </div>
  );
}

/** The width of an element in CSS px, kept up to date. 0 until the first measurement. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** True when the reader asks for less motion. Read once per mount; the widgets only use it to skip easing. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);
  return reduced;
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** The value as shown beside the label. */
  display: ReactNode;
  /** The value in words, for assistive tech. */
  valueText: string;
  hint?: ReactNode;
  /** Labels under the track ends or at ticks: [{ at: 0..1, text }]. */
  ticks?: { at: number; text: string }[];
}

/** A labelled slider: a native range input (keyboard, touch and screen reader support for free) with a spoken value. */
export function RangeField({ label, value, min, max, step, onChange, display, valueText, hint, ticks }: RangeFieldProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="eyebrow !text-ink">
          {label}
        </label>
        <output htmlFor={id} className="serif num text-[1.5rem] leading-none">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="sci-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {ticks && (
        <div aria-hidden="true" className="relative -mt-1 h-5">
          {ticks.map((t) => (
            <span
              key={t.text}
              className="num absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[0.75rem] leading-none text-muted first:translate-x-0 last:-translate-x-full"
              style={{ left: `${t.at * 100}%` }}
            >
              {t.text}
            </span>
          ))}
        </div>
      )}
      {hint && <p className="mt-1 text-[0.875rem] leading-snug text-ink-soft">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  legend: string;
  value: T;
  options: { value: T; label: string; sub?: string }[];
  onChange: (value: T) => void;
  /** Hides the legend visually but keeps it for assistive tech. */
  hideLegend?: boolean;
}

/** One choice out of a few: a radio group drawn as a joined strip. */
export function Segmented<T extends string>({ legend, value, options, onChange, hideLegend }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset>
      <legend className={hideLegend ? "sr-only" : "eyebrow !text-ink"}>{legend}</legend>
      <div className={`${hideLegend ? "" : "mt-3 "}inline-flex flex-wrap border border-ink`} role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <label key={o.value} className="relative cursor-pointer">
            <input type="radio" name={name} className="peer sr-only" checked={o.value === value} onChange={() => onChange(o.value)} />
            <span className="flex min-h-11 min-w-[4.25rem] flex-col items-center justify-center border-l border-ink px-3 py-1 text-center text-[0.9375rem] leading-tight transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline">
              <span>{o.label}</span>
              {o.sub && <span className="num font-mono text-[0.75rem] opacity-80">{o.sub}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Maps a slider's linear steps onto a log scale: `toValue(step)` and `toStep(value)`. */
export function logScale(min: number, max: number, steps: number, snap: (v: number) => number = (v) => v) {
  const k = Math.log(max / min);
  return {
    steps,
    toValue: (step: number) => snap(min * Math.exp((step / steps) * k)),
    toStep: (value: number) => Math.round((Math.log(value / min) / k) * steps),
  };
}
