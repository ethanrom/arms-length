/**
 * PLACEHOLDER distance renderer. Not the vision model.
 *
 * The real renderer (lib/vision) suppresses sub-threshold band content per the contrast sensitivity model.
 * This stand-in just blurs the photo with a Gaussian whose sigma grows linearly with distance, so the UI has
 * something honest to animate. It implements the frozen `DistanceRenderer` contract so integration is a
 * one-line swap in components/step-back/renderer.ts.
 *
 * Model of the blur (illustrative only): sigma = MOCK_SIGMA_ARCMIN arcmin of visual angle, converted to mm at
 * the viewing distance and then to px with the iris scale. The photo is treated as already seen from
 * MOCK_REFERENCE_DISTANCE_M (a mirror), so at that distance the output is the photo itself.
 */
import type { DistanceRenderer, RgbaImage, ScaleEstimate, ViewingConditions } from "@/lib/contracts";

export const MOCK_RENDERER_NAME = "mock-gaussian";
export const MOCK_REFERENCE_DISTANCE_M = 0.25;
/** Blur width in minutes of arc. About 2x the 1-arcmin acuity limit, so the effect reads on skin contrast. */
export const MOCK_SIGMA_ARCMIN = 1.6;

const ARCMIN_RAD = Math.PI / (180 * 60);

/** Gaussian sigma in photo pixels for a viewing distance (0 at or inside the reference distance). */
export function mockBlurSigmaPx(scale: ScaleEstimate, viewing: ViewingConditions, distanceM: number): number {
  const sigmaMm = (d: number) => MOCK_SIGMA_ARCMIN * viewing.acuityScale * ARCMIN_RAD * d * 1000;
  const extra = sigmaMm(distanceM) ** 2 - sigmaMm(MOCK_REFERENCE_DISTANCE_M) ** 2;
  if (!(extra > 0) || !(scale.mmPerPx > 0)) return 0;
  return Math.sqrt(extra) / scale.mmPerPx;
}

/** Box widths (odd) whose successive application approximates a Gaussian of the given sigma (Kutskir, 2010). */
export function boxWidthsForGaussian(sigma: number, passes = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / passes + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  lower = Math.max(1, lower);
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - passes * lower * lower - 4 * passes * lower - 3 * passes) / (-4 * lower - 4));
  return Array.from({ length: passes }, (_, i) => (i < m ? lower : upper));
}

function blurLine(src: Float32Array, dst: Float32Array, offset: number, stride: number, n: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  let acc = 0;
  for (let k = -r; k <= r; k++) acc += src[offset + Math.min(n - 1, Math.max(0, k)) * stride];
  for (let i = 0; i < n; i++) {
    dst[offset + i * stride] = acc * inv;
    acc += src[offset + Math.min(n - 1, i + r + 1) * stride] - src[offset + Math.max(0, i - r) * stride];
  }
}

/** Separable blur of an interleaved 4-channel float image (alpha untouched), one box width per pass. */
function separableBlur(buf: Float32Array, scratch: Float32Array, w: number, h: number, widths: number[]): Float32Array {
  const a = buf;
  const b = scratch;
  for (const width of widths) {
    const r = (width - 1) / 2;
    if (r < 1) continue;
    for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) blurLine(a, b, y * w * 4 + c, 4, w, r);
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) blurLine(b, a, x * 4 + c, w * 4, h, r);
  }
  return a;
}

let srgbToLinear: Float32Array | null = null;
function lut(): Float32Array {
  if (!srgbToLinear) {
    srgbToLinear = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      srgbToLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
  }
  return srgbToLinear;
}

const linearToSrgb8 = (v: number): number => {
  const c = Math.min(1, Math.max(0, v));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
};

export const mockDistanceRenderer: DistanceRenderer = (photo, scale, viewing, distanceM) => {
  const { width: w, height: h, data } = photo;
  const sigma = mockBlurSigmaPx(scale, viewing, distanceM);
  if (sigma < 0.35) return { width: w, height: h, data: new Uint8ClampedArray(data) };

  // Blur in linear light, as optics does.
  const toLin = lut();
  const buf = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h * 4; i += 4) {
    buf[i] = toLin[data[i]];
    buf[i + 1] = toLin[data[i + 1]];
    buf[i + 2] = toLin[data[i + 2]];
  }
  const blurred = separableBlur(buf, new Float32Array(buf.length), w, h, boxWidthsForGaussian(sigma));

  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h * 4; i += 4) {
    out[i] = linearToSrgb8(blurred[i]);
    out[i + 1] = linearToSrgb8(blurred[i + 1]);
    out[i + 2] = linearToSrgb8(blurred[i + 2]);
    out[i + 3] = 255;
  }
  return { width: w, height: h, data: out } satisfies RgbaImage;
};
