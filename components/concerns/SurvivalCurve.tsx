import { DEFAULT_AXIS, fractionAt, percent, spokenDistance, toUnit, type LogAxis, type ProfilePoint } from "@/app/_lib/axis";
import { shareWord } from "@/lib/copy";

interface SurvivalCurveProps {
  /** Share of marks that even perfect eyes (the bound) could pick out at fixed distances: the ceiling, drawn dashed. */
  profile: ProfilePoint[];
  /** The same for a typical sharp-eyed person: the filled curve. Falls back to the bound when a reading has none. */
  nominalProfile?: ProfilePoint[] | null;
  /** Where half of them have dropped out of sight for a typical person. */
  medianM: number;
  /** Out of sight by the copy's rule: drawn as an outline instead of a filled area. */
  relief: boolean;
  /** Tick positions along the axis (the named distances). */
  tickM?: number[];
  /** Distances the spoken description names. */
  describeM?: number[];
  axis?: LogAxis;
}

const SAMPLES = 72;
const W = 1000;
const H = 100;

/**
 * How much of a concern can still be picked out, from the mirror to across the room, on the same log-distance axis as
 * the slider and the other bars. Filled: a typical sharp-eyed person looking right at each mark. Dashed: even perfect
 * eyes, the ceiling. Outline instead of fill for concerns that are mostly out of sight; colour is never the signal and
 * no counts are drawn (exact counts live in the receipts).
 */
export function SurvivalCurve({ profile, nominalProfile, medianM, relief, tickM = [], describeM = [1, 1.5, 2.5], axis = DEFAULT_AXIS }: SurvivalCurveProps) {
  const typical = nominalProfile ?? profile;
  const path = (points: ProfilePoint[]) =>
    Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const u = i / SAMPLES;
      const d = axis.min * Math.pow(axis.max / axis.min, u);
      return [u * W, H - fractionAt(points, d) * H] as const;
    })
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
  const line = path(typical);
  const ceiling = path(profile);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const label = `A typical sharp-eyed person could pick out ${describeM.map((d) => `${shareWord(fractionAt(typical, d))} at ${spokenDistance(d)}`).join(", ")}. Even perfect eyes could pick out ${describeM.map((d) => `${shareWord(fractionAt(profile, d))} at ${spokenDistance(d)}`).join(", ")}.`;

  return (
    <div role="img" aria-label={label} className="relative h-[5.5rem] w-full">
      <div className="absolute inset-x-0 top-1 h-[4.25rem]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#b4afa4" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {!relief && <path d={area} fill="#161513" fillOpacity="0.12" />}
          <path d={ceiling} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="1.25" strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" stroke="#161513" strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 h-px bg-rule-strong" aria-hidden="true" />

        {/* where half have dropped out of sight */}
        <span
          aria-hidden="true"
          className="absolute block h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-ink shadow-[0_0_0_2px_var(--paper)]"
          style={{ left: percent(toUnit(medianM, axis) * 100), top: "50%" }}
        />
      </div>

      {tickM.map((t) => (
        <span key={t} aria-hidden="true" className="absolute top-[4.6rem] h-1.5 w-px bg-rule-strong" style={{ left: percent(toUnit(t, axis) * 100) }} />
      ))}
    </div>
  );
}
