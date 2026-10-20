/**
 * Watson & Ahumada (2005) standard model of foveal detection of spatial contrast (research 1.2-1.5):
 *   contrast image -> 2-D DFT -> x CSF(f) x oblique(f, theta) -> inverse DFT -> x Gaussian aperture
 *   -> Minkowski pooling with exponent beta. Detected iff the pooled response R >= 1; for a unit-contrast
 *   stimulus the contrast threshold is 1 / R.
 * Conventions follow the paper and our numpy replication: 120 px/deg, 256 x 256, numpy fftfreq frequencies,
 * DC gain kept, pixel area 1/ppd^2.
 */
import type { ContrastPatch, Detector, ViewingConditions } from "../contracts/vision";
import { castleRgContrast, discSensitivity, luminanceGain } from "./castle";
import { fft2d } from "./fft";
import { angleDeg } from "./geometry";
import { MODEL_GRID, OBLIQUE, STANDARD_A, STANDARD_B, STANDARD_FIELD_DEG, type StandardParams } from "./params";

function sech(x: number): number {
  // cosh overflows near 710; the CSF terms are negligible long before.
  return x > 300 ? 0 : 1 / Math.cosh(x);
}

/** HPmH contrast sensitivity filter gain S(f), f in cycles/degree (Eq. 15). Not a sensitivity: a filter gain. */
export function csf(f: number, P: StandardParams = STANDARD_A): number {
  return P.gain * (sech(Math.pow(f / P.f0, P.p)) - P.a * sech(f / P.f1));
}

/** Oblique-effect gain for a frequency vector (fx, fy) in cpd (Eq. 5). 1 on the axes, lowest on the diagonals. */
export function oblique(fx: number, fy: number): number {
  const f2 = fx * fx + fy * fy;
  if (f2 === 0) return 1;
  const f = Math.sqrt(f2);
  if (f <= OBLIQUE.gamma) return 1;
  const s = (2 * fx * fy) / f2;
  return 1 - (1 - Math.exp(-(f - OBLIQUE.gamma) / OBLIQUE.lambda)) * s * s;
}

/** numpy.fft.fftfreq(n, 1/ppd) for one bin: cycles per degree. */
export function binFrequency(k: number, n: number, ppd: number): number {
  return ((k < n / 2 ? k : k - n) * ppd) / n;
}

const filterCache = new Map<string, Float64Array>();

function paramsKey(P: StandardParams): string {
  return `${P.gain},${P.f0},${P.f1},${P.a},${P.p}`;
}

/** CSF x oblique filter on an n x n DFT grid at `ppd` pixels/degree, in FFT bin order. Cached. */
export function dftFilter(n: number, ppd: number, P: StandardParams = STANDARD_A, withOblique = true): Float64Array {
  const key = `${n}|${ppd}|${paramsKey(P)}|${withOblique}`;
  const hit = filterCache.get(key);
  if (hit) return hit;
  const h = new Float64Array(n * n);
  // The CSF depends on |f| only; tabulate the radial part per (kx, ky) pair row by row.
  const freq = new Float64Array(n);
  for (let k = 0; k < n; k++) freq[k] = binFrequency(k, n, ppd);
  for (let ky = 0; ky < n; ky++) {
    const fy = freq[ky];
    for (let kx = 0; kx < n; kx++) {
      const fx = freq[kx];
      const f = Math.sqrt(fx * fx + fy * fy);
      h[ky * n + kx] = csf(f, P) * (withOblique ? oblique(fx, fy) : 1);
    }
  }
  if (filterCache.size >= 12) filterCache.delete(filterCache.keys().next().value as string);
  filterCache.set(key, h);
  return h;
}

/**
 * 1-D weights of the aperture raised to beta: A(r)^beta = exp(-beta r^2 / (2 sigma^2)) is separable, so
 * A^beta = wx[x] * wy[y]. `centre` is in pixel-index coordinates; `wrap` measures distance cyclically
 * (centre at index 0 with the feature wrapped across the grid edge, as in the analytic tables).
 */
