/**
 * Visibility distance of one measured target (research 9.3 and 9.4).
 *
 *   angular size   theta(d) = 2 atan(s / 2d) / acuityScale
 *   luminance      R_lum = |C_lum| * g / T_shape(theta)          T from the ModelFest-calibrated tables (tables.ts)
 *   chromatic      R_RG  = C_RG * S_RG,disc(r, L), R_YV likewise  castleCSF disc sensitivity (castle.ts)
 *   total          R = sqrt(R_lum^2 + R_RG^2 + R_YV^2)            castleCSF energy rule across channels
 *   detected iff   G * R >= 1,   G = 10^(marginDb / 20)
 *
 * The largest such distance is found by scanning a log grid (1 cm to 50 m, 40 points per decade) from far to near and
 * refining the last crossing by bisection; a scan rather than bisection alone guards against non-monotone cases
 * (short lines, mixed shapes). Distance scales linearly with physical size (the model only sees s / d), so the
 * interval from `scale.relSd` is distance * (1 +/- relSd), 1 SD.
 *
 * Only the red-green contrast is measured, so the yellow-violet term is 0 here (the code path exists).
 *
 * Redness is judged on its chromatic contrast only (luminance contrast taken as 0), on either contrast basis: the
 * luminance of a redness zone is the lighting of the cheek it sits on (about +-30% on recorded faces) while its
 * red-green contrast is 0.01 to 0.03, and the zone is a colour concern, not a brightness one.
 */
import { CONCERNS } from "../contracts/concerns";
import type { ConcernId } from "../contracts/concerns";
import type { Feature, RegionMeasure, ScaleEstimate } from "../contracts/measure";
import { MAX_DISTANCE_M, MIN_DISTANCE_M, type TargetVisibility, type ViewingConditions } from "../contracts/vision";
import { castleRgContrast, discSensitivity, luminanceGain } from "./castle";
import { angleDeg, equalAreaDiameter } from "./geometry";
import { DEFAULT_MARGIN_DB, FWHM_PER_SD, SCAN } from "./params";
import type { ShapeId } from "./shapes";
import { blobThresholdLookup, lineThresholdLookup } from "./tables";

/** A target reduced to what the model needs. Sizes in mm; contrasts are signed, Weber and cone contrast. */
export interface TargetSpec {
  id: string;
  concern: ConcernId;
  shape: ShapeId;
  /** gaussian: sd; disk and softDisk: equal-area diameter; line: width. */
  sizeMm: number;
  /** Line length (mm); Infinity when unknown. */
  lengthMm?: number;
  lum: number;
  rg: number;
  yv: number;
  chromatic: boolean;
}

function isFeature(t: Feature | RegionMeasure): t is Feature {
  return "shape" in t;
}

/**
 * Map a measured target to its model shape (research 9.3): Gaussian for pores (diameterMm is read as the blob's
 * FWHM), uniform disk for the other spots, line for wrinkles, soft disk (equal-area) for regions.
 * Returns null when the size or contrast is missing or not finite.
 */
export function specFromTarget(target: Feature | RegionMeasure, scale: ScaleEstimate): TargetSpec | null {
  const { rg } = target.contrast;
  if (!Number.isFinite(target.contrast.lum) || !Number.isFinite(rg)) return null;
  const chromatic = CONCERNS[target.concern].chromatic;
  const lum = target.concern === "redness" ? 0 : target.contrast.lum;
  const base = { id: target.id, concern: target.concern, lum, rg, yv: 0, chromatic };
  let spec: TargetSpec;
  if (isFeature(target)) {
    if (target.shape === "line") {
      const w = target.widthMm;
      if (w === undefined || !(w > 0)) return null;
      const len = target.lengthMm !== undefined && target.lengthMm > 0 ? target.lengthMm : Infinity;
      spec = { ...base, shape: "line", sizeMm: w, lengthMm: len };
    } else {
      const d = target.diameterMm;
      if (d === undefined || !(d > 0)) return null;
      spec =
        target.concern === "pore"
          ? { ...base, shape: "gaussian", sizeMm: d / FWHM_PER_SD }
          : { ...base, shape: "disk", sizeMm: d };
    }
  } else {
    const area = target.areaPx * scale.mmPerPx * scale.mmPerPx;
    const d = area > 0 ? equalAreaDiameter(area) : (2 * Math.sqrt((target.widthMm * target.heightMm) / Math.PI));
    if (!(d > 0)) return null;
    spec = { ...base, shape: "softDisk", sizeMm: d };
  }
  return Number.isFinite(spec.sizeMm) && spec.sizeMm > 0 ? spec : null;
}

/** Contrast threshold T_shape for the angular size(s) in degrees (already divided by the acuity scale). */
function shapeThreshold(spec: TargetSpec, thetaDeg: number, lengthDeg: number): number {
  return spec.shape === "line" ? lineThresholdLookup(thetaDeg, lengthDeg) : blobThresholdLookup(spec.shape, thetaDeg);
}

/** Angular sd (deg) of the target's profile across its narrow axis, for f* = 1/(4 s) in the luminance factor. */
function equivalentSd(spec: TargetSpec, thetaDeg: number): number {
  if (spec.shape === "gaussian") return thetaDeg;
  if (spec.shape === "line") return thetaDeg / Math.sqrt(12);
  return thetaDeg / 4; // uniform disk of diameter D has sd D / 4 along an axis
}

