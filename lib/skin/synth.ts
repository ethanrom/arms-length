// Synthetic photos and masks with planted features of known size and contrast, for oracle tests.
import type { RgbaImage, ScaleEstimate } from "../contracts";
import { srgbToLinear } from "./color";

export const TEST_SCALE: ScaleEstimate = { mmPerPx: 0.2, relSd: 0.04, source: "assumed" };

function encode(linear: number): number {
  const v = Math.min(1, Math.max(0, linear));
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

/** Deterministic noise in [-1, 1) (mulberry32). */
export function noiseSource(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

export type Rgb = readonly [number, number, number];

/**
 * A skin-coloured photo. `gain(x, y)` returns per-channel multipliers in LINEAR light (null = 1), so a
 * planted feature of Weber contrast C is a gain of [1 + C, 1 + C, 1 + C]. `noise` is the relative
 * amplitude of uniform multiplicative noise.
 */
export function makePhoto(
  width: number,
  height: number,
  base: Rgb,
  gain: (x: number, y: number) => readonly [number, number, number] | number | null = () => null,
  noise = 0,
  seed = 1,
): RgbaImage {
  const lin = base.map((c) => srgbToLinear(c));
  const rnd = noiseSource(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = gain(x, y);
      const k = noise ? 1 + noise * rnd() : 1;
      for (let c = 0; c < 3; c++) {
        const m = g === null ? 1 : typeof g === "number" ? g : g[c];
        data[(y * width + x) * 4 + c] = encode(lin[c] * m * k);
      }
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { width, height, data };
}

/** A mask with a constant background alpha; `draw` returns an alpha for drawn pixels, null to keep the background. */
export function makeMask(width: number, height: number, background: number, draw: (x: number, y: number) => number | null): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = draw(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 61;
      data[i + 3] = a ?? background;
    }
  }
  return { width, height, data };
}

export const inDisk = (x: number, y: number, cx: number, cy: number, r: number) => Math.hypot(x - cx, y - cy) <= r;
