/**
 * Unit-contrast detection thresholds for the feature shapes we model, computed directly from the standard model
 * with the analytic Fourier transform of each shape (research 1.7). Used offline to build the lookup tables
 * (scripts/vision/build-tables.ts) and in tests; the runtime reads the tables (tables.ts).
 *
 * Because everything before pooling is linear and the pooled norm is homogeneous, the threshold for a feature of
 * contrast C is C_T = T_shape(size) and the feature is detected iff C >= T_shape(size) (R = C / T).
 * Sizes are angular, in degrees:
 *   gaussian  sd of the 2-D Gaussian blob (peak contrast = C)
 *   disk      equal-area diameter of a uniform disk
 *   softDisk  equal-area diameter of a disk blurred by a Gaussian of sd SOFT_DISK_EDGE_SD_FRACTION * diameter
 *   line      width of a rectangular line (no oblique penalty: the most sensitive orientation, for the bound)
 */
import { jinc } from "./bessel";
import { fft1d, fft2d } from "./fft";
import { MODEL_GRID, PATCH_GABOR_SD_CYCLES, SOFT_DISK_EDGE_SD_FRACTION, STANDARD_A, type StandardParams } from "./params";
import { apertureWeights, binFrequency, chooseGrid, csf, dftFilter, pool, type Grid } from "./standard";

export type BlobShape = "gaussian" | "disk" | "softDisk";
export type ShapeId = BlobShape | "line";

export interface ShapeOptions {
  params?: StandardParams;
  /** Override the oblique effect. Blobs default to true (as fitted), lines are always evaluated without. */
  oblique?: boolean;
  /** Override the automatic grid. */
  grid?: Grid;
}

/** Fourier transform of the unit-peak shape at frequency (fx, fy) in cpd, in deg^2 (continuous transform). */
function blobSpectrum(shape: BlobShape, sizeDeg: number): (fx: number, fy: number) => number {
  if (shape === "gaussian") {
    const s2 = sizeDeg * sizeDeg;
    return (fx, fy) => 2 * Math.PI * s2 * Math.exp(-2 * Math.PI * Math.PI * s2 * (fx * fx + fy * fy));
  }
  const R = sizeDeg / 2;
  const area = Math.PI * R * R;
  if (shape === "disk") return (fx, fy) => area * jinc(2 * Math.PI * Math.hypot(fx, fy) * R);
  const e = SOFT_DISK_EDGE_SD_FRACTION * sizeDeg;
  const k = 2 * Math.PI * Math.PI * e * e;
  return (fx, fy) => {
    const f2 = fx * fx + fy * fy;
    return area * jinc(2 * Math.PI * Math.sqrt(f2) * R) * Math.exp(-k * f2);
  };
}

function blobRadius(shape: BlobShape, sizeDeg: number): number {
  if (shape === "gaussian") return 3 * sizeDeg;
  if (shape === "disk") return sizeDeg / 2;
  return sizeDeg / 2 + 3 * SOFT_DISK_EDGE_SD_FRACTION * sizeDeg;
}

/**
 * Threshold (contrast of a unit-shaped stimulus at which pooled R = 1) for an analytic spectrum, feature centred
 * on pixel 0 of a cyclic n x n grid with the aperture centred on the same pixel.
 */
function thresholdFromSpectrum(
  spectrum: (fx: number, fy: number) => number,
  grid: Grid,
  P: StandardParams,
  withOblique: boolean,
): number {
  const { n, ppd } = grid;
  const h = dftFilter(n, ppd, P, withOblique);
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  const freq = new Float64Array(n);
  for (let k = 0; k < n; k++) freq[k] = binFrequency(k, n, ppd);
  const scale = ppd * ppd;
  for (let ky = 0; ky < n; ky++) {
    for (let kx = 0; kx < n; kx++) {
      const i = ky * n + kx;
      re[i] = spectrum(freq[kx], freq[ky]) * h[i] * scale;
    }
  }
  fft2d(re, im, n, n, true);
  return 1 / pool(re, n, ppd, P, 0, 0, true);
}

/** Contrast threshold of a unit-peak Gaussian blob, disk or soft disk of angular size `sizeDeg`. */
export function blobThreshold(shape: BlobShape, sizeDeg: number, opts: ShapeOptions = {}): number {
  const P = opts.params ?? STANDARD_A;
  const grid = opts.grid ?? chooseGrid(blobRadius(shape, sizeDeg));
  return thresholdFromSpectrum(blobSpectrum(shape, sizeDeg), grid, P, opts.oblique ?? true);
}

function sinc(x: number): number {
  return Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
}

/**
 * Threshold of an infinitely long line of width `widthDeg` (unit contrast, rectangular profile). Exact reduction of
 * the 2-D model: the filtered image is the 1-D profile r(x), uniform along the line, and the aperture integral
 * along the line is sigma * sqrt(2 pi / beta).
 */
export function lineThresholdInfinite(widthDeg: number, opts: ShapeOptions = {}): number {
  const P = opts.params ?? STANDARD_A;
  const ppd = MODEL_GRID.ppd;
  const n = 1024; // 8.5 deg field: covers the aperture support for lines up to about 4 deg wide
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const fx = binFrequency(k, n, ppd);
    re[k] = widthDeg * sinc(widthDeg * fx) * csf(Math.abs(fx), P) * ppd;
  }
  fft1d(re, im, true);
  const w = apertureWeights(n, ppd, 0, true, P);
  let sum = 0;
  for (let x = 0; x < n; x++) {
    const v = Math.abs(re[x]);
    if (v > 0) sum += w[x] * Math.pow(v, P.beta);
  }
  const along = P.sigma * Math.sqrt((2 * Math.PI) / P.beta);
  return 1 / Math.pow((sum / ppd) * along, 1 / P.beta);
}

/**
 * Threshold of a rectangular line of width `widthDeg` and finite length `lengthDeg` (>= width), fixated at its
 * centre, without the oblique penalty. Length -> infinity recovers `lineThresholdInfinite`.
 */
export function lineThreshold(widthDeg: number, lengthDeg: number, opts: ShapeOptions = {}): number {
  const P = opts.params ?? STANDARD_A;
  const L = Math.max(lengthDeg, widthDeg);
  // Thin lines keep their high-frequency content to 30 cpd, so never sample below 60 px/deg (30 px/deg is 0.14 dB off).
  const grid = opts.grid ?? chooseGrid(L / 2, 60);
  const area = widthDeg * L;
  return thresholdFromSpectrum(
    (fx, fy) => area * sinc(widthDeg * fx) * sinc(L * fy),
    grid,
    P,
    opts.oblique ?? false,
  );
}

/**
 * Threshold of a Gabor patch with unit peak contrast, carrier `f0` cpd, Gaussian sd 0.5621 / f0 degrees (a
 * 1-octave bandwidth patch, research 6.3). This is Peli's "patch CSF" (ModelFest stimuli 11-14 are this family).
 */
export function gaborPatchThreshold(f0: number, opts: ShapeOptions = {}): number {
  const P = opts.params ?? STANDARD_A;
  const sd = PATCH_GABOR_SD_CYCLES / f0;
  const grid = opts.grid ?? chooseGrid(3 * sd, 8 * f0);
  const k = 2 * Math.PI * Math.PI * sd * sd;
  const g = (fx: number, fy: number) => 2 * Math.PI * sd * sd * Math.exp(-k * (fx * fx + fy * fy));
  return thresholdFromSpectrum(
    (fx, fy) => 0.5 * (g(fx - f0, fy) + g(fx + f0, fy)),
    grid,
    P,
    opts.oblique ?? true,
  );
}