export interface RatioOptions {
  /** Margin in dB (the detector is this much more sensitive). 0 gives the nominal, average-observer value. */
  marginDb: number;
  /** Use max(1, g) for the luminance factor (the one-sided bound). */
  bound: boolean;
}

/** Visibility ratio G * R_total at one distance. >= 1 means detectable. */
export function visibilityRatio(spec: TargetSpec, viewing: ViewingConditions, distanceM: number, opts: RatioOptions): number {
  const a = viewing.acuityScale > 0 ? viewing.acuityScale : 1;
  const theta = angleDeg(spec.sizeMm, distanceM) / a;
  const lengthDeg =
    spec.lengthMm !== undefined && Number.isFinite(spec.lengthMm) ? angleDeg(spec.lengthMm, distanceM) / a : Infinity;

  const T = shapeThreshold(spec, theta, lengthDeg);
  let g = luminanceGain(viewing.luminanceCdM2, 1 / (4 * equivalentSd(spec, theta)));
  if (opts.bound) g = Math.max(1, g);
  const rLum = (Math.abs(spec.lum) * g) / T;

  let rChrom2 = 0;
  if (spec.chromatic) {
    // castleCSF disc model is defined for the equal-area disc radius.
    const diameter =
      spec.shape === "gaussian"
        ? theta * FWHM_PER_SD
        : spec.shape === "line"
          ? equalAreaDiameter(theta * (Number.isFinite(lengthDeg) ? lengthDeg : theta))
          : theta;
    const r = diameter / 2;
    const L = viewing.luminanceCdM2;
    const rRg = castleRgContrast(spec.lum, spec.rg) * discSensitivity("rg", r, L);
    const rYv = Math.abs(spec.yv) * discSensitivity("yv", r, L);
    rChrom2 = rRg * rRg + rYv * rYv;
  }
  return Math.sqrt(rLum * rLum + rChrom2) * Math.pow(10, opts.marginDb / 20);
}

/**
 * Largest d (metres) in [SCAN.minM, SCAN.maxM] with ratioAt(d) >= 1; 0 if there is none, SCAN.maxM if the target is
 * still detectable at the far end. Scan from far to near, then bisect the last crossing in log distance.
 */
export function farthestDetectable(ratioAt: (distanceM: number) => number): number {
  const { minM, maxM, pointsPerDecade } = SCAN;
  const decades = Math.log10(maxM / minM);
  const n = Math.ceil(decades * pointsPerDecade);
  const at = (i: number) => minM * Math.pow(10, (i * decades) / n);
  for (let i = n; i >= 0; i--) {
    if (ratioAt(at(i)) < 1) continue;
    if (i === n) return maxM;
    let lo = Math.log(at(i));
    let hi = Math.log(at(i + 1));
    for (let k = 0; k < 30; k++) {
      const mid = 0.5 * (lo + hi);
      if (ratioAt(Math.exp(mid)) >= 1) lo = mid;
      else hi = mid;
    }
    return Math.exp(lo);
  }
  return 0;
}

/** Contract clamp: 0 when not detectable at MIN_DISTANCE_M, capped at MAX_DISTANCE_M. */
function clampDistance(d: number): number {
  return d < MIN_DISTANCE_M ? 0 : Math.min(d, MAX_DISTANCE_M);
}

/** Bound and nominal distances for a spec, uncapped by the contract clamp (up to SCAN.maxM). */
export function rawDistances(spec: TargetSpec, viewing: ViewingConditions): { bound: number; nominal: number } {
  const marginDb = viewing.marginDb ?? DEFAULT_MARGIN_DB;
  return {
    bound: farthestDetectable((d) => visibilityRatio(spec, viewing, d, { marginDb, bound: true })),
    nominal: farthestDetectable((d) => visibilityRatio(spec, viewing, d, { marginDb: 0, bound: false })),
  };
}

export function visibilityOfSpec(spec: TargetSpec, scale: ScaleEstimate, viewing: ViewingConditions): TargetVisibility {
  const { bound, nominal } = rawDistances(spec, viewing);
  const rel = Math.max(0, scale.relSd);
  return {
    targetId: spec.id,
    concern: spec.concern,
    distanceM: clampDistance(bound),
    nominalM: clampDistance(nominal),
    intervalM: [clampDistance(bound * (1 - rel)), clampDistance(bound * (1 + rel))],
  };
}

/**
 * Visibility of one measured feature or region for an ideal observer: `distanceM` is the one-sided bound (margin from
 * `viewing.marginDb`, default 6 dB), `nominalM` the average-observer value (margin 0). Targets whose size or
 * contrast is missing get distance 0.
 */
export function targetVisibility(target: Feature | RegionMeasure, scale: ScaleEstimate, viewing: ViewingConditions): TargetVisibility {
  const spec = specFromTarget(target, scale);
  if (!spec) {
    return { targetId: target.id, concern: target.concern, distanceM: 0, nominalM: 0, intervalM: [0, 0] };
  }
  return visibilityOfSpec(spec, scale, viewing);
}
