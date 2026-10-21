/**
 * Thin, pure wrappers over lib/vision for the /science widgets. Nothing here is a second model: every number comes
 * from `visibilityRatio`, `rawDistances` (the scan the report uses) or `buildReceipt` (the receipt on the results page).
 */
import type { Feature, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { buildReceipt, type ReceiptNumbers } from "@/lib/integration/receipt";
import { angleDeg } from "@/lib/vision/geometry";
import { FWHM_PER_SD, LUMINANCE_PRESETS } from "@/lib/vision/params";
import { rawDistances, visibilityRatio, type TargetSpec } from "@/lib/vision/visibility";

const ARCMIN_PER_DEG = 60;

/** Visual angle of a length at a distance, in arcmin (lib/vision/geometry.ts `angleDeg`, 2 atan(s / 2d)). */
export function arcminOf(sizeMm: number, distanceM: number): number {
  return angleDeg(sizeMm, distanceM) * ARCMIN_PER_DEG;
}

/** The distance at which a length subtends `arcmin`: the inverse of `arcminOf`. */
export function distanceForArcmin(sizeMm: number, arcmin: number): number {
  const half = (arcmin / ARCMIN_PER_DEG / 2) * (Math.PI / 180);
  return sizeMm / (2000 * Math.tan(half));
}

export function viewingAt(luminanceCdM2: number, marginDb = 6): ViewingConditions {
  return { luminanceCdM2, acuityScale: 1, label: "custom", marginDb };
}

export const INDOOR = LUMINANCE_PRESETS.indoor;
export const DAYLIGHT = LUMINANCE_PRESETS.daylight;

/** A uniform disk (a dark spot) of the given diameter and Weber contrast, as the detector sees it. */
export function diskSpec(diameterMm: number, contrastPct: number): TargetSpec {
  return { id: "disk", concern: "age_spot", shape: "disk", sizeMm: diameterMm, lum: -contrastPct / 100, rg: 0, yv: 0, chromatic: false };
}

/** A pore: `fwhmMm` is read as the blob's full width at half maximum, as in `specFromTarget`. */
export function poreSpec(fwhmMm: number, contrastPct: number): TargetSpec {
  return { id: "pore", concern: "pore", shape: "gaussian", sizeMm: fwhmMm / FWHM_PER_SD, lum: -contrastPct / 100, rg: 0, yv: 0, chromatic: false };
}

/** The same disk as a measured `Feature`, so the real receipt can be built for it. */
export function diskFeature(diameterMm: number, contrastPct: number): Feature {
  return {
    id: "age_spot:sample",
    concern: "age_spot",
    shape: "spot",
    region: "whole",
    centroid: { x: 0, y: 0 },
    bbox: { x: 0, y: 0, w: 1, h: 1 },
    areaPx: 1,
    diameterMm,
    sizeSource: "mask",
    contrast: { lum: -contrastPct / 100, rg: 0 },
    contrastBasis: "surround",
  };
}

const NO_SCALE: ScaleEstimate = { mmPerPx: 0.2, relSd: 0, source: "assumed" };

/** The receipt for a disk at a distance: angle, both thresholds and the verdict (lib/integration/receipt.ts). */
export function diskReceipt(diameterMm: number, contrastPct: number, distanceM: number, viewing: ViewingConditions): ReceiptNumbers | null {
  return buildReceipt(diskFeature(diameterMm, contrastPct), NO_SCALE, viewing, distanceM);
}

export interface Reach {
  sizeMm: number;
  /** The farthest distance a typical sharp-eyed person could pick it out (margin 0), uncapped up to 50 m. */
  typicalM: number;
  /** The farthest distance for even perfect eyes (the bound). */
  perfectM: number;
}

/** Reach of a disk of `sizeMm`, from the report's own scan (`rawDistances`). */
export function diskReach(sizeMm: number, contrastPct: number, viewing: ViewingConditions): Reach {
  const { nominal, bound } = rawDistances(diskSpec(sizeMm, contrastPct), viewing);
  return { sizeMm, typicalM: nominal, perfectM: bound };
}

/** The boundary of the size-by-distance map at one contrast: one point per size. */
export function boundaryLine(contrastPct: number, viewing: ViewingConditions, sizesMm: readonly number[]): Reach[] {
  return sizesMm.map((s) => diskReach(s, contrastPct, viewing));
}

export interface Doubling {
  one: Reach;
  two: Reach;
  typicalFactor: number;
  perfectFactor: number;
}

/** Double the size, and the distance doubles: the factor is 2 up to the scan's bisection tolerance. */
export function doublingCheck(sizeMm: number, contrastPct: number, viewing: ViewingConditions): Doubling {
  const one = diskReach(sizeMm, contrastPct, viewing);
  const two = diskReach(sizeMm * 2, contrastPct, viewing);
  return {
    one,
    two,
    typicalFactor: one.typicalM > 0 ? two.typicalM / one.typicalM : NaN,
    perfectFactor: one.perfectM > 0 ? two.perfectM / one.perfectM : NaN,
  };
}

/** Detector ratios of a disk at one point of the map: >= 1 means detectable (typical eyes, then perfect eyes). */
export function diskRatios(sizeMm: number, contrastPct: number, distanceM: number, viewing: ViewingConditions): { typical: number; perfect: number } {
  const spec = diskSpec(sizeMm, contrastPct);
  return {
    typical: visibilityRatio(spec, viewing, distanceM, { marginDb: 0, bound: false }),
    perfect: visibilityRatio(spec, viewing, distanceM, { marginDb: viewing.marginDb ?? 6, bound: true }),
  };
}

export interface RatioGrid {
  /** Row-major, `rows` x `cols`; row 0 is the smallest size. log10 of the typical-eyes ratio. */
  typicalLog: Float32Array;
  perfectLog: Float32Array;
  cols: number;
  rows: number;
}

/** The map as numbers: log10 detector ratio at the centre of each cell of a linear size x distance grid. */
export function ratioGrid(
  contrastPct: number,
  viewing: ViewingConditions,
  maxSizeMm: number,
  maxDistanceM: number,
  cols: number,
  rows: number,
): RatioGrid {
  const typicalLog = new Float32Array(cols * rows);
  const perfectLog = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const size = ((j + 0.5) / rows) * maxSizeMm;
    for (let i = 0; i < cols; i++) {
      const d = ((i + 0.5) / cols) * maxDistanceM;
      const r = diskRatios(size, contrastPct, d, viewing);
      typicalLog[j * cols + i] = Math.log10(Math.max(r.typical, 1e-6));
      perfectLog[j * cols + i] = Math.log10(Math.max(r.perfect, 1e-6));
    }
  }
  return { typicalLog, perfectLog, cols, rows };
}

export interface Band {
  typicalM: number;
  perfectM: number;
  /** perfectM / typicalM: how much the margin widens the band. */
  factor: number;
}

/** The distance band of a feature for a margin: typical eyes (margin 0) to perfect eyes (margin `marginDb`). */
export function marginBand(spec: TargetSpec, luminanceCdM2: number, marginDb: number): Band {
  const { nominal, bound } = rawDistances(spec, viewingAt(luminanceCdM2, marginDb));
  return { typicalM: nominal, perfectM: bound, factor: nominal > 0 ? bound / nominal : NaN };
}

/** `marginBand` at several margins, for the "how much does the margin widen it" curve. */
export function marginCurve(spec: TargetSpec, luminanceCdM2: number, marginsDb: readonly number[]): { marginDb: number; band: Band }[] {
  return marginsDb.map((marginDb) => ({ marginDb, band: marginBand(spec, luminanceCdM2, marginDb) }));
}
