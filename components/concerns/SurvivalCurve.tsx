import { DEFAULT_AXIS, fractionAt, percent, spokenDistance, toUnit, type LogAxis, type ProfilePoint } from "@/app/_lib/axis";

interface SurvivalCurveProps {
  profile: ProfilePoint[];
  /** How many marks the concern has: the top of the scale. */
  total: number;
  /** Where half of them have faded. */
  medianM: number;
  /** Out of sight by conversation distance: drawn as an outline instead of a filled area. */
  relief: boolean;
  /** Tick positions along the axis (the named distances). */
  tickM?: number[];
  /** Profile distances to put a count on (the rest are on the curve). */
  labelM?: number[];
  axis?: LogAxis;
}

const SAMPLES = 72;
const W = 1000;
const H = 100;

/**
 * Survival curve: how many of a concern's marks an ideal observer can still pick out, from the mirror to across
 * the room, on the same log-distance axis as the slider and the other bars. Outline for concerns that are mostly
 * out of sight by 1 m, filled for the ones that carry farther; colour is never the signal.
 */
export function SurvivalCurve({ profile, total, medianM, relief, tickM = [], labelM = [1, 1.5, 2.5], axis = DEFAULT_AXIS }: SurvivalCurveProps) {
  const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const u = i / SAMPLES;
    const d = axis.min * Math.pow(axis.max / axis.min, u);
    return [u * W, H - fractionAt(profile, d) * H] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const label = `Marks detectable out of ${total}: ${profile.map((p) => `${p.count} at ${spokenDistance(p.distanceM)}`).join(", ")}.`;

  return (
    <div role="img" aria-label={label} className="relative h-[6.25rem] w-full">
      <div className="absolute inset-x-0 top-1 h-[4.25rem]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#b4afa4" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {!relief && <path d={area} fill="#161513" fillOpacity="0.12" />}
          <path d={line} fill="none" stroke="#161513" strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 h-px bg-rule-strong" aria-hidden="true" />

        {/* counts at conversation distance, across a table and across a room */}
        {labelM.map((d) => {
          const p = profile.find((q) => Math.abs(Math.log(q.distanceM / d)) < 1e-6);
          if (!p) return null;
          const y = 1 - p.fraction;
          return (
            <span key={d} aria-hidden="true" className="absolute" style={{ left: percent(toUnit(d, axis) * 100), top: percent(y * 100) }}>
              <span className="absolute block h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-paper" />
              <span
                className="num absolute -translate-x-1/2 whitespace-nowrap font-mono text-[0.625rem] leading-none text-ink-soft"
                style={{ top: p.fraction > 0.7 ? 6 : -14 }}
              >
                {p.count}
              </span>
            </span>
          );
        })}

        {/* where half have faded */}
        <span
          aria-hidden="true"
          className="absolute block h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-ink shadow-[0_0_0_2px_var(--paper)]"
          style={{ left: percent(toUnit(medianM, axis) * 100), top: "50%" }}
        />
      </div>

      {tickM.map((t) => (
        <span key={t} aria-hidden="true" className="absolute top-[4.6rem] h-1.5 w-px bg-rule-strong" style={{ left: percent(toUnit(t, axis) * 100) }} />
      ))}
      <span aria-hidden="true" className="num absolute left-0 top-[4.9rem] font-mono text-[0.625rem] leading-none text-muted">
        of {total}
      </span>
    </div>
  );
}
