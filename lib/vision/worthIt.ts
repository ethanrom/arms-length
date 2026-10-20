/**
 * "Worth it?": how far away the *change* a Skin Simulation improvement would make stays detectable.
 *
 * The usual report says what others can see of a concern as it is. This one asks what an improvement would be worth:
 * each target's contrast is replaced by the difference between the photo and the simulated improvement,
 * (photo - simulation) / simulation (lib/skin/counterfactual.ts), sizes unchanged, then judged by the same visibility
 * model and aggregated the same way (max, median, profile). It is a bound too, and uses the same one-sided margin.
 * Small features usually give a short distance (nobody would notice the change); a large soft area gives a long one,
 * because a few percent of contrast over 3 to 4 cm is detectable from far away.
 *
 * Use a half-strength simulation: strength 1.0 beautifies beyond natural (spike, 2026-10-21).
 * Words: it is a simulation of a possible change in the picture, never what a product or routine would do (lib/copy/worthit.ts).
 */
import type { ConcernId, Measurements, RgbaImage, WhatIf } from "../contracts";
import { DEFAULT_VIEWING, type ViewingConditions } from "../contracts/vision";
import { applyCounterfactual } from "../skin/counterfactual";
import type { MeasureGeometry, RenderOffset } from "../skin/remeasure";
import { buildVisibilityReport, detectabilityProfile } from "./report";

/**
 * The "Worth it?" fields of a `WhatIf`, plus how many targets the distances are over. The nominal twins (average
 * observer, margin 0) are what a visible-side sentence reads ("a typical person could see the difference from ...");
 * the bound fields back the "wouldn't see it beyond ..." sentences. Proposed for the `WhatIf` contract.
 */
export type WorthIt = Pick<WhatIf, "concern"> &
  Required<Pick<WhatIf, "differenceMaxDistanceM" | "differenceMedianDistanceM" | "differenceProfile">> & {
    targetCount: number;
    differenceNominalMaxDistanceM?: number;
    differenceNominalProfile?: NonNullable<WhatIf["differenceProfile"]>;
  };

export interface WorthItOptions {
  viewing?: ViewingConditions;
  /** The offset the render came with: the fallback when the photo is too flat to register against. */
  offset?: RenderOffset;
}

/**
 * One entry per requested concern, in the order given (0 targets and distance 0 for a concern with nothing measured).
 * `simRender` must be a simulation that changed those concerns (the caller picks the render; a concern the simulation
 * left alone comes out near 0). `geometry` is the analysis and masks `measurements` came from.
 */
export function worthIt(
  measurements: Measurements,
  geometry: MeasureGeometry,
  photo: RgbaImage,
  simRender: RgbaImage,
  concerns: readonly ConcernId[],
  options: WorthItOptions = {},
): WorthIt[] {
  const different = applyCounterfactual(measurements, photo, simRender, options.offset, geometry);
  const chosen: Measurements = {
    ...different,
    features: different.features.filter((f) => concerns.includes(f.concern)),
    regions: different.regions.filter((r) => concerns.includes(r.concern)),
  };
  const report = buildVisibilityReport(chosen, options.viewing ?? DEFAULT_VIEWING);
  return concerns.map((concern) => {
    const c = report.concerns.find((x) => x.concern === concern);
    return {
      concern,
      targetCount: c?.targetCount ?? 0,
      differenceMaxDistanceM: c?.maxDistanceM ?? 0,
      differenceMedianDistanceM: c?.medianDistanceM ?? 0,
      differenceProfile: c?.profile ?? detectabilityProfile([]),
      ...(c?.nominalProfile ? { differenceNominalMaxDistanceM: c.nominalMaxDistanceM, differenceNominalProfile: c.nominalProfile } : {}),
    };
  });
}
