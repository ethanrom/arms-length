/**
 * The difference between a photo and a Skin Simulation render of the same face, per pixel, in linear light:
 * |Y_photo - Y_sim| / Y_sim. Same quantity as the "Worth it?" contrast (docs/MODEL.md section 10), here for every pixel
 * instead of the pixels of one measured target. Pure; both images must have the same size.
 */
import type { Box, RgbaImage } from "@/lib/contracts";
import { linearLuminance, srgbToLinear } from "@/lib/skin/color";

/** Floor on the denominator so pure black does not blow the ratio up (same value as RENDERER.localMeanFloor). */
const Y_FLOOR = 0.02;

export function relativeLuminanceDifference(photo: RgbaImage, sim: RgbaImage, boxRadius = 0): Float32Array {
  if (photo.width !== sim.width || photo.height !== sim.height) throw new RangeError("images must have the same size");
  const n = photo.width * photo.height;
  const out = new Float32Array(n);
  const ya = boxMean(luminancePlane(photo), photo.width, photo.height, boxRadius);
  const yb = boxMean(luminancePlane(sim), sim.width, sim.height, boxRadius);
  for (let i = 0; i < n; i++) out[i] = Math.abs(ya[i] - yb[i]) / Math.max(yb[i], Y_FLOOR);
  return out;
}

/** Relative luminance Y (0..1) of every pixel, in linear light. */
export function luminancePlane(image: RgbaImage): Float32Array {
  const n = image.width * image.height;
  const y = new Float32Array(n);
  const d = image.data;
  for (let i = 0; i < n; i++) y[i] = linearLuminance(srgbToLinear(d[i * 4]), srgbToLinear(d[i * 4 + 1]), srgbToLinear(d[i * 4 + 2]));
  return y;
}

/**
 * Mean over a (2r + 1) x (2r + 1) box, edges clamped. r = 1 is the 3 x 3 box the measuring code reads at a pore or breakout
 * marker (docs/MODEL.md section 10); it takes JPEG noise out of the comparison without moving anything larger than a pixel.
 */
export function boxMean(plane: Float32Array, width: number, height: number, r: number): Float32Array {
  if (r <= 0) return plane;
  const tmp = new Float32Array(plane.length);
  const out = new Float32Array(plane.length);
  const k = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let dx = -r; dx <= r; dx++) s += plane[y * width + Math.min(width - 1, Math.max(0, x + dx))];
      tmp[y * width + x] = s / k;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let dy = -r; dy <= r; dy++) s += tmp[Math.min(height - 1, Math.max(0, y + dy)) * width + x];
      out[y * width + x] = s / k;
    }
  }
  return out;
}

/** Share of pixels at or above a difference, e.g. how much of the face changes by 5% or more. */
export function shareAtLeast(diff: Float32Array, level: number): number {
  let n = 0;
  for (let i = 0; i < diff.length; i++) if (diff[i] >= level) n++;
  return diff.length ? n / diff.length : 0;
}

/**
 * Ink-on-paper picture of a difference map: paper where nothing changed, ink where `full` (a ratio, e.g. 0.25) or more
 * changed. Square-root ramp so small differences stay visible. Returns RGBA bytes.
 */
export function differenceToInk(diff: Float32Array, full: number, paper: readonly [number, number, number], ink: readonly [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(diff.length * 4);
  for (let i = 0; i < diff.length; i++) {
    const t = Math.sqrt(Math.min(1, diff[i] / full));
    out[i * 4] = paper[0] + (ink[0] - paper[0]) * t;
    out[i * 4 + 1] = paper[1] + (ink[1] - paper[1]) * t;
    out[i * 4 + 2] = paper[2] + (ink[2] - paper[2]) * t;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * The part of `image` that `crop` (in the pixels of `frame`) covers, as an image of its own. Same rounding as the canvas crop the
 * pictures are drawn from, so the difference map lines up with them pixel for pixel.
 */
export function cropRgba(image: RgbaImage, frame: { width: number; height: number }, crop: Box): RgbaImage {
  const kx = image.width / frame.width;
  const ky = image.height / frame.height;
  const sx = Math.max(0, Math.round(crop.x * kx));
  const sy = Math.max(0, Math.round(crop.y * ky));
  const sw = Math.max(1, Math.min(image.width - sx, Math.round(crop.w * kx)));
  const sh = Math.max(1, Math.min(image.height - sy, Math.round(crop.h * ky)));
  const data = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const from = ((sy + y) * image.width + sx) * 4;
    data.set(image.data.subarray(from, from + sw * 4), y * sw * 4);
  }
  return { width: sw, height: sh, data };
}
