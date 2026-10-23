"use client";

import type { ChipKind } from "./moments";

export interface RibbonMoment {
  id: string;
  time: string | null;
  title: string;
  kind: ChipKind;
}

interface RibbonProps {
  moments: readonly RibbonMoment[];
  /** Marker positions along the day, 0 to 1 (ribbonPositions). */
  positions: readonly number[];
  /** The moment on screen; null on the end-of-day page. */
  current: number | null;
  onPick: (index: number) => void;
  /** "large" prints each moment's title under its time (the end of the day). */
  size?: "compact" | "large";
}

/** Dawn to night in the site's own greys and warms: a quiet backdrop for the line, not a picture. */
const SKY = [
  "#ecdfcf 0%",
  "#f3ece0 11%",
  "#f1f1ec 33%",
  "#eceeed 50%",
  "#f0dfc4 64%",
  "#d8c1a8 75%",
  "#8d8479 83%",
  "#3a3833 100%",
].join(", ");

const words = (m: RibbonMoment, i: number, n: number) => `Moment ${i + 1} of ${n}: ${m.title}${m.time ? `, ${m.time}` : ""}. ${m.kind === "none" ? "Nothing to do." : m.kind === "tip" ? "One small tip." : "An option if you would like it."}`;

/**
 * The day as a line from dawn to night, one marker per moment at its time: a hollow ring when there is nothing to do, a dot
 * when there is a tip or an option. Shape tells them apart, never colour. Each marker goes to its moment.
 */
export function Ribbon({ moments, positions, current, onPick, size = "compact" }: RibbonProps) {
  const large = size === "large";
  // Moments the user gave no time for are named by their title instead, in up to two short lines.
  const titled = large || moments.some((m) => !m.time);
  return (
    <nav aria-label="The day, moment by moment" data-testid="ribbon" className="px-1">
      <div className={`relative [container-type:inline-size] ${large ? "pb-28 sm:pb-16" : titled ? "pb-14" : "pb-8"}`}>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-11 border border-rule" style={{ background: `linear-gradient(to right, ${SKY})` }} />
        <div aria-hidden="true" className="absolute inset-x-0 top-[1.375rem] h-px bg-ink/70" />
        <ol className="relative h-11">
          {moments.map((m, i) => {
            const on = current === i;
            const x = positions[i] ?? 0.5;
            const edge = x < 0.12 ? "left" : x > 0.88 ? "right" : "center";
            // A label may be as wide as the room to its nearest neighbour, so two never run into each other.
            const room = Math.min(i > 0 ? x - (positions[i - 1] ?? 0) : 1, i < moments.length - 1 ? (positions[i + 1] ?? 1) - x : 1);
            const labelWidth = `min(${large ? 7 : 6}rem, calc(${(room * 100).toFixed(1)}cqw - 0.4rem))`;
            return (
              <li key={m.id} className="absolute top-1/2" style={{ left: `${x * 100}%` }}>
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  aria-label={words(m, i, moments.length)}
                  aria-current={on ? "step" : undefined}
                  data-testid="ribbon-marker"
                  data-kind={m.kind}
                  className="group grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
                >
                  <span
                    aria-hidden="true"
                    className={`block rounded-full border-2 border-ink shadow-[0_0_0_2px_var(--paper)] transition-all duration-300 group-hover:scale-110 ${
                      on ? "h-6 w-6 ring-2 ring-ink ring-offset-2 ring-offset-paper" : "h-3.5 w-3.5"
                    } ${m.kind === "none" ? "bg-paper" : "bg-ink forced-colors:bg-[CanvasText]"}`}
                  />
                </button>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-[1.9rem] block text-[0.875rem] leading-tight ${
                    edge === "center" ? "-translate-x-1/2 text-center" : edge === "left" ? "-translate-x-[1.25rem] text-left" : "-translate-x-[calc(100%-1.25rem)] text-right"
                  } ${on ? "text-ink" : "text-ink-soft"} ${titled ? "" : "whitespace-nowrap"}`}
                  style={titled ? { width: labelWidth } : undefined}
                >
                  {m.time && <span className="num block font-mono">{m.time}</span>}
                  {(large || !m.time) && <span className="mt-0.5 line-clamp-3">{m.title}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