export function apertureWeights(n: number, ppd: number, centre: number, wrap: boolean, P: StandardParams = STANDARD_A): Float64Array {
  const w = new Float64Array(n);
  const k = P.beta / (2 * P.sigma * P.sigma * ppd * ppd);
  for (let i = 0; i < n; i++) {
    let d = i - centre;
    if (wrap) {
      d = ((d % n) + n) % n;
      if (d > n / 2) d -= n;
    }
    w[i] = Math.exp(-k * d * d);
  }
  return w;
}

/**
 * Minkowski pooling of an already filtered real image r: R = [ sum px py |A r|^beta ]^(1/beta), with pixel area
 * 1/ppd^2 and aperture centred at (cx, cy) (pixel-index coordinates).
 */
export function pool(
  r: Float64Array,
  n: number,
  ppd: number,
  P: StandardParams,
  cx: number,
  cy: number,
  wrap: boolean,
): number {
  const wx = apertureWeights(n, ppd, cx, wrap, P);
  const wy = apertureWeights(n, ppd, cy, wrap, P);
  const beta = P.beta;
  let sum = 0;
  for (let y = 0; y < n; y++) {
    let row = 0;
    const o = y * n;
    for (let x = 0; x < n; x++) {
      const v = Math.abs(r[o + x]);
      if (v > 0) row += wx[x] * Math.pow(v, beta);
    }
    sum += wy[y] * row;
  }
  return Math.pow(sum / (ppd * ppd), 1 / beta);
}

/** Filter a spectrum in place (DFT-domain multiply), inverse transform, return the real image. */
export function filterSpectrum(re: Float64Array, im: Float64Array, n: number, h: Float64Array): Float64Array {
  for (let i = 0; i < re.length; i++) {
    re[i] *= h[i];
    im[i] *= h[i];
  }
  fft2d(re, im, n, n, true);
  return re;
}

export interface ResponseOptions {
  params?: StandardParams;
  /** Apply the oblique effect (default true). */
  oblique?: boolean;
  /** Aperture centre in pixel-index coordinates (default: the grid centre, n / 2). */
  centre?: [number, number];
}

/**
 * Pooled response R of an n x n contrast image `c` (Weber contrast, background 0) sampled at `ppd` pixels/degree.
 * R >= 1 means detected. This is the whole standard model for an image-domain stimulus.
 */
export function modelResponse(c: ArrayLike<number>, n: number, ppd: number, opts: ResponseOptions = {}): number {
  const P = opts.params ?? STANDARD_A;
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let i = 0; i < re.length; i++) re[i] = c[i];
  fft2d(re, im, n, n, false);
  const r = filterSpectrum(re, im, n, dftFilter(n, ppd, P, opts.oblique ?? true));
  const [cx, cy] = opts.centre ?? [n / 2, n / 2];
  return pool(r, n, ppd, P, cx, cy, false);
}

// ---------------------------------------------------------------------------------------------
// Sampling grid
// ---------------------------------------------------------------------------------------------

export interface Grid {
  n: number;
  ppd: number;
}

/** Aperture support radius (deg): A^beta is below 1e-5 beyond it for Standard A. Our choice of margin. */
const APERTURE_SUPPORT_DEG = 2;

/**
 * Pick the sampling grid for a feature of radial extent `radiusDeg`. The standard grid (120 px/deg, 256 px) is used
 * whenever the feature fits; otherwise pixels/degree are halved (research 1.7) until the field covers the feature
 * plus the aperture support, so wrap-around copies cannot reach the pooling window. `minPpd` raises the sampling
 * (and then the grid size) for high-frequency stimuli.
 */
