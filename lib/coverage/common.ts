// Shared by the coverage search and the what-if: one measurement path for the baseline and for every render.
import type {
  ConcernId, Lever, MakeupEffect, Measurements, RenderResult, RgbaImage, ScaleEstimate, ViewingConditions,
} from "../contracts";
import { remeasure, type MeasureGeometry, type RenderOffset } from "../skin/remeasure";
import { MIN_TRUSTED_NCC, registerRender, validRegion } from "./register";
import { buildVisibilityReport } from "../vision/report";

/** What a render adapter returns: the picture decoded, plus its `RenderResult` (offset included). */
export interface RenderedImage {
  photo: RgbaImage;
  result: RenderResult;
}

export type RenderMakeup = (lever: Lever, effects: MakeupEffect[]) => Promise<RenderedImage>;

/** What both entry points need to measure a concern before and after a render. */
export interface MeasureInput {
  base: Measurements;
  /** Overrides `base.scale`, e.g. after a card calibration. */
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  /** The analysed photo, in the analysis frame. */
  photo: RgbaImage;
  /**
   * The analysis and masks `base` was measured from. With them every render is re-measured exactly (and every
   * concern can be); without them only age spots, acne and pores can, from each mark's box (see lib/skin/remeasure.ts).
   */
  geometry?: MeasureGeometry;
}

const only = (m: Measurements, concern: ConcernId): Measurements => ({
  ...m,
  features: m.features.filter((f) => f.concern === concern),
  regions: m.regions.filter((r) => r.concern === concern),
});

/** The concern's headline distance ("visible from up to"), and how many targets it has. 0 targets: distance 0. */
export function concernDistance(m: Measurements, concern: ConcernId, viewing: ViewingConditions): { maxDistanceM: number; targets: number } {
  const found = buildVisibilityReport(only(m, concern), viewing).concerns.find((c) => c.concern === concern);
  return { maxDistanceM: found?.maxDistanceM ?? 0, targets: found?.targetCount ?? 0 };
}

const IDENTITY: RenderOffset = { dx: 0, dy: 0 };

/**
 * The render's offset: measured against the photo, because the service's offset is not constant (see register.ts).
 * The offset the render came with is the fallback when the photo has too little texture to register against.
 */
export function offsetOf(photo: RgbaImage, rendered: RenderedImage): RenderOffset {
  const found = registerRender(photo, rendered.photo);
  if (found.ncc >= MIN_TRUSTED_NCC) return found;
  const { dx, dy } = rendered.result.offset;
  return { dx, dy, valid: validRegion(photo, rendered.photo, dx, dy) };
}

export function measurementsFor(input: MeasureInput): {
  base: Measurements;
  baseline: Measurements;
  /** The render re-measured, and the offset used (to store on the step's `RenderResult`). */
  after: (rendered: RenderedImage) => { measurements: Measurements; offset: RenderOffset };
} {
  const base: Measurements = { ...input.base, scale: input.scale };
  const options = { geometry: input.geometry, frame: { width: input.photo.width, height: input.photo.height } };
  return {
    base,
    // Exact geometry: the base measurements are the baseline. Otherwise measure the photo the way the renders are measured,
    // so the baseline and the steps differ only by the render.
    baseline: input.geometry ? base : remeasure(base, input.photo, IDENTITY, options),
    after: (rendered) => {
      const offset = offsetOf(input.photo, rendered);
      return { measurements: remeasure(base, rendered.photo, offset, options), offset };
    },
  };
}
