/**
 * Colour maths for contrast: sRGB -> linear light -> luminance and cone (LMS) excitations.
 * All matrices live here so the LMS choice can be swapped in one place.
 * Pure and DOM-free (runs in Node and the browser).
 */
import type { Contrast, RgbaImage } from "../contracts";

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
export type Vec3 = readonly [number, number, number];

/**
 * Linear sRGB (Rec.709 primaries, D65) -> CIE XYZ. IEC 61966-2-1:1999, as tabulated by B. Lindbloom
 * (http://www.brucelindbloom.com/Eqn_RGB_XYZ_Matrix.html). The middle row is the Rec.709 luminance
 * weights (0.2127, 0.7152, 0.0722).
 */
export const LINEAR_SRGB_TO_XYZ: Mat3 = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.072175,
  0.0193339, 0.119192, 0.9503041,
];

/**
 * XYZ -> LMS cone excitations: Hunt-Pointer-Estevez matrix normalised to D65, i.e. D65 white
 * (0.95047, 1, 1.08883) maps to L = M = S = 1. Values as tabulated in
 * https://en.wikipedia.org/wiki/LMS_color_space (citing R. W. G. Hunt, "The Reproduction of Colour",
 * and M. D. Fairchild, "Color Appearance Models"). The cone contrasts we use are ratios (dL/L, dM/M), so
 * any per-cone gain normalisation cancels; only the matrix directions matter.
 */
export const XYZ_TO_LMS_HPE_D65: Mat3 = [
  0.4002, 0.7076, -0.0808,
  -0.2263, 1.1653, 0.0457,
  0, 0, 0.9182,
];

function mul(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
    }
  }
  return out as unknown as Mat3;
}

/** Linear sRGB -> LMS in one matrix. */
export const LINEAR_SRGB_TO_LMS: Mat3 = mul(XYZ_TO_LMS_HPE_D65, LINEAR_SRGB_TO_XYZ);

function apply(m: Mat3, r: number, g: number, b: number): [number, number, number] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

const SRGB_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB 8-bit code value (0..255) -> linear light (0..1). IEC 61966-2-1 transfer function. */
export function srgbToLinear(code: number): number {
  return SRGB_LUT[code];
}

/** Relative luminance Y (0..1) from linear sRGB. */
export function linearLuminance(r: number, g: number, b: number): number {
  return LINEAR_SRGB_TO_XYZ[3] * r + LINEAR_SRGB_TO_XYZ[4] * g + LINEAR_SRGB_TO_XYZ[5] * b;
}

export function linearToXyz(r: number, g: number, b: number): [number, number, number] {
  return apply(LINEAR_SRGB_TO_XYZ, r, g, b);
}

export function xyzToLms(x: number, y: number, z: number): [number, number, number] {
  return apply(XYZ_TO_LMS_HPE_D65, x, y, z);
}

export function linearToLms(r: number, g: number, b: number): [number, number, number] {
  return apply(LINEAR_SRGB_TO_LMS, r, g, b);
}

/** Mean colour of a pixel set in linear light: luminance Y and the L and M cone excitations. */
export interface ColorStat {
  y: number;
  l: number;
  m: number;
}

const EPS = 1e-6;

/** Weber luminance contrast (feature - surround) / surround. Negative when the feature is darker. */
export function weberContrast(featureY: number, surroundY: number): number {
  return (featureY - surroundY) / Math.max(surroundY, EPS);
}

/**
 * Red-green cone contrast on the L-M axis: dL/L - dM/M between feature and surround.
 * Positive when the feature is redder (relatively more L-cone drive) than the surround.
 */
export function coneContrastRg(feature: ColorStat, surround: ColorStat): number {
  return (feature.l - surround.l) / Math.max(surround.l, EPS) - (feature.m - surround.m) / Math.max(surround.m, EPS);
}

export function contrastBetween(feature: ColorStat, surround: ColorStat): Contrast {
  return { lum: weberContrast(feature.y, surround.y), rg: coneContrastRg(feature, surround) };
}

/** The photo in linear light, one plane per quantity, so contrast can be taken over any pixel set. */
export interface LinearPlanes {
  width: number;
  height: number;
  y: Float32Array;
  l: Float32Array;
  m: Float32Array;
}

export function toLinearPlanes(image: RgbaImage): LinearPlanes {
  const n = image.width * image.height;
  const y = new Float32Array(n);
  const l = new Float32Array(n);
  const m = new Float32Array(n);
  const d = image.data;
  for (let i = 0; i < n; i++) {
    const r = SRGB_LUT[d[i * 4]];
    const g = SRGB_LUT[d[i * 4 + 1]];
    const b = SRGB_LUT[d[i * 4 + 2]];
    y[i] = linearLuminance(r, g, b);
    const [pl, pm] = linearToLms(r, g, b);
    l[i] = pl;
    m[i] = pm;
  }
  return { width: image.width, height: image.height, y, l, m };
}
