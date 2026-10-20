/**
 * What-if (PLAN 2.5): one Skin Simulation strength for one concern, then the same concern measured again.
 * Simulation output is pixel-aligned (offset 0, spike 7) and edits only the flagged regions, so the same masks apply.
 */
import type { ConcernId, SimulationStrengths, WhatIf } from "../contracts";
import { MASKLESS_CONCERNS } from "../skin/remeasure";
import { concernStats, DEFAULT_TARGET_DISTANCE_M, measurementsFor, type MeasureInput, type RenderedImage } from "./common";

export const SIMULATION_KEY: Partial<Record<ConcernId, keyof SimulationStrengths>> = {
  age_spot: "spots",
  acne: "acne",
  redness: "redness",
  pore: "pores",
  wrinkle: "wrinkle",
  dark_circle: "dark_circle",
  eye_bag: "eye_bags",
};

/** `WhatIf` plus the share of the concern's targets still detectable at the target distance, before and after. */
export type WhatIfResult = WhatIf & { beforeFraction: number; afterFraction: number };

export interface WhatIfInput extends MeasureInput {
  concern: ConcernId;
  /** Metres, for the fractions. Default 1.5. */
  targetDistanceM?: number;
  /** 0 < strength <= 1. Default 0.5. */
  strength?: number;
  render: (strengths: SimulationStrengths) => Promise<RenderedImage>;
}

export async function whatIf(input: WhatIfInput): Promise<WhatIfResult> {
  const { concern, viewing, render, strength = 0.5, targetDistanceM = DEFAULT_TARGET_DISTANCE_M } = input;
  const key = SIMULATION_KEY[concern];
  if (!key) throw new RangeError(`Skin Simulation has no control for ${concern}`);
  if (!(strength > 0 && strength <= 1)) throw new RangeError("strength must be above 0 and at most 1");
  if (!input.geometry && !MASKLESS_CONCERNS.includes(concern)) {
    throw new RangeError(`re-measuring ${concern} needs the analysis masks (pass geometry)`);
  }

  const m = measurementsFor(input);
  const strengths: SimulationStrengths = { [key]: strength };
  const rendered = await render(strengths);
  const { measurements, offset } = m.after(rendered);
  const before = concernStats(m.baseline, concern, viewing, targetDistanceM);
  const after = concernStats(measurements, concern, viewing, targetDistanceM);
  return {
    concern,
    strengths,
    render: { ...rendered.result, offset: { dx: offset.dx, dy: offset.dy } },
    beforeDistanceM: before.maxDistanceM,
    afterDistanceM: after.maxDistanceM,
    beforeFraction: before.fractionAtTarget,
    afterFraction: after.fractionAtTarget,
  };
}
