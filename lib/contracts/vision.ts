/**
 * The visibility model: what an ideal observer can detect, and from how far.
 * Distances in metres. The claim is one-sided: beyond `distanceM`, the target is undetectable even for
 * an ideal 20/20 observer looking straight at it with no masking. Real viewing only makes it less visible.
 */
import type { ConcernId } from "./concerns";

/**
 * A stimulus for the detector: a small patch of contrast around one target, with background 0.
 * The same type carries measured skin features (synthesised from their size and contrast, or cropped from
 * the photo) and ModelFest validation stimuli.
 */
export interface ContrastPatch {
  width: number;
  height: number;
  /** Physical size of one patch pixel in mm. */
  mmPerPx: number;
  /** Luminance contrast image, (L - Lbackground) / Lbackground, length width*height. */
  lum: Float32Array;
  /** Optional red-green cone-contrast image, same layout. */
  rg?: Float32Array;
}

export interface ViewingConditions {
  /** Adapting luminance of the face in cd/m^2 (indoor or daylight preset). */
  luminanceCdM2: number;
  /** 1 = 20/20, 2 = 20/40: scales spatial frequencies (a blurrier observer). */
  acuityScale: number;
  label: "indoor" | "daylight" | "custom";
  /** Safety margin added to detector sensitivity for the one-sided bound, in dB (default 6; research 9.4). */
  marginDb?: number;
}

export interface Detector {
  /** Pooled detector response at a viewing distance; >= 1 means detectable. Non-increasing in distance. */
  response(patch: ContrastPatch, viewing: ViewingConditions, distanceM: number): number;
}

/** Largest detectable distance for one target, with the interval implied by scale uncertainty. */
export interface TargetVisibility {
  targetId: string; // Feature.id or RegionMeasure.id
  concern: ConcernId;
  distanceM: number; // capped at MAX_DISTANCE_M; 0 if not detectable at MIN_DISTANCE_M
  /** Distance for the average observer with no margin (marginDb = 0). distanceM is the bound. */
  nominalM?: number;
  intervalM: [number, number];
}

export interface ConcernVisibility {
  concern: ConcernId;
  targetCount: number;
  /** The farthest any one target stays detectable: "visible from up to X". */
  maxDistanceM: number;
  /** Median over targets: "most of them vanish beyond X". */
  medianDistanceM: number;
  intervalM: [number, number];
  /** Ids of the most visible targets, most visible first (at most 5). */
  topTargets: string[];
  confidence: "high" | "medium" | "low";
}

export const MIN_DISTANCE_M = 0.1;
export const MAX_DISTANCE_M = 10;

export interface VisibilityReport {
  viewing: ViewingConditions;
  targets: TargetVisibility[];
  concerns: ConcernVisibility[];
}

/**
 * Renders the photo as an ideal observer at `distanceM` perceives it (sub-threshold detail suppressed,
 * Peli-style). Output has the same size as the input. Drives the "Step back" slider.
 */
export type DistanceRenderer = (
  photo: import("./measure").RgbaImage,
  scale: import("./measure").ScaleEstimate,
  viewing: ViewingConditions,
  distanceM: number,
) => import("./measure").RgbaImage;

export const DEFAULT_VIEWING: ViewingConditions = { luminanceCdM2: 100, acuityScale: 1, label: "indoor", marginDb: 6 };