export function chooseGrid(radiusDeg: number, minPpd = 0): Grid {
  const need = Math.max(STANDARD_FIELD_DEG, radiusDeg + APERTURE_SUPPORT_DEG);
  let ppd: number = MODEL_GRID.ppd;
  for (let k = 0; k < 3 && MODEL_GRID.n / ppd < need; k++) ppd /= 2;
  ppd = Math.max(ppd, minPpd);
  let n: number = MODEL_GRID.n;
  while (n / ppd < need) n *= 2;
  return { n, ppd };
}

// ---------------------------------------------------------------------------------------------
// Detector on a ContrastPatch
// ---------------------------------------------------------------------------------------------

/** Longest half-extent (deg) of the patch window kept around the fixation point. */
const MAX_HALF_WINDOW_DEG = 2.5;

interface AxisWeights {
  start: Int32Array;
  count: Int32Array;
  weights: Float64Array[];
}

/**
 * For each of `dstN` output pixels, the source pixels and weights that produce it. `ratio` = source pixels per output
 * pixel; the output centre `dstCentre` (pixel-index coordinates) maps to the source centre (srcLen - 1) / 2.
 */
function axisWeights(srcLen: number, ratio: number, dstN: number, dstCentre: number): AxisWeights {
  const start = new Int32Array(dstN);
  const count = new Int32Array(dstN);
  const weights: Float64Array[] = new Array(dstN);
  const srcCentre = (srcLen - 1) / 2;
  for (let i = 0; i < dstN; i++) {
    const c = srcCentre + (i - dstCentre) * ratio;
    const w: number[] = [];
    let s: number;
    if (ratio >= 1) {
      // Box average over the output pixel's footprint [c - ratio/2, c + ratio/2]; source pixel j covers [j-0.5, j+0.5].
      const lo = c - ratio / 2;
      const hi = c + ratio / 2;
      s = Math.max(0, Math.floor(lo + 0.5));
      const j1 = Math.min(srcLen - 1, Math.floor(hi - 0.5 + 1e-9) + 1);
      for (let j = s; j <= j1; j++) w.push(Math.max(0, Math.min(hi, j + 0.5) - Math.max(lo, j - 0.5)) / ratio);
    } else {
      // Bilinear sample at c; source pixels outside the patch are 0.
      const j = Math.floor(c);
      const t = c - j;
      s = j;
      if (j >= 0 && j < srcLen) w.push(1 - t);
      else s = j + 1;
      if (j + 1 >= 0 && j + 1 < srcLen) w.push(t);
    }
    start[i] = s;
    count[i] = w.length;
    weights[i] = Float64Array.from(w);
  }
  return { start, count, weights };
}

/** Resample a width x height image onto an n x n grid; `ratio` = source / grid pixel size, centres aligned. */
function resample(src: ArrayLike<number>, width: number, height: number, ratio: number, n: number): Float64Array {
  const centre = (n - 1) / 2;
  const ax = axisWeights(width, ratio, n, centre);
  const ay = axisWeights(height, ratio, n, centre);
  const tmp = new Float64Array(height * n); // rows of the source, resampled along x
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      const w = ax.weights[i];
      for (let k = 0; k < ax.count[i]; k++) s += w[k] * src[y * width + ax.start[i] + k];
      tmp[y * n + i] = s;
    }
  }
  const out = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    const w = ay.weights[j];
    for (let k = 0; k < ay.count[j]; k++) {
      const row = (ay.start[j] + k) * n;
      for (let i = 0; i < n; i++) out[j * n + i] += w[k] * tmp[row + i];
    }
  }
  return out;
}

/** Angular sd (deg) of |c| along its narrower principal axis: the s in f* = 1/(4 s) of the luminance factor. */
function narrowSd(c: ArrayLike<number>, width: number, height: number, pxDeg: number): number {
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.abs(c[y * width + x]);
      sum += v;
      sx += v * x;
      sy += v * y;
    }
  }
  if (sum === 0) return 0;
  const mx = sx / sum;
  const my = sy / sum;
  let vx = 0;
  let vy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.abs(c[y * width + x]);
      vx += v * (x - mx) * (x - mx);
      vy += v * (y - my) * (y - my);
    }
  }
  return Math.sqrt(Math.min(vx, vy) / sum) * pxDeg;
}

