/**
 * Watson & Ahumada (2005) standard model of foveal detection of spatial contrast (research 1.2-1.5):
 *   contrast image -> 2-D DFT -> x CSF(f) x oblique(f, theta) -> inverse DFT -> x Gaussian aperture
 *   -> Minkowski pooling with exponent beta. Detected iff the pooled response R >= 1; for a unit-contrast
 *   stimulus the contrast threshold is 1 / R.
 * Conventions follow the paper and our numpy replication: 120 px/deg, 256 x 256, numpy fftfreq frequencies,
 * DC gain kept, pixel area 1/ppd^2.
 */
import { fft2d } from "./fft";
import { OBLIQUE, STANDARD_A, type StandardParams } from "./params";

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
