/**
 * Least coverage (PLAN 2.4, spike 9.4): the lowest foundation `coverageIntensity` that hides a concern from a stated
 * distance, verified on renders.
 *
 * - Metric: `fractionAtTarget`, the share of the concern's targets whose bound distance reaches `targetDistanceM`
 *   (default 1.5 m, across a table). The strongest single mark stays visible at any coverage (a dark mole sat at the 10 m
 *   cap on every recorded face), so the maximum would never be met; it is kept as information only.
 * - Lever: foundation coverageIntensity with `skin_smooth` 0. With smoothing at 0 a no-makeup render is the input
 *   itself (spike 9.3), so the baseline costs nothing.
 * - met: the lowest grid coverage with fractionAtTarget <= MET_FRACTION (10%). Bisection over {25, 50, 75, 100}, which
 *   needs the monotone response of spike 9.3: 50 first, then 25 if 50 meets, otherwise 75 and then 100.
 * - not_met: nothing reaches it. `chosen` is the knee, the lowest coverage whose reduction (baseline - fraction) is at
 *   least KNEE_SHARE (80%) of the reduction at 100 ("most of the effect at 50%"). 100 is already rendered by then; 25 is
 *   rendered only when 50 already reaches the knee. If 100 reduces nothing, `chosen` is null (reason no_effect).
 * - At most 4 renders. Spots, acne and pores respond; dark circles and eye bags have no makeup lever (spike 9.3).
 *   Wrinkles and redness were not tested, so they are reported as having no verified lever rather than searched.
 */
import type { ConcernId, CoveragePlan, CoverageStep, Lever, MakeupEffect } from "../contracts";
import { concernStats, DEFAULT_TARGET_DISTANCE_M, measurementsFor, type ConcernStats, type MeasureInput, type RenderMakeup } from "./common";
import { skinShade } from "./shade";

export const COVERAGE_GRID = [25, 50, 75, 100] as const;
/** A concern is hidden when at most this share of its targets is still detectable at the target distance (contracts/render.ts). */
export const MET_FRACTION = 0.1;
/** The knee: the lowest coverage reaching this share of the reduction that 100% coverage achieves (contracts/render.ts). */
export const KNEE_SHARE = 0.8;

const EPS = 1e-9;

export type NoLeverReason = "no_makeup_lever" | "lever_not_tested" | "not_a_visible_mark";
export type PlanNote = NoLeverReason | "already_met" | "no_targets" | "no_effect";

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
  /** Metres. Default 1.5. */
  targetDistanceM?: number;
  /** Renders one makeup preview. `effects` carries the shade; an adapter that replays recordings can ignore it. */
  render: RenderMakeup;
}

export async function planCoverage(input: PlanInput): Promise<CoveragePlan> {
  const { concern, viewing, render, targetDistanceM = DEFAULT_TARGET_DISTANCE_M } = input;
  const statsOf = (m: Parameters<typeof concernStats>[0]) => concernStats(m, concern, viewing, targetDistanceM);
  const plan = (
    baseline: ConcernStats,
    status: CoveragePlan["status"],
    reason?: PlanNote,
    steps: CoverageStep[] = [],
    chosen: CoverageStep | null = null,
  ): CoveragePlan => ({
    concern,
    targetDistanceM,
    baselineDistanceM: baseline.maxDistanceM,
    baselineFraction: baseline.fractionAtTarget,
    steps,
    chosen,
    status,
    ...(reason ? { reason } : {}),
  });

  const noLever = NO_LEVER[concern];
  if (noLever) return plan(statsOf(input.base), "no_lever", noLever);

  const m = measurementsFor(input);
  const baseline = statsOf(m.baseline);
  if (baseline.targets === 0) return plan(baseline, "met", "no_targets");
  if (baseline.fractionAtTarget <= MET_FRACTION) return plan(baseline, "met", "already_met");

  const shade = skinShade(input.photo, m.base);
  const steps: CoverageStep[] = [];
  const attempt = async (coverage: number): Promise<CoverageStep> => {
    const lever: Lever = { category: "foundation", field: "coverageIntensity", value: coverage };
    const rendered = await render(lever, foundationEffects(shade, coverage));
    const { measurements, offset } = m.after(rendered);
    const after = statsOf(measurements);
    const step: CoverageStep = {
      lever,
      render: { ...rendered.result, offset: { dx: offset.dx, dy: offset.dy } },
      maxDistanceM: after.maxDistanceM,
      fractionAtTarget: after.fractionAtTarget,
    };
    steps.push(step);
    return step;
  };
  const fraction = (s: CoverageStep) => s.fractionAtTarget ?? 0;
  // Fractions are counts over the target total: the epsilon keeps 4/7 >= 0.8 * 5/7 and 1/10 <= 10% true in floating point.
  const meets = (s: CoverageStep) => fraction(s) <= MET_FRACTION + EPS;

  const [low, mid, high, top] = COVERAGE_GRID;
  const middle = await attempt(mid);
  if (meets(middle)) {
    const lower = await attempt(low);
    return plan(baseline, "met", undefined, steps, meets(lower) ? lower : middle);
  }
  const upper = await attempt(high);
  if (meets(upper)) return plan(baseline, "met", undefined, steps, upper);
  const full = await attempt(top);
  if (meets(full)) return plan(baseline, "met", undefined, steps, full);

  // Not met: the knee of the reduction curve.
  const reduction = (s: CoverageStep) => baseline.fractionAtTarget - fraction(s);
  const best = reduction(full);
  if (!(best > 0)) return plan(baseline, "not_met", "no_effect", steps, null);
  const reaches = (s: CoverageStep) => reduction(s) >= KNEE_SHARE * best - EPS;
  // 25 can only qualify if 50 does (the response is monotone), so it is rendered only then.
  if (reaches(middle)) {
    const lower = await attempt(low);
    return plan(baseline, "not_met", undefined, steps, reaches(lower) ? lower : middle);
  }
  return plan(baseline, "not_met", undefined, steps, reaches(upper) ? upper : full);
}