/** Chromatic part of the response: equal-area disc of the strongest red-green pixels, castleCSF disc model. */
function chromaticResponse(patch: ContrastPatch, pxDeg: number, luminance: number): number {
  const rg = patch.rg;
  if (!rg) return 0;
  let peak = 0;
  for (let i = 0; i < rg.length; i++) peak = Math.max(peak, Math.abs(rg[i]));
  if (peak === 0) return 0;
  let count = 0;
  let sRg = 0;
  let sLum = 0;
  for (let i = 0; i < rg.length; i++) {
    if (Math.abs(rg[i]) >= 0.5 * peak) {
      count++;
      sRg += rg[i];
      sLum += patch.lum[i];
    }
  }
  const radius = Math.sqrt((count * pxDeg * pxDeg) / Math.PI);
  return castleRgContrast(sLum / count, sRg / count) * discSensitivity("rg", radius, luminance);
}

/**
 * The standard model as a `Detector` on a ContrastPatch (research 1.2), for stimuli that are not one of the tabulated
 * shapes (cropped contrast patches, ModelFest stimuli). This is the raw model for the average observer: it ignores
 * `viewing.marginDb` (the margin belongs to the bound, see visibility.ts) and uses the luminance factor g(L, f*)
 * unclamped (g = 1 at the ModelFest luminance of 30 cd/m^2).
 *
 * Geometry: one patch pixel subtends angleDeg(mmPerPx, d) / acuityScale degrees.
 *  - A 256 x 256 patch at 120 px/deg (the ModelFest geometry) is used as is: no resampling, aperture centred on pixel
 *    128 as in the ModelFest images, cyclic 2.13 deg field as in the paper.
 *  - Otherwise the patch is cropped to +/-2.5 deg around its centre (the aperture is below 4e-4 there), box-averaged
 *    (finer patches) or bilinearly interpolated (coarser) onto the grid from `chooseGrid`, with the patch centre on the
 *    grid centre, which is also the fixation point. Outside the patch the contrast is 0.
 * If the patch has an `rg` image, the red-green part is added in quadrature as in visibility.ts (castleCSF disc model).
 */
export function createStandardDetector(variant: "A" | "B" = "A"): Detector {
  const params = variant === "B" ? STANDARD_B : STANDARD_A;
  return {
    response(patch: ContrastPatch, viewing: ViewingConditions, distanceM: number): number {
      const a = viewing.acuityScale > 0 ? viewing.acuityScale : 1;
      const pxDeg = angleDeg(patch.mmPerPx, distanceM) / a;

      let R: number;
      if (
        patch.width === MODEL_GRID.n &&
        patch.height === MODEL_GRID.n &&
        Math.abs(pxDeg * MODEL_GRID.ppd - 1) < 1e-6
      ) {
        R = modelResponse(patch.lum, MODEL_GRID.n, MODEL_GRID.ppd, { params, oblique: true });
      } else {
        const halfExtent = Math.min((Math.max(patch.width, patch.height) * pxDeg) / 2, MAX_HALF_WINDOW_DEG);
        const grid = chooseGrid(halfExtent);
        const image = resample(patch.lum, patch.width, patch.height, 1 / (pxDeg * grid.ppd), grid.n);
        const c = (grid.n - 1) / 2;
        R = modelResponse(image, grid.n, grid.ppd, { params, oblique: true, centre: [c, c] });
      }

      const sd = narrowSd(patch.lum, patch.width, patch.height, pxDeg);
      const g = sd > 0 ? luminanceGain(viewing.luminanceCdM2, 1 / (4 * sd)) : 1;
      return Math.hypot(R * g, chromaticResponse(patch, pxDeg, viewing.luminanceCdM2));
    },
  };
}

export const standardDetector: Detector = createStandardDetector();

export default standardDetector;
