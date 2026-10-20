/**
 * Test B stimuli: a 60 x 60 mm patch of uniform skin tone at 10 px/mm with one dark disk in the centre and a printed
 * millimetre ruler along the bottom edge.
 *
 * Contrast is Weber contrast in linear light: C = (Y_disk - Y_skin) / Y_skin, with Y the Rec. 709 / sRGB relative
 * luminance of the decoded (linear) colour. The disk is a scaled copy of the skin colour (same chromaticity), then
 * snapped to the 8-bit sRGB triplet whose realised Weber contrast is closest to the target, so quantisation does not
 * change the stimulus. Edge pixels are mixed in linear light (not in sRGB), 4 x 4 supersampled.
 */
import sharp from "sharp";

export const PATCH_MM = 60;
export const PX_PER_MM = 10;
export const PATCH_PX = PATCH_MM * PX_PER_MM;
export const RULER_PX = 6 * PX_PER_MM;

export type Rgb8 = readonly [number, number, number];

/** A mid-light skin tone, sRGB 8-bit. */
export const SKIN_SRGB: Rgb8 = [208, 154, 124];

export const DISK_DIAMETERS_MM = [1, 2, 4] as const;
export const WEBER_CONTRASTS = [0.05, 0.15, 0.3] as const;

/** sRGB electro-optical transfer function (IEC 61966-2-1): code value 0..255 to linear light 0..1. */
export function srgbToLinear(code: number): number {
  const v = code / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Inverse transfer function: linear light 0..1 to a (float) code value 0..255. */
export function linearToSrgb(lin: number): number {
  const v = lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
  return v * 255;
}

/** Relative luminance Y of an 8-bit sRGB colour (Rec. 709 primaries). */
export function luminance(rgb: Rgb8): number {
  return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

/** Weber contrast of `target` against `background`, in linear light. Negative for a darker target. */
export function weber(target: Rgb8, background: Rgb8): number {
  return luminance(target) / luminance(background) - 1;
}

const clamp8 = (x: number) => Math.min(255, Math.max(0, Math.round(x)));

/**
 * The 8-bit sRGB colour for a disk with Weber contrast `contrast` (negative = darker) on `background`.
 * Starts from the exact linear scaling of the background, then searches +-3 codes per channel for the triplet with the
 * smallest contrast error, breaking ties by the smallest drift in channel ratios (chromaticity).
 */
export function diskColour(background: Rgb8, contrast: number): Rgb8 {
  const k = 1 + contrast;
  const ideal = background.map((c) => linearToSrgb(k * srgbToLinear(c)));
  const ratio = (c: Rgb8) => [c[0] / (c[1] || 1), c[2] / (c[1] || 1)];
  const bgRatio = ratio(background);
  let best: Rgb8 = [clamp8(ideal[0]), clamp8(ideal[1]), clamp8(ideal[2])];
  let bestScore = Infinity;
  for (let dr = -3; dr <= 3; dr++)
    for (let dg = -3; dg <= 3; dg++)
      for (let db = -3; db <= 3; db++) {
        const c: Rgb8 = [clamp8(ideal[0] + dr), clamp8(ideal[1] + dg), clamp8(ideal[2] + db)];
        const err = Math.abs(weber(c, background) - contrast);
        const r = ratio(c);
        const drift = Math.abs(r[0] - bgRatio[0]) + Math.abs(r[1] - bgRatio[1]);
        const score = err + 1e-3 * drift;
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
  return best;
}

export interface PatchSpec {
  id: string;
  diameterMm: number;
  /** Magnitude of the Weber contrast (0.15 = the disk is 15% darker than the skin). */
  contrast: number;
}

export function patchSpecs(): PatchSpec[] {
  const out: PatchSpec[] = [];
  for (const contrast of WEBER_CONTRASTS)
    for (const diameterMm of DISK_DIAMETERS_MM)
      out.push({ id: `d${diameterMm}mm_c${Math.round(contrast * 100)}`, diameterMm, contrast });
  return out;
}

export interface RenderedPatch {
  width: number;
  height: number;
  /** Packed RGB, 8 bit, no ruler. */
  rgb: Uint8Array;
  skin: Rgb8;
  disk: Rgb8;
  /** Weber contrast realised by the 8-bit colours (negative). */
  realisedWeber: number;
}

const SS = 4;

/** The patch without the ruler; the disk is centred on the whole 60 x 60 mm patch. */
export function renderPatchRaw(spec: PatchSpec, skin: Rgb8 = SKIN_SRGB): RenderedPatch {
  const disk = diskColour(skin, -spec.contrast);
  const bgLin = skin.map(srgbToLinear);
  const diskLin = disk.map(srgbToLinear);
  const cx = PATCH_PX / 2;
  const cy = PATCH_PX / 2;
  const r = (spec.diameterMm * PX_PER_MM) / 2;
  const rgb = new Uint8Array(PATCH_PX * PATCH_PX * 3);
  for (let y = 0; y < PATCH_PX; y++) {
    for (let x = 0; x < PATCH_PX; x++) {
      let cov = 0;
      if (Math.abs(x + 0.5 - cx) <= r + 1 && Math.abs(y + 0.5 - cy) <= r + 1) {
        for (let sy = 0; sy < SS; sy++)
          for (let sx = 0; sx < SS; sx++) {
            const dx = x + (sx + 0.5) / SS - cx;
            const dy = y + (sy + 0.5) / SS - cy;
            if (dx * dx + dy * dy <= r * r) cov++;
          }
        cov /= SS * SS;
      }
      const i = (y * PATCH_PX + x) * 3;
      for (let c = 0; c < 3; c++) {
        if (cov === 0) rgb[i + c] = skin[c];
        else if (cov === 1) rgb[i + c] = disk[c];
        else rgb[i + c] = clamp8(linearToSrgb(bgLin[c] * (1 - cov) + diskLin[c] * cov));
      }
    }
  }
  return { width: PATCH_PX, height: PATCH_PX, rgb, skin, disk, realisedWeber: weber(disk, skin) };
}

/**
 * SVG overlay for the ruler: a pale strip along the bottom edge, a tick every millimetre (longer at 5 and 10 mm),
 * labels every 10 mm. Digits are drawn as strokes, not text, so the render does not depend on installed fonts.
 */
export function rulerSvg(): string {
  const top = PATCH_PX - RULER_PX;
  const parts: string[] = [`<rect x="0" y="${top}" width="${PATCH_PX}" height="${RULER_PX}" fill="#f3f0e8"/>`];
  const ink = "#1d1d1b";
  for (let mm = 0; mm <= PATCH_MM; mm++) {
    const x = Math.min(mm * PX_PER_MM, PATCH_PX - 1) + 0.5;
    const len = mm % 10 === 0 ? 26 : mm % 5 === 0 ? 18 : 10;
    parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + len}" stroke="${ink}" stroke-width="${mm % 10 === 0 ? 2 : 1.4}"/>`);
  }
  for (let mm = 0; mm <= PATCH_MM; mm += 10) {
    const x = Math.min(mm * PX_PER_MM, PATCH_PX - 14) + (mm === 0 ? 14 : mm === PATCH_MM ? -12 : 0);
    parts.push(digits(String(mm), x, top + 33, 18, ink));
  }
  parts.push(digits("mm", 40, top + 33, 18, ink));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PATCH_PX}" height="${PATCH_PX}" viewBox="0 0 ${PATCH_PX} ${PATCH_PX}">${parts.join("")}</svg>`;
}

// Seven-segment-style glyphs on a 1 x 2 grid, enough for the digits 0-9 and "mm". Centre-aligned at x.
const SEG: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

function digits(text: string, xc: number, y0: number, h: number, ink: string): string {
  const w = h * 0.55;
  const gap = h * 0.3;
  if (text === "mm") {
    // Two lowercase m shapes: three verticals joined by two arches, drawn as paths.
    const mw = h * 0.7;
    const p = (x: number) =>
      `M${x} ${y0 + h} V${y0 + h * 0.45} M${x} ${y0 + h * 0.6} Q${x + mw * 0.25} ${y0 + h * 0.4} ${x + mw * 0.5} ${y0 + h * 0.6} V${y0 + h} M${x + mw * 0.5} ${y0 + h * 0.6} Q${x + mw * 0.75} ${y0 + h * 0.4} ${x + mw} ${y0 + h * 0.6} V${y0 + h}`;
    return `<path d="${p(xc)} ${p(xc + mw + 4)}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const total = text.length * w + (text.length - 1) * gap;
  let x = xc - total / 2;
  const d: string[] = [];
  for (const ch of text) {
    const s = SEG[ch] ?? "";
    const m = y0 + h / 2;
    const seg: Record<string, string> = {
      a: `M${x} ${y0} H${x + w}`,
      b: `M${x + w} ${y0} V${m}`,
      c: `M${x + w} ${m} V${y0 + h}`,
      d: `M${x} ${y0 + h} H${x + w}`,
      e: `M${x} ${m} V${y0 + h}`,
      f: `M${x} ${y0} V${m}`,
      g: `M${x} ${m} H${x + w}`,
    };
    for (const k of s) d.push(seg[k]);
    x += w + gap;
  }
  return `<path d="${d.join(" ")}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** The final PNG sent to the model: the patch with the ruler composited over the bottom edge. */
export async function renderPatchPng(spec: PatchSpec, skin: Rgb8 = SKIN_SRGB): Promise<Buffer> {
  const p = renderPatchRaw(spec, skin);
  return sharp(Buffer.from(p.rgb), { raw: { width: p.width, height: p.height, channels: 3 } })
    .composite([{ input: Buffer.from(rulerSvg()), top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
