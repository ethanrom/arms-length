/**
 * Counterfactual contrast: every target's contrast as the *difference* between the photo and a YouCam Skin Simulation
 * of the same face with the concern improved, (photo - simulation) / simulation in linear light. It answers "how
 * visible is the change this improvement would make?" (the "Worth it?" metric, lib/vision/worthIt.ts), which is not the
 * same as "what do others see?" (contrast against the surround, the default of `measureAnalysis`).
 *
 * The pixel work happens in `measureAnalysis` (it has the masks, so regions are alpha-weighted and wrinkles are cut
 * across their crease); this file brings the simulation into the photo's frame and applies it to existing measurements.
 */
import type { Measurements, RgbaImage } from "../contracts";
import { MIN_TRUSTED_NCC, registerRender, validRegion } from "../coverage/register";
import { measureAnalysis } from "./measure";
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
 * `measurements` with every target's contrast replaced by the difference against the simulation
 * (`contrastBasis: "counterfactual"`, regions `reference: "simulation"`). Sizes, ids and everything else are as they were.
 * Concerns the simulation did not touch come out with contrast near 0. `geometry` is the analysis and masks the
 * measurements came from: `Measurements` keeps no pixels, and the region weights, spot outlines and wrinkle creases
 * are needed to read the two images at the same places.
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
      return g ? { ...f, contrast: g.contrast, contrastBasis: g.contrastBasis } : f;
    }),
    regions: measurements.regions.map((r) => {
      const g = regions.get(r.id);
      return g ? { ...r, contrast: g.contrast, reference: g.reference, contrastBasis: g.contrastBasis } : r;
    }),
  };
}
