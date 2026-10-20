"use client";

import { useId, useState } from "react";
import { formatDistance } from "@/app/_lib/axis";
import type { ConcernId, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { cropAround } from "@/components/concerns/AnnotatedFace";
import type { ConcernView } from "@/components/results/derive";
import type { CoverageView } from "@/components/results/types";
import { RenderedCrop } from "@/components/step-back/RenderedCrop";

interface MakeItDisappearProps {
  coverage: CoverageView;
  views: ConcernView[];
  src: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  /** Live sessions: run the try-ons for a concern. Demo faces have them recorded, so this is absent. */
  onRun?: (concern: ConcernId) => void;
}

export function MakeItDisappear({ coverage, views, src, frame, scale, viewing, onRun }: MakeItDisappearProps) {
  const groupId = useId();
  const options = coverage.options;
  const [index, setIndex] = useState(0);
  const option = options[Math.min(index, options.length - 1)];
  if (!option) return null;

  const { plan } = option;
  const target = coverage.targetM;
  const view = views.find((v) => v.id === option.concern);
  const crop = cropAround(view?.bounds ?? { x: 0, y: 0, w: frame.width, h: frame.height }, frame, 0.7, 1);
  const lever = plan?.chosen?.lever;
  const noLeverNeeded = plan?.status === "met" && !plan.chosen;
  const eyebrow = !plan ? (option.state === "running" ? "Working on it" : "On request") : plan.status === "met" ? "Verified on a render" : "Honest answer";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <fieldset>
          <legend className="eyebrow">Hide from {formatDistance(target)}: choose a concern</legend>
          <div className="mt-3 inline-flex flex-wrap border border-ink" role="radiogroup" aria-label="Concern">
            {options.map((o, i) => (
              <label key={o.concern} className="relative cursor-pointer">
                <input type="radio" name={groupId} className="peer sr-only" checked={index === i} onChange={() => setIndex(i)} />
                <span className="flex min-h-12 min-w-[5.25rem] items-center justify-center border-l border-ink px-5 text-[1rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink">
                  {o.title}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div aria-live="polite" aria-busy={option.state === "running"} className="mt-10">
          <p className="eyebrow">{eyebrow}</p>
          <p className="serif mt-3 text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.1]" style={{ fontWeight: 360 }}>
            {option.headline}
          </p>

          {lever && option.leverLabel ? (
            <p className="mt-6 flex items-baseline gap-3 border-t border-rule pt-5">
              <span className="serif num text-[3.25rem] font-light leading-none tracking-[-0.03em]">{lever.value}%</span>
              <span className="text-[0.9375rem] text-muted">{option.leverName ?? option.leverLabel}</span>
            </p>
          ) : plan ? (
            <p className="mt-6 border-t border-rule pt-5 text-[0.9375rem] text-muted">
              {noLeverNeeded ? "No coverage needed at this distance." : "No coverage level reaches this distance."}
            </p>
          ) : null}

          <p className="mt-5 max-w-[32rem] text-[0.9375rem] leading-relaxed text-ink-soft">{option.detail}</p>

          {!plan && onRun && (
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => onRun(option.concern)}
              disabled={option.state === "running"}
              aria-disabled={option.state === "running"}
            >
              {option.state === "running" ? "Rendering try-ons…" : option.state === "error" ? "Try again" : "Make it disappear"}
              {option.state !== "running" && (
                <span className="arrow" aria-hidden="true">
                  &rarr;
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <figure>
        <div className={`grid gap-px bg-rule-strong ${option.afterImage ? "grid-cols-2" : "grid-cols-1 sm:max-w-[50%]"}`}>
          {[
            { label: "Now", src },
            ...(option.afterImage ? [{ label: option.leverLabel ? `With ${option.leverLabel}` : "With coverage", src: option.afterImage }] : []),
          ].map((side) => (
            <div key={side.label} className="stage on-stage">
              <RenderedCrop src={side.src} frame={frame} scale={scale} viewing={viewing} distanceM={target} crop={crop} />
              <p className="bg-paper px-3 py-2.5 text-[0.8125rem] leading-snug">{side.label}</p>
            </div>
          ))}
        </div>
        <figcaption className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          Both seen from {formatDistance(target)}, by an observer with perfect eyesight.
          {option.afterImage ? " The right-hand image is a YouCam Makeup try-on, aligned to the photo." : ""}
        </figcaption>
      </figure>
    </div>
  );
}
