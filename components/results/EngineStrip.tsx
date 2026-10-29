import type { EngineStrip as EngineStripData } from "./types";

interface EngineStripProps {
  engine: EngineStripData;
  /** "Recorded analysis (demo, 0 units)" or "Live (this session: 22 units)", from lib/integration/copy.ts `engineBadge`. */
  badge: string;
  /** A live session is not a recording: the badge is outlined solid rather than hairline. */
  live: boolean;
}

/**
 * "Built on YouCam: HD Skin Analysis · Skin Simulation · Makeup VTO", what a session costs in units, whether this reading is
 * a recording or live, and the study the model was checked against. Credit and cost, kept off the face.
 */
export function EngineStrip({ engine, badge, live }: EngineStripProps) {
  return (
    <section aria-label={engine.title} className="border border-ink bg-paper-deep/50 px-4 py-2.5">
      <p className="serif text-[1.125rem] leading-snug" style={{ fontWeight: 420 }}>
        {engine.title}
        <span aria-hidden="true">: </span>
        <span className="sr-only">: </span>
        <span className="text-ink-soft">{engine.parts.join(" · ")}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="num text-[0.875rem] leading-snug text-ink-soft">{engine.units}</p>
        <p
          className={`inline-flex items-center border px-3 py-1.5 text-[0.875rem] leading-none ${live ? "border-ink bg-ink text-paper forced-colors:border-[CanvasText]" : "border-ink"}`}
        >
          {badge}
        </p>
      </div>
      <p className="serif mt-1.5 text-[1.0625rem] italic leading-snug text-ink-soft" style={{ fontWeight: 380 }}>
        {engine.tagline}
      </p>
      <a
        href={engine.validation.href}
        className="mt-1.5 inline-flex items-start gap-2 text-[0.875rem] leading-snug text-ink-soft underline-offset-4 hover:text-ink hover:underline"
      >
        <CheckMark />
        {engine.validation.text}
      </a>
    </section>
  );
}

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
