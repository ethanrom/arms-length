/**
 * Least coverage (PLAN 2.4, spike 9.4): the lowest foundation `coverageIntensity` that brings a concern's
 * visibility distance to the target, verified on renders.
 *
 * - Lever: foundation coverageIntensity with `skin_smooth` 0. With smoothing at 0 a no-makeup render is the input
 *   itself (spike 9.3), so the baseline costs nothing and the search starts from the measured photo.
 * - Search: bisection over the grid {25, 50, 75, 100}, at most 3 renders. 50 first; if it meets the target try 25,
 *   otherwise 75 and then 100. Response is monotone and concave (spike 9.3), which is what bisection needs.
 * - Spots, acne and pores respond; dark circles and eye bags have no makeup lever (spike 9.3). Wrinkles and redness
 *   were not tested, so they are reported as having no verified lever rather than searched.
 */
import type { ConcernId, CoveragePlan, CoverageStep, Lever, MakeupEffect } from "../contracts";
import { concernDistance, measurementsFor, type MeasureInput, type RenderMakeup } from "./common";
import { skinShade } from "./shade";

export const COVERAGE_GRID = [25, 50, 75, 100] as const;

export type NoLeverReason = "no_makeup_lever" | "lever_not_tested" | "not_a_visible_mark";
export type PlanNote = NoLeverReason | "already_met" | "no_targets";

/** A `CoveragePlan` plus the machine-readable reason behind a plan that needed no render (proposed contract field). */
export type CoveragePlanResult = CoveragePlan & { reason?: PlanNote };

const NO_LEVER: Partial<Record<ConcernId, NoLeverReason>> = {
  dark_circle: "no_makeup_lever", // concealer sliders and foundation coverage do not move it (spike 9.3)
  eye_bag: "no_makeup_lever",
  wrinkle: "lever_not_tested",
  redness: "lever_not_tested",
  texture: "not_a_visible_mark",
};

/** `skin_smooth` first, at 0 (spike 9.3), then foundation: colourIntensity 50 and glow 0 as in the spike's renders. */
export function foundationEffects(shade: string, coverage: number): MakeupEffect[] {
  return [
    { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 },
    {
      category: "foundation",
      palettes: [{ color: shade, colorIntensity: 50, glowIntensity: 0, coverageIntensity: Math.round(Math.min(100, Math.max(0, coverage))) }],
    },
  ];
}

export interface PlanInput extends MeasureInput {
  concern: ConcernId;
  targetDistanceM: number;
  /** Renders one makeup preview. `effects` carries the shade; an adapter that replays recordings can ignore it. */
  render: RenderMakeup;
}

export async function planCoverage(input: PlanInput): Promise<CoveragePlanResult> {
  const { concern, targetDistanceM, viewing, render } = input;
  const empty = (baselineDistanceM: number, status: CoveragePlan["status"], reason: PlanNote): CoveragePlanResult => ({
    concern, targetDistanceM, baselineDistanceM, steps: [], chosen: null, status, reason,
  });

  const noLever = NO_LEVER[concern];
  if (noLever) return empty(concernDistance(input.base, concern, viewing).maxDistanceM, "no_lever", noLever);

  const m = measurementsFor(input);
  const baseline = concernDistance(m.baseline, concern, viewing);
  if (baseline.targets === 0) return empty(0, "met", "no_targets");
  if (baseline.maxDistanceM <= targetDistanceM) return empty(baseline.maxDistanceM, "met", "already_met");

  const shade = skinShade(input.photo, m.base);
  const steps: CoverageStep[] = [];
  const attempt = async (coverage: number): Promise<CoverageStep> => {
    const lever: Lever = { category: "foundation", field: "coverageIntensity", value: coverage };
    const rendered = await render(lever, foundationEffects(shade, coverage));
    const { measurements, offset } = m.after(rendered);
    const step: CoverageStep = {
      lever,
      render: { ...rendered.result, offset: { dx: offset.dx, dy: offset.dy } },
      maxDistanceM: concernDistance(measurements, concern, viewing).maxDistanceM,
    };
    steps.push(step);
    return step;
  };
  const meets = (s: CoverageStep) => s.maxDistanceM <= targetDistanceM;

  const [low, mid, high, top] = COVERAGE_GRID;
  let chosen: CoverageStep | null = null;
  const middle = await attempt(mid);
  if (meets(middle)) {
    chosen = middle;
    const lower = await attempt(low);
    if (meets(lower)) chosen = lower;
  } else {
    const upper = await attempt(high);
    if (meets(upper)) chosen = upper;
    else {
      const full = await attempt(top);
      if (meets(full)) chosen = full;
    }
  }
  return { concern, targetDistanceM, baselineDistanceM: baseline.maxDistanceM, steps, chosen, status: chosen ? "met" : "not_met" };
}
