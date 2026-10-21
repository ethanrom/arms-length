"use client";

import { useId, useMemo, useState } from "react";
import { fractionAt, type ProfilePoint } from "@/app/_lib/axis";
import { CropCanvas, usePhotoImage } from "@/components/step-back/CropCanvas";
import type { ConcernId, RgbaImage } from "@/lib/contracts";
import { concernTitle } from "@/lib/copy/concerns";
import { formatDistance } from "@/lib/copy/distance";
import { concernCrop } from "@/lib/integration/crops";
import type { ReadingBundle, WorthItEntry } from "@/lib/integration/types";
import { cropRgba, differenceToInk, relativeLuminanceDifference, shareAtLeast } from "@/lib/science/diff";
import { fmtPct } from "@/lib/science/format";
import { niceDistance } from "@/lib/science/format";
import { logScale, RangeField } from "./controls";
import { DataTable, INK, OnWidget, PAPER, Plate } from "./kit";
import { useP2b } from "./useP2b";

const DIST = logScale(0.25, 10, 150, niceDistance);
const FULL_DIFF = 0.2;
const SOFT: ConcernId[] = ["dark_circle", "eye_bag"];

/** "Worth it?" is a visible-difference question: the photo, the simulation, and how far away anyone could tell them apart. */
export function WorthItDiff() {
  const state = useP2b();
  if (state.status === "error") return <p role="alert">The recorded face could not be loaded.</p>;
  if (state.status === "loading") return <div className="sci-plate sci-hatch grid min-h-[36rem] place-items-center text-[0.875rem] text-muted"><p>Loading the recorded face.</p></div>;
  return <Diff bundle={state.bundle} />;
}

