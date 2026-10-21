"use client";

import { useId, useState } from "react";
import { formatDistance } from "@/app/_lib/axis";
import type { ConcernId, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import type { CoverageOption, CoverageView } from "@/components/results/types";
import { CropCanvas, usePhotoImage } from "@/components/step-back/CropCanvas";
import { useRenderedFrame } from "@/components/step-back/useDistanceFrames";

interface MakeItDisappearProps {
  coverage: CoverageView;
  src: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  /** Live sessions: run the try-ons for a concern. Demo faces have them recorded, so this is absent. */
  onRun?: (concern: ConcernId) => void;
}

const TRY_ON = "Virtual try-on";

/**
 * "The lightest touch": the least foundation coverage that puts a concern out of sight at a chosen distance, checked on a
 * virtual try-on. The pictures are local crops of the part of the face involved, with "Virtual try-on" painted into the
 * corner of the image; never a whole-face "after".
 */
export function MakeItDisappear({ coverage, src, frame, scale, viewing, onRun }: MakeItDisappearProps) {
  const groupId = useId();
  const viewId = useId();
  const options = coverage.options;
  const [index, setIndex] = useState(0);
  const [far, setFar] = useState(true);
  const option = options[Math.min(index, options.length - 1)];
  if (!option) return null;

  const { plan } = option;
  const target = coverage.targetM;
  const lever = plan?.chosen?.lever;
  const noLeverNeeded = plan?.status === "met" && !plan.chosen;
  const eyebrow = !plan ? (option.state === "running" ? "Working on it" : "On request") : plan.status === "met" ? "Checked on a virtual try-on" : "Honest answer";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <fieldset>
          <legend className="eyebrow !text-[0.875rem]">Out of sight from {formatDistance(target)}: choose a concern</legend>
          <div className="mt-3 inline-flex flex-wrap border border-ink" role="radiogroup" aria-label="Concern">
            {options.map((o, i) => (
              <label key={o.concern} className="relative cursor-pointer">
                <input type="radio" name={groupId} className="peer sr-only" checked={index === i} onChange={() => setIndex(i)} />
                <span className="flex min-h-12 min-w-[5.25rem] items-center justify-center border-l border-ink px-5 text-[1rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline">
                  {o.title}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div aria-live="polite" aria-busy={option.state === "running"} className="mt-10">
          <p className="eyebrow !text-[0.875rem]">{eyebrow}</p>
          <p className="serif mt-3 text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.1]" style={{ fontWeight: 380 }}>
            {option.headline}
          </p>

          {lever && option.leverLabel ? (
            <p className="mt-6 flex items-baseline gap-3 border-t border-rule pt-5">
              <span className="serif num text-[3.25rem] font-light leading-none tracking-[-0.03em]">{lever.value}%</span>
              <span className="text-[1rem] text-ink-soft">{option.leverName ?? option.leverLabel}, in the try-on</span>
            </p>
          ) : plan ? (
            <p className="mt-6 border-t border-rule pt-5 text-[1rem] text-ink-soft">
              {noLeverNeeded ? "No coverage needed at this distance." : "No coverage level reaches this distance."}
            </p>
          ) : null}

          <p className="mt-5 max-w-[32rem] text-[1rem] leading-relaxed text-ink-soft">{option.detail}</p>

          {!plan && onRun && (
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => onRun(option.concern)}
              disabled={option.state === "running"}
              aria-disabled={option.state === "running"}
            >
              {option.state === "running" ? "Rendering try-ons…" : option.state === "error" ? "Try again" : "Find the lightest touch"}
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
        {option.afterImage && (
          <fieldset className="mb-4">
            <legend className="sr-only">View of the crops</legend>
            <div className="inline-flex border border-ink" role="radiogroup" aria-label="View of the crops">
              {[
                { value: false, label: "Up close" },
                { value: true, label: `From ${formatDistance(target)}` },
              ].map((v) => (
                <label key={v.label} className="relative cursor-pointer">
                  <input type="radio" name={viewId} className="peer sr-only" checked={far === v.value} onChange={() => setFar(v.value)} />
                  <span className="flex min-h-11 items-center justify-center border-l border-ink px-4 text-[0.9375rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline">
                    {v.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className={`grid gap-px bg-[#8a867c] ${option.afterImage ? "sm:grid-cols-2" : "sm:max-w-[50%]"}`}>
          {far ? (
            <FarCrops key={`${option.concern}-${option.afterImage ?? "none"}`} option={option} src={src} frame={frame} scale={scale} viewing={viewing} distanceM={target} />
          ) : (
            <NearCrops option={option} src={src} frame={frame} />
          )}
        </div>
        <figcaption className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
          {far ? `Both seen from ${formatDistance(target)}, by an observer with perfect eyesight. ` : "Both up close, as the photo and the try-on are. "}
          {option.afterImage ? `A close-up of one part of the face, not the whole face. The right-hand picture is a ${TRY_ON.toLowerCase()} of one shade, aligned to the photo.` : ""}
        </figcaption>
      </figure>
    </div>
  );
}

const nounOf = (o: CoverageOption) => o.title.toLowerCase();

function Pane({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="bg-paper">
      {children}
      <p className="px-3 py-2.5 text-[0.875rem] leading-snug">{label}</p>
    </div>
  );
}

function NearCrops({ option, src, frame }: { option: CoverageOption; src: string; frame: { width: number; height: number } }) {
  const now = usePhotoImage(src);
  const after = usePhotoImage(option.afterImage);
  return (
    <>
      <Pane label="Now">
        <CropCanvas image={now} frame={frame} crop={option.crop} ariaLabel={`Close-up of the photo around the ${nounOf(option)}, as it is.`} />
      </Pane>
      {option.afterImage && (
        <Pane label={option.leverLabel ? `With ${option.leverLabel}` : "With coverage"}>
          <CropCanvas
            image={after}
            frame={frame}
            crop={option.crop}
            label={TRY_ON}
            ariaLabel={`The same close-up on a virtual try-on of foundation. ${TRY_ON}.`}
          />
        </Pane>
      )}
    </>
  );
}

interface FarProps {
  option: CoverageOption;
  src: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  distanceM: number;
}

function FarCrops(props: FarProps) {
  const { option, src, frame, scale, viewing, distanceM } = props;
  const now = useRenderedFrame(src, scale, viewing, distanceM, 1200);
  return (
    <>
      <Pane label="Now">
        <CropCanvas
          image={now.frame}
          frame={frame}
          crop={option.crop}
          ariaLabel={`Close-up of the photo around the ${nounOf(option)}, as an observer sees it from ${formatDistance(distanceM)}.`}
        />
      </Pane>
      {option.afterImage && <FarAfter {...props} afterSrc={option.afterImage} />}
    </>
  );
}

function FarAfter({ option, afterSrc, frame, scale, viewing, distanceM }: FarProps & { afterSrc: string }) {
  const after = useRenderedFrame(afterSrc, scale, viewing, distanceM, 1200);
  return (
    <Pane label={option.leverLabel ? `With ${option.leverLabel}` : "With coverage"}>
      <CropCanvas
        image={after.frame}
        frame={frame}
        crop={option.crop}
        label={TRY_ON}
        ariaLabel={`The same close-up on a virtual try-on of foundation, seen from ${formatDistance(distanceM)}. ${TRY_ON}.`}
      />
    </Pane>
  );
}
