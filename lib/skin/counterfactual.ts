/**
 * Counterfactual contrast: dark circles, eye bags, redness and wrinkles measured as the photo against YouCam Skin
 * Simulation of the same face without those concerns, (photo - simulation) / simulation in linear light (COUNTERFACTUAL_CONCERNS
 * in params.ts says why a surround is not enough for them).
 *
 * The pixel work happens in `measureAnalysis` (it has the masks, so regions are alpha-weighted and wrinkles are cut
 * across their crease); this file brings the simulation into the photo's frame and applies it to existing measurements.
 */
import type { Measurements, RgbaImage } from "../contracts";
import { MIN_TRUSTED_NCC, registerRender, validRegion } from "../coverage/register";
import { measureAnalysis } from "./measure";
import { COUNTERFACTUAL_CONCERNS } from "./params";
import { alignRender, type MeasureGeometry, type RenderOffset } from "./remeasure";

/**
 * The simulation render in the photo's frame. The offset is measured against the photo (the service's output offset is
 * not constant, see lib/coverage/register.ts); `offset` is the fallback when the photo has too little texture to
 * register against.
 */
export function alignCounterfactual(photo: RgbaImage, simRender: RgbaImage, offset?: RenderOffset): RgbaImage {
  const found = registerRender(photo, simRender);
  const use: RenderOffset =
    found.ncc >= MIN_TRUSTED_NCC || !offset
      ? found
      : { dx: offset.dx, dy: offset.dy, valid: offset.valid ?? validRegion(photo, simRender, offset.dx, offset.dy) };
  return alignRender(simRender, use, { width: photo.width, height: photo.height });
}

/**
 * `measurements` with the contrast of dark circles, eye bags, redness and wrinkles taken against the simulation
 * (`contrastBasis: "counterfactual"`, regions `reference: "simulation"`). Everything else, spots, pores and acne included,
 * is returned as it was. `geometry` is the analysis and masks the measurements came from: `Measurements` keeps no pixels, and the
 * region weights and wrinkle creases are needed to read the two images at the same places.
 */
export function applyCounterfactual(
  measurements: Measurements,
  photo: RgbaImage,
  simRender: RgbaImage,
  offset: RenderOffset | undefined,
  geometry: MeasureGeometry,
): Measurements {
  const aligned = alignCounterfactual(photo, simRender, offset);
  const fresh = measureAnalysis(geometry.analysis, geometry.masks, photo, measurements.scale, aligned);
  const regions = new Map(fresh.regions.map((r) => [r.id, r]));
  const features = new Map(fresh.features.map((f) => [f.id, f]));
  return {
    ...measurements,
    features: measurements.features.map((f) => {
      const g = features.get(f.id);
      return g && COUNTERFACTUAL_CONCERNS.includes(f.concern) ? { ...f, contrast: g.contrast, contrastBasis: g.contrastBasis } : f;
    }),
    regions: measurements.regions.map((r) => {
      const g = regions.get(r.id);
      return g && COUNTERFACTUAL_CONCERNS.includes(r.concern)
        ? { ...r, contrast: g.contrast, reference: g.reference, contrastBasis: g.contrastBasis }
        : r;
    }),
  };
}
