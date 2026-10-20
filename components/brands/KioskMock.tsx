import Image from "next/image";
import { DistanceBar } from "@/components/concerns/DistanceBar";
import type { ResultsData } from "@/components/results/types";
import { formatDistance } from "@/app/_lib/axis";

/**
 * An illustrative in-store kiosk screen. Flat on purpose: a portrait display with a hairline bezel, showing the
 * visibility layer inside a retailer's own skin. Not interactive.
 */
export function KioskMock({ data }: { data: ResultsData }) {
  const lines = data.share.lines;
  const tickM = data.anchors.map((a) => a.distanceM);
  return (
    <figure>
      <div className="mx-auto w-full max-w-[22rem] rounded-[1.75rem] border border-ink bg-ink p-[0.6rem] shadow-[0_1px_0_rgb(22_21_19/0.2)]">
        <div className="relative flex flex-col overflow-hidden rounded-[1.25rem] bg-paper" style={{ aspectRatio: "9 / 16" }}>
          <div className="flex shrink-0 items-center justify-between border-b border-rule px-5 py-3">
            <span className="serif text-[1.0625rem]" style={{ fontWeight: 420 }}>
              Your brand
            </span>
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted">Skin consultation</span>
          </div>

          <div className="stage relative" style={{ background: data.stageGrey, height: "38%", flexShrink: 0 }}>
            <Image src={data.persona.image} alt="" width={data.frame.width} height={data.frame.height} sizes="352px" className="h-full w-full object-cover" style={{ objectPosition: "50% 30%" }} />
            <span className="absolute left-3 top-3 border border-ink/15 bg-paper px-2 py-1 font-mono text-[0.5625rem] uppercase leading-none tracking-[0.1em]">Synthetic face</span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-5 pt-3">
            <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted">What others see</p>
            <ul className="mt-2">
              {lines.map((l) => {
                const v = data.report.concerns.find((c) => c.concern === l.concern);
                return (
                  <li key={l.concern} className="border-t border-rule py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="serif text-[1rem]">{l.label}</span>
                      <span className="num font-mono text-[0.625rem] text-muted">{l.tone === "relief" ? "gone by" : "up to"} {formatDistance(l.distanceM)}</span>
                    </div>
                    {v && <DistanceBar maxM={l.distanceM} intervalM={[l.distanceM * 0.92, l.distanceM * 1.08]} relief={l.tone === "relief"} tickM={tickM} description={`${l.label}: ${l.sentence}`} />}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-4 pt-2">
            <span className="border border-ink px-4 py-2.5 text-[0.75rem] font-medium">Step back</span>
            <span className="bg-ink px-4 py-2.5 text-[0.75rem] font-medium text-paper">See my routine</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-[0.8125rem] text-muted">Illustrative kiosk screen with fictional branding.</figcaption>
    </figure>
  );
}
