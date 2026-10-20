/**
 * Server-side scale (mm per px) from YouCam's own masks, for callers who send no `scale` (no iris, no card).
 * MediaPipe iris detection is browser-only, so the eyes are located from the dark-circle and eye-bag masks instead.
 * The result is always `source: "assumed"`: every concern it feeds is reported at low confidence.
 *
 * 1. Eye regions (method "eye-regions"). The left and right under-eye regions of `dark_circle` and `eye_bag` each give
 *    a centroid pair. Their distance relates to the interpupillary distance (IPD) by a ratio calibrated on the
 *    fixture faces (scripts/dropin/calibrate.ts prints the numbers below); IPD in mm is then a population prior:
 *      mm/px = IPD_MM / (separation_px / ratio)
 * 2. Face extent (method "face-extent"), when no usable eye pair exists. The p2-p98 horizontal extent of the other
 *    masks' marks (spots, pores, acne, wrinkles) is about 105 mm on the fixture faces.
 * 3. Frame prior (method "frame-prior"), when there are no marks either. The face is assumed to fill the same share
 *    of the frame width as in the fixtures. Very uncertain.
 */
import type { RgbaImage, ScaleEstimate, SkinAnalysis } from "@/lib/contracts";
import { connectedComponents, foregroundOf } from "@/lib/skin/masks";

/**
 * Adult interpupillary distance: women 61.7 mm (SD 3.6, n = 1986), men 64.0 mm (SD 3.4, n = 4082). Gordon CC et al.,
 * 2012 Anthropometric Survey of U.S. Army Personnel: Methods and Summary Statistics, Natick TR-15/007 (2014). The
 * equal-weight mean is 62.9 mm, taken as 63; SD 3.5 is the within-sex spread (Dodgson NA, "Variation and extrema of
 * human interpupillary distance", Proc. SPIE 5291, 2004, covers the range across age and ethnicity).
 */
export const IPD_MM = 63;
export const IPD_SD_MM = 3.5;
export const IPD_REL_SD = IPD_SD_MM / IPD_MM;

/**
 * Distance between the left and right region centroids divided by the pupil-to-pupil distance, measured on the
 * HD fixtures p2b and p3a against the iris-ruler scale (scale.json in fixtures/youcam/p2b and p3a). The two faces agree
 * within 0.2% (dark circle) and 1% (eye bag); SD masks, held out, are within 1.2%.
 */
export const SEPARATION_PER_IPD = { dark_circle: 0.983, eye_bag: 1.079 } as const;

/**
 * Residual error of the ratio on an unseen face (relative, 1 SD). Two fixture faces cannot measure it, so this is a
 * judgement: three times the 1% spread seen, and wider when only one of the two masks is usable.
 */
export const RATIO_REL_SD = { both: 0.03, single: 0.045 } as const;

/** p2-p98 horizontal extent of the marks on the fixtures, from the iris scale: 106.5, 104.3 and 104.2 mm. */
export const FACE_EXTENT_MM = 105;
/** Population spread of face breadth (about 4%) plus how much the mark layout shifts the extent. A judgement. */
export const FACE_EXTENT_REL_SD = 0.12;
/** The same extent as a share of the frame width on the fixtures (0.58 and 0.55); capture guidance asks for 0.6+. */
export const FRAME_EXTENT_FRACTION = 0.56;
export const FRAME_PRIOR_REL_SD = 0.25;

/** Components below this share of a mask's foreground are dashes and speckle, not an eye region. */
const MIN_COMPONENT_SHARE = 0.02;
/** Empty columns between the left and right regions, as a share of the frame width (nose bridge). */
const MIN_GAP_FRAC = 0.02;
/** The smaller side must hold at least this share of the larger side's area. */
const MIN_SIDE_BALANCE = 0.2;
/** A believable IPD as a share of the frame width: a tiny face to one that overflows the frame. */
const IPD_FRAME_RANGE = [0.1, 0.6] as const;
const MIN_MARK_PIXELS = 2_000;
const MIN_EXTENT_FRAC = 0.25;

export type ScaleMethod = "eye-regions" | "face-extent" | "frame-prior";

export interface MaskScaleEstimate extends ScaleEstimate {
  source: "assumed";
  method: ScaleMethod;
}

/**
 * Distance in px between the centroids of the left and right eye regions of a dark-circle or eye-bag mask, or null if
 * the mask does not hold two separate regions. Euclidean, so head roll does not shorten it.
 */