function Diff({ bundle }: { bundle: ReadingBundle }) {
  const groupId = useId();
  const entries = useMemo(
    () =>
      [...bundle.worthIt].sort((a, b) => typicalOf(b) - typicalOf(a)),
    [bundle],
  );
  const [concern, setConcern] = useState<ConcernId>(entries.find((e) => e.concern === "dark_circle") ? "dark_circle" : entries[0].concern);
  const [step, setStep] = useState(DIST.toStep(1.5));
  const distance = DIST.toValue(step);
  const entry = entries.find((e) => e.concern === concern) ?? entries[0];

  const photo = usePhotoImage(bundle.image);
  const sim = usePhotoImage(entry.whatIf.render.imageRef);
  const targets = useMemo(() => [...bundle.measurements.features, ...bundle.measurements.regions], [bundle]);
  const crop = useMemo(() => concernCrop(concern, targets, bundle.frame), [concern, targets, bundle.frame]);

  // The difference map for the crop: |Y_photo - Y_sim| / Y_sim in linear light, drawn as ink on paper.
  const shown = useMemo(() => {
    if (!photo || !sim) return null;
    const pa = cropRgba(photo, bundle.frame, crop);
    const pb = cropRgba(sim, bundle.frame, crop);
    if (pa.width !== pb.width || pa.height !== pb.height) return null;
    const d = relativeLuminanceDifference(pa, pb, 1);
    const ink = differenceToInk(d, FULL_DIFF, [245, 243, 239], [22, 21, 19]);
    const mean = d.reduce((acc, v) => acc + v, 0) / d.length;
    return { image: { width: pa.width, height: pa.height, data: ink } as RgbaImage, share5: shareAtLeast(d, 0.05), mean };
  }, [photo, sim, crop, bundle.frame]);

  const rows = entries.map((e) => [concernTitle(e.concern), e.targetCount, formatDistance(typicalOf(e)), formatDistance(e.whatIf.differenceMaxDistanceM ?? 0)]);

  return (
    <Plate
      label="Worth it: the photo, a half-strength Skin Simulation of the same face, their difference, and how far away the difference can be seen"
      caption={
        <>
          Left to right: the photo, the same part of the face in YouCam Skin Simulation at half strength, and the difference between them in linear light, darkest where
          they differ by {Math.round(FULL_DIFF * 100)}% or more. A change can only be worth it if someone can tell the two apart; the rows say from how far. A large soft area, like the
          under-eye, shows even a small change from across a room; a pore does not. The simulation is YouCam Skin Simulation at half strength, a picture of a possible change and not a result for any product.
        </>
      }
      on={
        <OnWidget
          files={[
            { path: "lib/vision/worthIt.ts", label: "worthIt" },
            { path: "lib/skin/counterfactual.ts", label: "applyCounterfactual" },
            { path: "lib/science/diff.ts", label: "relativeLuminanceDifference" },
          ]}
        >
          The distances are <code className="font-mono text-[0.875rem]">worthIt</code> run on this face&rsquo;s recorded simulations and kept in the bundle (no live YouCam call). The
          difference picture is computed in your browser from the same two images, as (Y<sub>photo</sub> − Y<sub>sim</sub>) / Y<sub>sim</sub> on 3 × 3 pixel means, the quantity{" "}
          <code className="font-mono text-[0.875rem]">worthIt</code> measures at each mark. See
        </OnWidget>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <CropCanvas image={photo} frame={bundle.frame} crop={crop} label="Today" ariaLabel={`The photo, cropped to the part of the face for ${concernTitle(concern).toLowerCase()}`} />
        <CropCanvas
          image={sim}
          frame={bundle.frame}
          crop={crop}
          label="Simulation"
          ariaLabel={`YouCam Skin Simulation at half strength, the same crop. A simulation of a possible change in the picture, not a result for any product.`}
        />
        {shown ? (
          <CropCanvas
            image={shown.image}
            frame={{ width: shown.image.width, height: shown.image.height }}
            crop={{ x: 0, y: 0, w: shown.image.width, h: shown.image.height }}
            label="Difference"
            ariaLabel={`The difference between the photo and the simulation, ink where they differ. ${Math.round(shown.share5 * 100)} percent of the crop differs by 5 percent or more.`}
          />
        ) : (
          <div className="sci-hatch grid place-items-center text-[0.875rem] text-muted" style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
            <p>Computing the difference.</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 text-[0.875rem] text-ink-soft">
        <p className="num" aria-live="polite">
          {shown ? `${fmtPct(shown.share5 * 100)}% of this crop differs by 5% or more; the average difference is ${fmtPct(shown.mean * 100)}%.` : " "}
        </p>
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="num">0%</span>
          <span className="block h-2.5 w-40 border border-ink" style={{ background: `linear-gradient(90deg, ${PAPER}, ${INK})` }} />
          <span className="num">{Math.round(FULL_DIFF * 100)}%+</span>
        </div>
      </div>

      <div className="mt-8 grid gap-x-12 gap-y-6 border-t border-ink pt-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="space-y-4">
          <RangeField
            label="Seen from"
            value={step}
            min={0}
            max={DIST.steps}
            step={1}
            onChange={setStep}
            display={formatDistance(distance)}
            valueText={`${distance.toFixed(2)} metres`}
          />
          <p className="max-w-[26rem] text-[0.875rem] leading-snug text-ink-soft">
            Pick a concern to see its crop. The counts are the marks on this face whose change a viewer could still tell at that distance.
          </p>
        </div>

        <div role="radiogroup" aria-label="Concern to compare" className="border-t border-rule">
          {entries.map((e) => {
            const active = e.concern === concern;
            const typical = typicalOf(e);
            const bound = e.whatIf.differenceMaxDistanceM ?? 0;
            const soft = SOFT.includes(e.concern);
            const nominalAt = e.whatIf.differenceNominalProfile ? fractionAt(e.whatIf.differenceNominalProfile as ProfilePoint[], distance) : null;
            const boundAt = e.whatIf.differenceProfile ? fractionAt(e.whatIf.differenceProfile as ProfilePoint[], distance) : null;
            return (
              <label key={e.concern} className="relative block cursor-pointer border-b border-rule">
                <input type="radio" name={groupId} className="peer sr-only" checked={active} onChange={() => setConcern(e.concern)} />
                <span className="grid items-center gap-x-6 gap-y-1 py-3.5 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-ink md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,14rem)]">
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className={`block h-2.5 w-2.5 shrink-0 rounded-full border border-ink ${active ? "bg-ink forced-colors:bg-[CanvasText]" : "bg-transparent"}`} />
                    <span className={`serif text-[1.125rem] ${active ? "underline decoration-1 underline-offset-4" : ""}`}>{concernTitle(e.concern)}</span>
                  </span>
                  <ReachBar typicalM={typical} boundM={bound} distance={distance} />
                  <span className="num text-[0.875rem] leading-snug text-ink-soft">
                    {soft
                      ? `Still shows at ${formatDistance(typical)}: a large soft area`
                      : nominalAt !== null && boundAt !== null
                        ? `about ${Math.round(nominalAt * e.targetCount)} of ${e.targetCount} · at most ${Math.round(boundAt * e.targetCount)}`
                        : `reaches ${formatDistance(typical)}`}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <DataTable label="Where the change from a half-strength simulation stops being detectable, per concern" head={["Concern", "Marks", "Typical person, farthest", "Even perfect eyes, farthest"]} rows={rows} />
    </Plate>
  );
}

function typicalOf(e: WorthItEntry): number {
  return e.whatIf.differenceNominalMaxDistanceM ?? (e.whatIf.differenceMaxDistanceM ?? 0) / 1.5;
}

const D_MIN = 0.25;
const D_MAX = 10;
const pos = (d: number) => Math.min(1, Math.max(0, Math.log(d / D_MIN) / Math.log(D_MAX / D_MIN))) * 100;

/** Where the change stops showing, on the shared log distance axis: a dot for a typical person, a ring for perfect eyes. */
function ReachBar({ typicalM, boundM, distance }: { typicalM: number; boundM: number; distance: number }) {
  return (
    <span
      className="relative block h-7"
      role="img"
      aria-label={`The change stops showing beyond ${formatDistance(typicalM)} for a typical sharp-eyed person and ${formatDistance(boundM)} for even perfect eyes.`}
    >
      <span className="absolute inset-x-0 top-1/2 h-px bg-[#8a867c]" />
      <span className="absolute top-1/2 h-[7px] -translate-y-1/2 border border-ink bg-ink/10" style={{ left: `${pos(typicalM)}%`, width: `${Math.max(0, pos(boundM) - pos(typicalM))}%` }} />
      <span className="absolute top-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-ink shadow-[0_0_0_2px_var(--paper)]" style={{ left: `${pos(typicalM)}%` }} />
      <span className="absolute top-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-paper shadow-[0_0_0_2px_var(--paper)]" style={{ left: `${pos(boundM)}%` }} />
      <span className="absolute top-0 block h-full w-px bg-ink" style={{ left: `${pos(distance)}%` }} aria-hidden="true" />
    </span>
  );
}
