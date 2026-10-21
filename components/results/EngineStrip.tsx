import type { EngineStrip as EngineStripData } from "./types";

interface EngineStripProps {
  engine: EngineStripData;
  /** "Recorded analysis (demo, 0 units)" or "Live (this session: 22 units)", from lib/integration/copy.ts `engineBadge`. */
  badge: string;
  /** A live session is not a recording: the badge is outlined solid rather than hairline. */
  live: boolean;
}

/**
 * "Built on YouCam: HD Skin Analysis · Skin Simulation · Makeup VTO", what a session costs in units, and whether this
 * reading is a recording or live. Credit and cost, kept off the face.
 */
export function EngineStrip({ engine, badge, live }: EngineStripProps) {
  return (
    <section aria-label={engine.title} className="border-y border-ink bg-paper-deep/50">
      <div className="page flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
        <p className="serif text-[1.125rem] leading-snug" style={{ fontWeight: 420 }}>
          {engine.title}
          <span aria-hidden="true">: </span>
          <span className="sr-only">: </span>
          <span className="text-ink-soft">{engine.parts.join(" · ")}</span>
        </p>
        <p className="num text-[0.875rem] leading-snug text-ink-soft">{engine.units}</p>
        <p
          className={`inline-flex items-center border px-3 py-1.5 text-[0.875rem] leading-none ${live ? "border-ink bg-ink text-paper forced-colors:border-[CanvasText]" : "border-ink"}`}
        >
          {badge}
        </p>
        <p className="serif w-full text-[1.0625rem] italic leading-snug text-ink-soft md:ml-auto md:w-auto" style={{ fontWeight: 380 }}>
          {engine.tagline}
        </p>
      </div>
    </section>
  );
}
