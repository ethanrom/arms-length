/**
 * Walk-back self-test, step 3: predict the distance at which the target vanishes, and compare with what the
 * person saw. Pure; the detector comes in through the Detector interface.
 */
import {
  DEFAULT_VIEWING,
  MAX_DISTANCE_M,
  MIN_DISTANCE_M,
  type ContrastPatch,
  type Detector,
  type ViewingConditions,
} from "@/lib/contracts";
import { diskPatch, srgbForContrast, DISPLAY_GAMMA, MID_GREY_SRGB } from "./target";

/**
 * ASSUMPTION. Without a photometer we do not know how bright the screen is. 100 cd/m^2 is the SDR grading level
 * and sits in the 80-300 cd/m^2 range of ordinary displays; it is the luminance the viewer is adapted to. The
 * user can change it, and the result should be read as a demonstration, not a lab measurement.
 */
export const DEFAULT_SCREEN_LUMINANCE_CDM2 = 100;

const dbToGain = (db: number): number => 10 ** (db / 20);

/**
 * Largest distance in [MIN_DISTANCE_M, MAX_DISTANCE_M] at which the detector still responds (>= 1).
 * Returns 0 if not detectable even at MIN_DISTANCE_M and MAX_DISTANCE_M if still detectable there.
 * `marginDb` is applied here as a gain on the response; the detector always sees marginDb = 0, so the margin
 * is applied exactly once whatever the detector does with that field.
 */
export function vanishingDistance(
  detector: Detector,
  patch: ContrastPatch,
  viewing: ViewingConditions,
  marginDb = 0,
): number {
  const gain = dbToGain(marginDb);
  const v = { ...viewing, marginDb: 0 };
  const seen = (d: number) => detector.response(patch, v, d) * gain >= 1;
  if (!seen(MIN_DISTANCE_M)) return 0;
  if (seen(MAX_DISTANCE_M)) return MAX_DISTANCE_M;
  let lo = Math.log(MIN_DISTANCE_M);
  let hi = Math.log(MAX_DISTANCE_M);
  while (hi - lo > 1e-4) {
    const mid = (lo + hi) / 2;
    if (seen(Math.exp(mid))) lo = mid;
    else hi = mid;
  }
  return Math.exp(lo);
}

export interface SelfTestSetup {
  diameterMm: number;
  /** Requested Weber contrast of the disk against the background. */
  contrast: number;
  pxPerMm: number;
  screenLuminanceCdM2?: number;
  backgroundSrgb?: number;
  gamma?: number;
  /** Safety margin for the one-sided bound; default is the product default (6 dB). */
  marginDb?: number;
}

export interface SelfTestPrediction {
  /** Disk sRGB value to draw, and the contrast it really produces after 8-bit rounding. */
  srgb: number;
  achievedContrast: number;
  clipped: boolean;
  /** Average observer, no margin. */
  nominalM: number;
  /** With the safety margin: beyond this the target should be invisible to a careful observer. */
  boundM: number;
  viewing: ViewingConditions;
}

export function predictVanishing(detector: Detector, s: SelfTestSetup): SelfTestPrediction {
  const drawn = srgbForContrast(s.contrast, s.backgroundSrgb ?? MID_GREY_SRGB, s.gamma ?? DISPLAY_GAMMA);
  const patch = diskPatch(s.diameterMm, drawn.achievedContrast, s.pxPerMm);
  const viewing: ViewingConditions = {
    ...DEFAULT_VIEWING,
    luminanceCdM2: s.screenLuminanceCdM2 ?? DEFAULT_SCREEN_LUMINANCE_CDM2,
    label: "custom",
  };
  const margin = s.marginDb ?? DEFAULT_VIEWING.marginDb ?? 6;
  return {
    ...drawn,
    nominalM: vanishingDistance(detector, patch, viewing, 0),
    boundM: vanishingDistance(detector, patch, viewing, margin),
    viewing,
  };
}

export type BandSide = "below" | "inside" | "above";

export interface BandComparison {
  /** below: vanished closer than nominal; inside: between nominal and bound; above: seen beyond the bound. */
  side: BandSide;
  inside: boolean;
  /** observed / nominal and observed / bound, for display. */
  ratioToNominal: number;
  ratioToBound: number;
}

/**
 * Compare the distance at which the person lost the target with the [nominal, bound] band. Below the band is
 * expected for a real viewer in real conditions (the bound is one-sided). Above the bound would contradict the
 * model (or the screen assumptions) and is reported as such, not hidden.
 */
export function compareObserved(observedM: number, p: Pick<SelfTestPrediction, "nominalM" | "boundM">): BandComparison {
  const side: BandSide = observedM < p.nominalM ? "below" : observedM > p.boundM ? "above" : "inside";
  return {
    side,
    inside: side === "inside",
    ratioToNominal: observedM / p.nominalM,
    ratioToBound: observedM / p.boundM,
  };
}
