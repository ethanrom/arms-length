/**
 * Walk-back self-test, step 2: the target. A disk of a chosen diameter in mm and Weber contrast on a mid-grey
 * background, at the calibrated px/mm.
 *
 * Contrast is Weber, (L - Lb) / Lb, the same definition as ContrastPatch. It is a ratio, so it does not depend
 * on how bright the screen is, only on the sRGB values and the transfer curve. We assume a pure power law with
 * gamma 2.2 (L proportional to (v / 255)^2.2). The real sRGB curve differs by about 2% in luminance at mid-grey;
 * that is an assumption of the demonstration, not a measurement.
 */
import type { ContrastPatch } from "@/lib/contracts";

export const DISPLAY_GAMMA = 2.2;
export const MID_GREY_SRGB = 128;

const relLuminance = (srgb: number, gamma: number): number => (srgb / 255) ** gamma;

export interface DrawnContrast {
  /** 8-bit sRGB value (all three channels) to draw the disk with. */
  srgb: number;
  /** Weber contrast that value actually produces after 8-bit rounding (and clipping). */
  achievedContrast: number;
  /** True if the requested contrast needed a luminance outside 0..1 of white and was clipped. */
  clipped: boolean;
}

/** sRGB value to draw so a disk has Weber contrast `contrast` against a background of sRGB `backgroundSrgb`. */
export function srgbForContrast(
  contrast: number,
  backgroundSrgb: number = MID_GREY_SRGB,
  gamma: number = DISPLAY_GAMMA,
): DrawnContrast {
  const lb = relLuminance(backgroundSrgb, gamma);
  const wanted = lb * (1 + contrast);
  const srgb = Math.min(255, Math.max(0, Math.round(255 * Math.max(0, wanted) ** (1 / gamma))));
  return {
    srgb,
    achievedContrast: relLuminance(srgb, gamma) / lb - 1,
    clipped: wanted < 0 || wanted > 1,
  };
}

/**
 * The disk as the detector sees it: Weber contrast in a square patch at the screen's pixel size. Edge pixels carry
 * the covered fraction (4 x 4 subsamples), like a browser's antialiased circle. The patch is 3 diameters wide so the
 * detector has plain background around the disk.
 */
export function diskPatch(diameterMm: number, contrast: number, pxPerMm: number): ContrastPatch {
  const rPx = (diameterMm * pxPerMm) / 2;
  const side = Math.max(32, 2 * Math.ceil(3 * rPx));
  const lum = new Float32Array(side * side);
  const sub = 4;
  const c = side / 2;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      let inside = 0;
      for (let j = 0; j < sub; j++) {
        for (let i = 0; i < sub; i++) {
          const dx = x + (i + 0.5) / sub - c;
          const dy = y + (j + 0.5) / sub - c;
          if (dx * dx + dy * dy <= rPx * rPx) inside++;
        }
      }
      lum[y * side + x] = (contrast * inside) / (sub * sub);
    }
  }
  return { width: side, height: side, mmPerPx: 1 / pxPerMm, lum };
}