export function eyeRegionSeparationPx(mask: RgbaImage): number | null {
  const fg = foregroundOf(mask);
  if (fg.count < 200) return null;
  const comps = connectedComponents(fg.binary, mask.width, mask.height, { keepPixels: false }).filter(
    (c) => c.area >= MIN_COMPONENT_SHARE * fg.count,
  );
  if (comps.length < 2) return null;

  // Two-means on the component centroids' x, weighted by area; each region may be several pieces.
  const xs = comps.map((c) => c.centroid.x);
  let c0 = Math.min(...xs);
  let c1 = Math.max(...xs);
  let left: typeof comps = [];
  let right: typeof comps = [];
  const mean = (list: typeof comps) => list.reduce((s, c) => s + c.area * c.centroid.x, 0) / list.reduce((s, c) => s + c.area, 0);
  for (let iter = 0; iter < 20; iter++) {
    const mid = (c0 + c1) / 2;
    left = comps.filter((c) => c.centroid.x < mid);
    right = comps.filter((c) => c.centroid.x >= mid);
    if (!left.length || !right.length) return null;
    const next0 = mean(left);
    const next1 = mean(right);
    if (next0 === c0 && next1 === c1) break;
    c0 = next0;
    c1 = next1;
  }

  const stat = (list: typeof comps) => {
    const area = list.reduce((s, c) => s + c.area, 0);
    return {
      area,
      x: list.reduce((s, c) => s + c.area * c.centroid.x, 0) / area,
      y: list.reduce((s, c) => s + c.area * c.centroid.y, 0) / area,
    };
  };
  const a = stat(left);
  const b = stat(right);
  if (Math.min(a.area, b.area) < MIN_SIDE_BALANCE * Math.max(a.area, b.area)) return null;
  const gap = Math.min(...right.map((c) => c.bbox.x)) - Math.max(...left.map((c) => c.bbox.x + c.bbox.w));
  if (gap < MIN_GAP_FRAC * mask.width) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function wholeMask(analysis: SkinAnalysis, masks: ReadonlyMap<string, RgbaImage>, concern: SkinAnalysis["results"][number]["concern"]) {
  const result = analysis.results.find((r) => r.concern === concern && r.region === "whole");
  const mask = result?.maskRef ? masks.get(result.maskRef) : undefined;
  return mask && mask.width === analysis.frame.width && mask.height === analysis.frame.height ? mask : null;
}

/** p2-p98 horizontal extent (px) of the foreground of the spot, pore, acne and wrinkle masks, or null if too sparse. */
function markExtentPx(analysis: SkinAnalysis, masks: ReadonlyMap<string, RgbaImage>): number | null {
  const { width } = analysis.frame;
  const columns = new Float64Array(width);
  let total = 0;
  for (const concern of ["age_spot", "acne", "pore", "wrinkle"] as const) {
    const mask = wholeMask(analysis, masks, concern);
    if (!mask) continue;
    const { binary } = foregroundOf(mask);
    for (let i = 0; i < binary.length; i++) {
      if (binary[i]) {
        columns[i % width]++;
        total++;
      }
    }
  }
  if (total < MIN_MARK_PIXELS) return null;
  let seen = 0;
  let from = -1;
  let to = -1;
  for (let x = 0; x < width; x++) {
    seen += columns[x];
    if (from < 0 && seen >= 0.02 * total) from = x;
    if (to < 0 && seen >= 0.98 * total) to = x;
  }
  const extent = to - from;
  return extent >= MIN_EXTENT_FRAC * width ? extent : null;
}

/** `masks` is keyed by `ConcernResult.maskRef`, as in `measureAnalysis`. Never throws. */
export function estimateScaleFromMasks(analysis: SkinAnalysis, masks: ReadonlyMap<string, RgbaImage>): MaskScaleEstimate {
  const { width } = analysis.frame;

  // IPD in px implied by each mask type that holds a believable eye pair.
  const ipdPx: number[] = [];
  for (const concern of ["dark_circle", "eye_bag"] as const) {
    const mask = wholeMask(analysis, masks, concern);
    const separation = mask ? eyeRegionSeparationPx(mask) : null;
    if (separation === null) continue;
    const ipd = separation / SEPARATION_PER_IPD[concern];
    if (ipd >= IPD_FRAME_RANGE[0] * width && ipd <= IPD_FRAME_RANGE[1] * width) ipdPx.push(ipd);
  }
  if (ipdPx.length > 0) {
    const mean = ipdPx.reduce((s, v) => s + v, 0) / ipdPx.length;
    const ratioSd = ipdPx.length === 2 ? RATIO_REL_SD.both : RATIO_REL_SD.single;
    // When the two masks disagree, their half-difference is the standard error of the mean.
    const disagreement = ipdPx.length === 2 ? Math.abs(ipdPx[0] - ipdPx[1]) / (ipdPx[0] + ipdPx[1]) : 0;
    return {
      mmPerPx: IPD_MM / mean,
      relSd: Math.hypot(IPD_REL_SD, ratioSd, disagreement),
      source: "assumed",
      method: "eye-regions",
    };
  }

  const extent = markExtentPx(analysis, masks);
  if (extent !== null) {
    return { mmPerPx: FACE_EXTENT_MM / extent, relSd: FACE_EXTENT_REL_SD, source: "assumed", method: "face-extent" };
  }
  return {
    mmPerPx: FACE_EXTENT_MM / (FRAME_EXTENT_FRACTION * width),
    relSd: FRAME_PRIOR_REL_SD,
    source: "assumed",
    method: "frame-prior",
  };
}
