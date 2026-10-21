"use client";

import { useId, useState } from "react";
import { DistanceAxisHeader, DistanceBar } from "@/components/concerns/DistanceBar";
import type { DistanceAnchor, WorthItView } from "@/components/results/types";
import { CropCanvas, usePhotoImage } from "@/components/step-back/CropCanvas";

interface WorthItRevealProps {
  worthIt: WorthItView;
  src: string;
  frame: { width: number; height: number };
  anchors: DistanceAnchor[];
  /** DISCLAIMERS.simulation, from lib/copy. */
  disclaimer: string;
}

/**
 * "Worth it?": for each concern, how far away someone could still tell the difference a YouCam Skin Simulation makes
 * (lib/vision/worthIt.ts). The picture is a local crop of the part of the face the change would touch, today beside the
 * simulation, with "Simulation" painted into the corner of the image. Never a whole-face "after".
 */
export function WorthItReveal({ worthIt, src, frame, anchors, disclaimer }: WorthItRevealProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const groupId = useId();
  const items = worthIt.items;
  const selected = items.find((i) => i.concern === picked) ?? items[0];
  const tickM = anchors.map((a) => a.distanceM);
  const before = usePhotoImage(src);
  const after = usePhotoImage(selected?.afterImage ?? null);

  if (worthIt.state !== "ready" || !selected) {
    return (
      <div role="status" aria-live="polite" className="max-w-[36rem]">
        <p className="serif text-[clamp(1.5rem,1.2rem+1.2vw,2.25rem)] leading-snug" style={{ fontWeight: 360 }}>
          {worthIt.state === "error" ? "The simulation couldn't be drawn." : "Drawing the simulation."}
        </p>
        <p className="mt-4 text-[1rem] leading-relaxed text-ink-soft">
          {worthIt.message ??
            (worthIt.state === "error"
              ? "The numbers above are unaffected."
              : "YouCam Skin Simulation draws one picture per concern. It takes about ten seconds and the results above stay as they are.")}
        </p>
      </div>
    );
  }

  const title = selected.title.toLowerCase();
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
      <div className="order-2 lg:order-1">
        <p className="max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">{worthIt.lede}</p>

        <div className="mt-8 hidden border-t border-rule pt-5 sm:block">
          <DistanceAxisHeader anchors={anchors} />
        </div>
        <div role="radiogroup" aria-label="Concern to compare" className="mt-1 sm:mt-0">
          {items.map((item) => {
            const active = item.concern === selected.concern;
            const d = item.typicalM;
            return (
              <label key={item.concern} className="relative block cursor-pointer border-t border-rule first:border-t-0 sm:first:border-t">
                <input type="radio" name={groupId} className="peer sr-only" checked={active} onChange={() => setPicked(item.concern)} />
                <span className="block py-5 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-ink">
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className={`block h-2.5 w-2.5 shrink-0 rounded-full border border-ink ${active ? "bg-ink forced-colors:bg-[CanvasText]" : "bg-transparent"}`} />
                    <span className="eyebrow !text-[0.875rem] !text-ink-soft">{item.title}</span>
                    <span className="eyebrow ml-auto !text-[0.875rem]">{active ? "Comparing" : "Compare"}</span>
                  </span>
                  <span className="serif mt-3 block text-[clamp(1.25rem,1.05rem+0.8vw,1.625rem)] leading-[1.2]" style={{ fontWeight: 400 }}>
                    {item.headline}
                  </span>
                  {/* A large soft area states no distance. */}
                  {!item.soft && (
                    <span className="mt-1 block">
                      <DistanceBar
                        maxM={d}
                        intervalM={[d, d]}
                        relief={d <= 1.5}
                        tickM={tickM}
                        description={`${item.title}: a typical sharp-eyed person could tell the difference up to ${Math.round(d * 10) / 10} metres.`}
                      />
                    </span>
                  )}
                  {active && <span className="mt-2 block max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">{item.detail}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <figure className="order-1 lg:order-2">
        <div className="grid gap-px bg-[#8a867c] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div className="bg-paper">
            <CropCanvas image={before} frame={frame} crop={selected.crop} ariaLabel={`Close-up of the photo around the ${title}, as it is today.`} />
            <p className="px-3 py-2.5 text-[0.875rem] leading-snug">{worthIt.beforeLabel}</p>
          </div>
          <div className="bg-paper">
            <CropCanvas
              image={after}
              frame={frame}
              crop={selected.crop}
              label="Simulation"
              ariaLabel={`The same close-up in a YouCam Skin Simulation, with the ${title} changed. Simulation.`}
            />
            <p className="px-3 py-2.5 text-[0.875rem] leading-snug">{worthIt.afterLabel}</p>
          </div>
        </div>
        <figcaption className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
          YouCam Skin Simulation. A close-up of one part of the face, not the whole face. {disclaimer}
        </figcaption>
      </figure>
    </div>
  );
}
