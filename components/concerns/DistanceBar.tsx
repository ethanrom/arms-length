import { DEFAULT_AXIS, formatDistance, percent, spokenDistance, toUnit, type LogAxis } from "@/app/_lib/axis";

interface DistanceBarProps {
  /** The farthest the concern stays visible, metres. */
  maxM: number;
  /** Plausible range from the scale uncertainty, drawn as a whisker. */
  intervalM: [number, number];
  /** Out of sight within conversation distance: drawn solid and short; what carries far is a hairline outline. */
  relief: boolean;
  /** A second marker for comparisons (the what-if result), drawn as a ghost. */
  ghostM?: number;
  /** Tick positions along the axis (the named distances). */
  tickM?: number[];
  axis?: LogAxis;
  /** Overrides the spoken description. */
  description?: string;
  /** The caller describes the bar in a caption and a table (a `ChartFigure`): hide it from assistive tech. */
  decorative?: boolean;
}

/**
 * A compact distance bar on the shared log axis. The weight goes to the good news: a concern that vanishes early gets a
 * solid bar, one that carries far a hairline outline; the whisker shows the plausible range. Colour is never used to say
 * good or bad, and every part has a border or a system colour so it survives forced-colors mode.
 */
export function DistanceBar({ maxM, intervalM, relief, ghostM, tickM = [], axis = DEFAULT_AXIS, description, decorative }: DistanceBarProps) {
  const x = (d: number) => percent(toUnit(d, axis) * 100);
  const [lo, hi] = intervalM;
  const label =
    description ??
    `${relief ? "Out of sight beyond" : "Visible up to"} ${spokenDistance(maxM)}. Plausible range ${spokenDistance(lo)} to ${spokenDistance(hi)}.`;

  return (
    <div {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })} className="relative h-[3rem] w-full">
      <div className="absolute inset-x-0 top-[0.62rem] h-px bg-[#8a867c]" />
      {tickM.map((t) => (
        <span key={t} className="absolute top-[0.35rem] h-[0.55rem] w-px bg-[#8a867c]" style={{ left: x(t) }} />
      ))}

      {/* the bar */}
      <div
        className={`absolute left-0 top-[0.37rem] h-[0.5rem] border border-ink ${relief ? "bg-ink forced-colors:bg-[CanvasText]" : "bg-transparent"}`}
        style={{ width: x(maxM) }}
      />
      {ghostM !== undefined && (
        <span
          className="absolute top-[0.37rem] block h-[0.5rem] border border-dashed border-ink"
          style={{ left: 0, width: x(ghostM) }}
        />
      )}
      <span
        className={`absolute top-[0.62rem] block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink ${relief ? "bg-ink shadow-[0_0_0_2px_var(--paper)] forced-colors:bg-[CanvasText]" : "bg-paper forced-colors:bg-[Canvas]"}`}
        style={{ left: x(maxM) }}
      />

      {/* whisker */}
      <div className="absolute top-[1.55rem] h-px bg-ink/70" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <span className="absolute top-[1.35rem] h-[0.45rem] w-px bg-ink/70" style={{ left: x(lo) }} />
      <span className="absolute top-[1.35rem] h-[0.45rem] w-px bg-ink/70" style={{ left: x(hi) }} />
      <span className="num absolute top-[1.85rem] -translate-x-1/2 whitespace-nowrap font-mono text-[0.875rem] leading-none text-ink-soft" style={{ left: x(maxM) }}>
        {formatDistance(maxM)}
      </span>
    </div>
  );
}

/** Labels for the shared axis, drawn once above a list of bars. */
export function DistanceAxisHeader({
  anchors,
  axis = DEFAULT_AXIS,
}: {
  anchors: { distanceM: number; label: string; short: string }[];
  axis?: LogAxis;
}) {
  // Skip the selfie anchor here: 5 cm from the mirror, it would sit on top of it.
  const shown = anchors.filter((a, i) => i === 0 || toUnit(a.distanceM, axis) - toUnit(anchors[0].distanceM, axis) > 0.12);
  return (
    <div aria-hidden="true" className="relative h-11 w-full">
      {shown.map((a) => {
        const u = toUnit(a.distanceM, axis);
        const align = u < 0.08 ? "left" : u > 0.9 ? "right" : "center";
        return (
          <div
            key={a.label}
            className="absolute top-0 whitespace-nowrap"
            style={{
              left: percent(u * 100),
              transform: align === "center" ? "translateX(-50%)" : align === "right" ? "translateX(-100%)" : undefined,
              textAlign: align,
            }}
          >
            <span className="num block font-mono text-[0.875rem] leading-none">{formatDistance(a.distanceM)}</span>
            <span className="mt-1 block text-[0.875rem] leading-none text-ink-soft">{a.short}</span>
          </div>
        );
      })}
    </div>
  );
}
