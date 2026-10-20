import Image from "next/image";
import type { MaskStrip } from "./types";

/**
 * "What YouCam detected": the raw masks from the analysis, laid over the photo. They are the visible starting
 * input for everything measured below. Each thumbnail is the photo with that concern's transparent overlay on top.
 */
export function MaskStripView({ strip, compact }: { strip: MaskStrip; compact?: boolean }) {
  const w = compact ? 68 : 92;
  const h = Math.round(w * 1.25);
  return (
    <section aria-label={strip.title} className="grid gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center">
      <div>
        <p className="eyebrow">{strip.title}</p>
        <p className="mt-2 hidden max-w-[26rem] text-[0.875rem] leading-relaxed text-muted sm:block">{strip.note}</p>
      </div>
      <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {strip.items.map((m) => (
          <li key={m.concern} className="shrink-0">
            <figure>
              <div className="stage relative overflow-hidden" style={{ width: w, height: h }}>
                <Image
                  src={strip.photo}
                  alt=""
                  fill
                  unoptimized
                  sizes={`${w}px`}
                  className="object-cover"
                  style={{ objectPosition: "50% 38%", opacity: m.note ? 0.55 : 1 }}
                />
                {!m.note && (
                  <Image src={m.image} alt="" fill unoptimized sizes={`${w}px`} className="object-cover" style={{ objectPosition: "50% 38%" }} />
                )}
              </div>
              <figcaption className="mt-1.5 max-w-[5.75rem] text-[0.6875rem] leading-tight text-ink-soft">
                {m.label}
                {m.note && <span className="mt-0.5 block text-muted">{m.note}</span>}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
