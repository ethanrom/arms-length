/**
 * REFERENCE STAND-IN DETECTOR, NOT THE PRODUCT MODEL.
 *
 * A deliberately simple detector so the ModelFest harness runs and is tested without depending on lib/vision:
 * contrast image -> radially symmetric difference-of-Gaussians CSF (FFT) -> Gaussian spatial aperture ->
 * Minkowski pooling, the same pipeline shape as the Watson & Ahumada (2005) standard model but with a cruder
 * CSF, no oblique effect and no luminance dependence. Its parameters were tuned once by coordinate descent on
 * the same 41 ModelFest thresholds it is scored on (RMS about 2 dB), so its error is an in-sample check that the
 * harness works, not a validation of anything. The real validation is `npm run eval -- --detector=standard`.
 */
import type { ContrastPatch, Detector, ViewingConditions } from "@/lib/contracts";
import { fft2d } from "./fft";

export interface ReferenceParams {
  /** CSF gain. */
  gain: number;
  /** Width (cpd) of the centre Gaussian, exp(-(f/fHigh)^2). */
  fHigh: number;
  /** Width (cpd) of the low-frequency Gaussian that is subtracted. */
  fLow: number;
  /** Weight of the subtracted Gaussian (0..1). */
  a: number;
  /** Sd (deg) of the Gaussian aperture centred on the patch. */
  sigmaDeg: number;
  /** Minkowski exponent. */
  beta: number;
}

/** Hand-tuned, see file header. */
export const REFERENCE_PARAMS: ReferenceParams = {
  gain: 243,
  fHigh: 15,
  fLow: 1.6,
  a: 0.715,
  sigmaDeg: 0.4,
  beta: 2.4,
};

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(n, 2)));

export function makeReferenceDetector(p: ReferenceParams = REFERENCE_PARAMS): Detector {
  return {
    response(patch: ContrastPatch, viewing: ViewingConditions, distanceM: number): number {
      const { width: w, height: h, lum, mmPerPx } = patch;
      const n = nextPow2(Math.max(w, h));
      const degPerPx = (Math.atan(mmPerPx / (distanceM * 1000)) * 180) / Math.PI;
      const re = new Float64Array(n * n);
      const im = new Float64Array(n * n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) re[y * n + x] = lum[y * w + x];

      fft2d(re, im, n, false);
      for (let ky = 0; ky < n; ky++) {
        const fy = ((ky <= n / 2 ? ky : ky - n) / (n * degPerPx)) * viewing.acuityScale;
        for (let kx = 0; kx < n; kx++) {
          const fx = ((kx <= n / 2 ? kx : kx - n) / (n * degPerPx)) * viewing.acuityScale;
          const f2 = fx * fx + fy * fy;
          const s = p.gain * (Math.exp(-f2 / p.fHigh ** 2) - p.a * Math.exp(-f2 / p.fLow ** 2));
          re[ky * n + kx] *= s;
          im[ky * n + kx] *= s;
        }
      }
      fft2d(re, im, n, true);

      let sum = 0;
      for (let y = 0; y < h; y++) {
        const dy = (y - h / 2) * degPerPx;
        for (let x = 0; x < w; x++) {
          const dx = (x - w / 2) * degPerPx;
          const r = re[y * n + x] * Math.exp(-(dx * dx + dy * dy) / (2 * p.sigmaDeg ** 2));
          sum += Math.abs(r) ** p.beta;
        }
      }
      return (sum * degPerPx * degPerPx) ** (1 / p.beta);
    },
  };
}

export const referenceDetector: Detector = makeReferenceDetector();
