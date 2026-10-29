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
  const d = selected.typicalM;
  return (
    <div className="grid gap-6">
      <p className="max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">{worthIt.lede}</p>

      {/* one concern at a time: a picker, then the line and the picture for the one chosen */}
      <div role="radiogroup" aria-label="Concern to compare" className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = item.concern === selected.concern;
          return (
            <label key={item.concern} className="relative cursor-pointer">
              <input type="radio" name={groupId} className="peer sr-only" checked={active} onChange={() => setPicked(item.concern)} />
              <span className="flex min-h-10 items-center gap-2 border border-ink px-3.5 text-[0.875rem] leading-none transition-colors hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:border-4 forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline">
                {item.title}
                <span className="sr-only">{active ? ": comparing" : ": compare"}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div aria-live="polite">
        <p className="serif text-[clamp(1.375rem,1.15rem+0.8vw,1.75rem)] leading-[1.2]" style={{ fontWeight: 400 }}>
          {selected.headline}
        </p>
        {/* A large soft area states no distance. */}
        {!selected.soft && (
          <div className="mt-3">
            <DistanceAxisHeader anchors={anchors} />
            <DistanceBar
              maxM={d}
              intervalM={[d, d]}
              relief={d <= 1.5}
              tickM={tickM}
              description={`${selected.title}: a typical sharp-eyed person could tell the difference up to ${Math.round(d * 10) / 10} metres.`}
            />
          </div>
        )}
        <p className="mt-2 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">{selected.detail}</p>
      </div>

      <figure>
        <div className="grid grid-cols-2 gap-px bg-[#8a867c]">
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
        <figcaption className="mt-3 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          YouCam Skin Simulation. A close-up of one part of the face, not the whole face. {disclaimer}
        </figcaption>
      </figure>
    </div>
  );
}
