"use client";

import { useId, useState } from "react";
import { formatDistance } from "@/app/_lib/axis";
import type { ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { cropAround } from "@/components/concerns/AnnotatedFace";
import type { ConcernView } from "@/components/results/derive";
import type { CoverageView } from "@/components/results/types";
import { RenderedCrop } from "@/components/step-back/RenderedCrop";

interface MakeItDisappearProps {
  coverage: CoverageView;
  view: ConcernView | undefined;
  src: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  viewing: ViewingConditions;
}

export function MakeItDisappear({ coverage, view, src, frame, scale, viewing }: MakeItDisappearProps) {
  const groupId = useId();
  const options = coverage.options;
  const [index, setIndex] = useState(Math.max(0, options.findIndex((o) => o.plan.targetDistanceM === 1)));
  const option = options[index];
  if (!option) return null;

  const { plan } = option;
  const target = plan.targetDistanceM;
  const crop = cropAround(view?.bounds ?? { x: 0, y: 0, w: frame.width, h: frame.height }, frame, 0.7, 1);
  const noLeverNeeded = plan.status === "met" && !plan.chosen;
  const lever = plan.chosen?.lever;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <fieldset>
          <legend className="eyebrow">Out of sight beyond</legend>
          <div className="mt-3 inline-flex border border-ink" role="radiogroup" aria-label="Target distance">
            {options.map((o, i) => (
              <label key={o.plan.targetDistanceM} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={groupId}
                  className="peer sr-only"
                  checked={index === i}
                  onChange={() => setIndex(i)}
                />
                <span className="num flex min-h-12 min-w-[5.25rem] items-center justify-center border-l border-ink px-5 text-[1rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink">
                  {formatDistance(o.plan.targetDistanceM)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div aria-live="polite" className="mt-10">
          <p className="eyebrow">{plan.status === "met" ? "Verified on a render" : "Honest answer"}</p>
          <p className="serif mt-3 text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.1]" style={{ fontWeight: 360 }}>
            {option.headline}
          </p>

          {lever && option.leverLabel ? (
            <p className="mt-6 flex items-baseline gap-3 border-t border-rule pt-5">
              <span className="serif num text-[3.25rem] font-light leading-none tracking-[-0.03em]">{lever.value}%</span>
              <span className="text-[0.9375rem] text-muted">{option.leverName ?? option.leverLabel}</span>
            </p>
          ) : (
            <p className="mt-6 border-t border-rule pt-5 text-[0.9375rem] text-muted">
              {noLeverNeeded ? "No coverage needed at this distance." : "No coverage level reaches this distance."}
            </p>
          )}

          <p className="mt-5 max-w-[32rem] text-[0.9375rem] leading-relaxed text-ink-soft">{option.detail}</p>
        </div>
      </div>

      <figure>
        <div className="grid grid-cols-2 gap-px bg-rule-strong">
          {[
            { label: "Now", src },
            { label: lever && option.leverLabel ? `With ${option.leverLabel}` : "With coverage", src: option.afterImage },
          ].map((side) => (
            <div key={side.label} className="stage on-stage">
              <RenderedCrop src={side.src} frame={frame} scale={scale} viewing={viewing} distanceM={target} crop={crop} />
              <p className="bg-paper px-3 py-2.5 text-[0.8125rem] leading-snug">{side.label}</p>
            </div>
          ))}
        </div>
        <figcaption className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          Both seen from {formatDistance(target)}, by an observer with perfect eyesight.
          {option.afterIsPreview ? " The right-hand image is an illustrative preview until the matching render is recorded." : ""}
        </figcaption>
      </figure>
    </div>
  );
}
