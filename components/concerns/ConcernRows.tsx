"use client";

import { percent } from "@/app/_lib/axis";
import { statusAt, type ConcernGroup, type ConcernView } from "@/components/results/derive";
import { stepBackCounter } from "@/lib/copy";

interface ConcernRowsProps {
  groups: ConcernGroup[];
  /** The Step back distance, metres: the rows follow the slider. */
  distanceM: number;
  /** The concern whose marks are drawn on the face, if any. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDetails: (id: string) => void;
}

/**
 * One compact row per concern: its name, a thin bar for the share a typical sharp-eyed person could still pick out from the
 * current Step back distance, and the sentence for it. A row can be pressed to mark the concern on the face; the pressed row
 * offers "Details", which opens the full card in a sheet.
 */
export function ConcernRows({ groups, distanceM, selectedId, onSelect, onDetails }: ConcernRowsProps) {
  return (
    <div data-testid="concern-rows">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`rows-${g.id}`} className="mt-4 first:mt-0">
          {/* a face with only one group needs no heading to say which it is */}
          <header className={`flex flex-wrap items-baseline justify-between gap-x-4 ${groups.length > 1 ? "" : "sr-only"}`}>
            <h3 id={`rows-${g.id}`} className="eyebrow !text-[0.875rem] !text-ink">
              {g.heading}
            </h3>
            {g.note && <p className="text-[0.875rem] text-ink-soft">{g.note}</p>}
          </header>
          <ul className={`border-t border-ink ${groups.length > 1 ? "mt-1.5" : ""}`}>
            {g.views.map((v) => (
              <Row key={v.id} view={v} distanceM={distanceM} selected={selectedId === v.id} onSelect={onSelect} onDetails={onDetails} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({
  view,
  distanceM,
  selected,
  onSelect,
  onDetails,
}: {
  view: ConcernView;
  distanceM: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onDetails: (id: string) => void;
}) {
  const st = statusAt(view, distanceM);
  const on = st.state !== "none";
  const stillShown = 1 - st.outOfSight;
  return (
    <li className={`border-b border-rule transition-colors duration-200 ${selected ? "bg-paper-deep" : ""}`}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : view.id)}
        className={`group block w-full border-l-[3px] px-3 py-2 text-left ${selected ? "border-ink" : "border-transparent hover:bg-ink/[0.04]"}`}
      >
        <span className="flex items-center gap-3">
          <StateDot state={st.state} />
          <span className={`serif text-[1.125rem] leading-snug transition-colors duration-300 ${on ? "text-ink" : "text-muted"}`}>{view.copy.title}</span>
          <span aria-hidden="true" className="ml-auto block h-1.5 w-16 shrink-0 border border-[#8a867c] forced-colors:border-[CanvasText]">
            <span className="block h-full bg-ink forced-colors:bg-[CanvasText]" style={{ width: percent(stillShown * 100) }} />
          </span>
        </span>
        <span data-counter={view.id} className="num mt-0.5 block pl-[1.375rem] text-[0.875rem] leading-snug text-ink-soft">
          {stepBackCounter(view.visibility, distanceM)}
        </span>
      </button>
      {selected && (
        <div className="pb-2.5 pl-[2.375rem] pr-3">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => onDetails(view.id)}
            className="btn btn-ghost btn-sm"
          >
            Details
            <span className="arrow" aria-hidden="true">
              &rarr;
            </span>
            <span className="sr-only">: {view.copy.title}</span>
          </button>
        </div>
      )}
    </li>
  );
}

/** Solid when most of a concern can still be picked out, half when some can, hollow when none: shape, never colour. */
function StateDot({ state }: { state: "most" | "some" | "none" }) {
  return (
    <span
      aria-hidden="true"
      className="block h-2.5 w-2.5 shrink-0 rounded-full border border-ink transition-colors duration-300"
      style={{ background: state === "most" ? "var(--ink)" : state === "some" ? "linear-gradient(90deg, var(--ink) 50%, transparent 50%)" : "transparent" }}
    />
  );
}
