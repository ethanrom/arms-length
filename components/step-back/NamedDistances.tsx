"use client";

import type { DistanceAnchor } from "@/components/results/types";

interface NamedDistancesProps {
  anchors: DistanceAnchor[];
  value: number;
  onPick: (distanceM: number) => void;
  className?: string;
}

/** The named stops beside the slider as buttons: one press instead of a hundred arrow keys, and a label for every stop. */
export function NamedDistances({ anchors, value, onPick, className }: NamedDistancesProps) {
  return (
    <div role="group" aria-label="Jump to a viewing distance" className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {anchors.map((a) => {
        const on = Math.abs(Math.log(value / a.distanceM)) < 0.035;
        return (
          <button
            key={a.label}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(a.distanceM)}
            className={`inline-flex min-h-10 items-center border border-ink px-3.5 text-[0.875rem] leading-none transition-colors sm:min-h-11 sm:px-4 ${on ? "bg-ink text-paper forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "hover:bg-ink/5"}`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
