/**
 * The contrast sensitivity function as the widgets draw it. Two curves, both from lib/vision:
 *  - `gain`: Standard A's filter gain S(f) (`csf`, Watson & Ahumada 2005 Eq. 15). A filter gain, not a sensitivity.
 *  - `patchSensitivity`: 1 / threshold of a one-octave Gabor patch under the whole model (`patchThresholdLookup`), at the
 *    viewing luminance. This is what the Step back picture compares each octave band against (renderer.ts).
 */
import { luminanceGain } from "@/lib/vision/castle";
import { DEFAULT_MARGIN_DB, PATCH_GABOR_SD_CYCLES, STANDARD_A, type StandardParams } from "@/lib/vision/params";
import { csf } from "@/lib/vision/standard";
import { patchThresholdLookup } from "@/lib/vision/tables";

export const CSF_F_MIN = 0.1;
export const CSF_F_MAX = 60;
/** The patch table spans 0.25 to 45 cycles/degree (lib/vision/tables.ts). */
export const PATCH_F_MIN = 0.25;
export const PATCH_F_MAX = 45;

export interface CsfSample {
  f: number;
  gain: number;
  /** 1 / typical-eyes threshold at luminance L; null outside the patch table. */
  patchSensitivity: number | null;
}

/** Contrast threshold of a one-octave patch for a typical sharp-eyed person at luminance `L`: the renderer's rule with margin 0. */
export function patchThreshold(f0: number, luminanceCdM2: number): number {
  return patchThresholdLookup(f0) / luminanceGain(luminanceCdM2, f0);
}

/** The same for perfect eyes: the one-sided bound (luminance factor floored at 1, then the margin), as in the renderer. */
export function patchThresholdPerfect(f0: number, luminanceCdM2: number, marginDb = DEFAULT_MARGIN_DB): number {
  return (patchThresholdLookup(f0) / Math.max(1, luminanceGain(luminanceCdM2, f0))) * Math.pow(10, -marginDb / 20);
}

/** Log-spaced samples of both curves. */
export function csfSeries(luminanceCdM2: number, n = 160): CsfSample[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = CSF_F_MIN * Math.pow(CSF_F_MAX / CSF_F_MIN, i / n);
    const inTable = f >= PATCH_F_MIN && f <= PATCH_F_MAX;
    return { f, gain: csf(f, STANDARD_A), patchSensitivity: inTable ? 1 / patchThreshold(f, luminanceCdM2) : null };
  });
}

/** Peak of the filter gain by a fine scan, as the unit test does: 217.29 at 3.45 cycles/degree for Standard A. */
export function csfPeak(params: StandardParams = STANDARD_A): { gain: number; f: number } {
  let best = 0;
  let at = 0;
  for (let f = 0.05; f <= 30; f += 0.001) {
    const s = csf(f, params);
    if (s > best) {
      best = s;
      at = f;
    }
  }
  return { gain: best, f: at };
}

/** Standard deviation of the Gabor envelope in degrees for a carrier of `f0` cycles/degree (1-octave bandwidth). */
export function gaborSdDeg(f0: number): number {
  return PATCH_GABOR_SD_CYCLES / f0;
}

/** Side of the drawn field in degrees: eight sd of the envelope, so the patch fills about half the picture, and at least one degree. */
export function gaborFieldDeg(f0: number): number {
  return Math.max(1, 8 * gaborSdDeg(f0));
}

/**
 * Weber-contrast image of a Gabor patch (vertical carrier, cosine phase, peak `contrast`) on an n x n grid covering
 * `gaborFieldDeg(f0)`. Values are (L - L0) / L0 in [-contrast, +contrast].
 */
export function gaborImage(f0: number, contrast: number, n = 256): Float32Array {
  const field = gaborFieldDeg(f0);
  const sd = gaborSdDeg(f0);
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const y = ((j + 0.5) / n - 0.5) * field;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * field;
      out[j * n + i] = contrast * Math.exp(-(x * x + y * y) / (2 * sd * sd)) * Math.cos(2 * Math.PI * f0 * y);
    }
  }
  return out;
}

/** sRGB 8-bit code for a linear-light value (IEC 61966-2-1 encoding), rounded and clamped. */
export function linearToSrgbCode(v: number, dither = 0): number {
  const c = Math.min(1, Math.max(0, v));
  const e = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(e * 255 + dither)));
}

/**
 * Grey code for a contrast value on a mid-grey background (L0 = linear 0.2158, sRGB code 128): L = L0 (1 + c). The
 * image is drawn in linear light so the contrast on screen is the contrast in the model, up to 8-bit rounding; `dither` (in
 * code values) spreads that rounding as noise instead of bands.
 */
export function contrastToGrey(c: number, dither = 0): number {
  return linearToSrgbCode(0.2158605 * (1 + c), dither);
}

/** A repeatable pseudo-random value in [-0.5, 0.5) for pixel `i`: dither that keeps 1-3% contrast from banding on an 8-bit screen. */
export function ditherAt(i: number): number {
  const h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  const g = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((g >>> 8) & 0xffff) / 65536 - 0.5;
}
