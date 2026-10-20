/**
 * Normalised analysis input and the physical measurements derived from it.
 * Units: image coordinates in px of the analysed image frame (YouCam `resize_image`), sizes in mm,
 * contrasts are signed and dimensionless.
 */
import type { ConcernId } from "./concerns";

export interface Size2 {
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** One YouCam output item, normalised. `maskRef` is a URL, data URL or fixture-relative path. */
export interface ConcernResult {
  concern: ConcernId;
  region: string; // "whole" when the API gives no region
  rawScore: number;
  uiScore: number;
  maskRef: string | null;
}

export interface SkinAnalysis {
  engine: "hd" | "sd";
  /** The frame every mask is aligned to (the input, or YouCam's resize when the long side exceeds 2560). */
  frame: Size2;
  results: ConcernResult[];
  skinAge: number | null;
  overall: number | null;
}

/** Decoded RGBA image (masks, photos, renders). */
export interface RgbaImage extends Size2 {
  data: Uint8ClampedArray; // length = width * height * 4
}

/** Millimetres per pixel on the face plane, with relative 1-SD uncertainty. */
export interface ScaleEstimate {
  mmPerPx: number;
  relSd: number;
  source: "iris" | "card" | "assumed";
  /** Horizontal visible iris diameter in px, both eyes averaged, when source is "iris". */
  irisPx?: number;
}

/**
 * Contrast of a feature against its surround, measured in linear light from the photo.
 * - lum: Weber luminance contrast (feature - surround) / surround. Negative for darker features.
 * - rg: red-green cone contrast on the L-M axis (positive = redder than the surround).
 */
export interface Contrast {
  lum: number;
  rg: number;
}

/** A discrete visible mark: one age spot, pore, acne lesion or wrinkle. */
export interface Feature {
  id: string; // `${concern}:${index}`
  concern: ConcernId;
  shape: "spot" | "line";
  region: string; // facial region from the API's regional masks, else "whole"
  centroid: Point;
  bbox: Box;
  areaPx: number;
  /** spot: diameterMm (equivalent-area diameter). line: lengthMm and widthMm. */
  diameterMm?: number;
  lengthMm?: number;
  widthMm?: number;
  /** Where the size came from: the mask outline, a measurement in the photo, or a stated prior. */
  sizeSource: "mask" | "photo" | "prior";
  contrast: Contrast;
  /**
   * What the contrast is measured against. "surround": the feature vs nearby skin (spots, pores, acne).
   * "counterfactual": the photo vs YouCam Skin Simulation of the same face without the concern, which removes normal
   * anatomy and lighting such as eye-socket shading and fold shadows (dark circles, eye bags, wrinkles, redness).
   */
  contrastBasis?: "surround" | "counterfactual";
}

/** An area concern: dark circles, eye bags, redness zones. */
export interface RegionMeasure {
  id: string; // `${concern}:${index}`
  concern: ConcernId;
  bbox: Box;
  areaPx: number;
  widthMm: number;
  heightMm: number;
  contrast: Contrast;
  /** What the region was compared against, e.g. "cheek_band" or "simulation". */
  reference: string;
  contrastBasis?: "surround" | "counterfactual";
}

export interface Measurements {
  scale: ScaleEstimate;
  features: Feature[];
  regions: RegionMeasure[];
  /** Concerns present in the analysis but not measurable (empty mask, out of scope). */
  skipped: { concern: ConcernId; reason: string }[];
}
