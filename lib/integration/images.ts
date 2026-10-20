/**
 * Small pure image helpers for the results page, on `RgbaImage` so they run in Node (the bundle builder) and in the
 * browser (live sessions) alike. Encoding to PNG or JPEG is left to the caller.
 */
import { CONCERNS, type ConcernId, type RgbaImage } from "@/lib/contracts";
import { foregroundOf } from "@/lib/skin/masks";

/** Width of a mask overlay: thumbnails are at most 184 px wide, so 2x. */
export const OVERLAY_WIDTH = 220;

/**
 * A transparent overlay of a "whole" mask: what YouCam marked, drawn white with a dark halo so it reads on any skin tone.
 * Marks are max-pooled when shrinking, so single-pixel pore dots survive; graded masks (regions) keep their weight.
 * The mask's baked dark layer is the modal alpha, so only pixels that differ from it count (lib/skin/masks.ts).
 */
export function maskOverlay(mask: RgbaImage, concern: ConcernId, outWidth = OVERLAY_WIDTH): RgbaImage {
  const graded = CONCERNS[concern].maskKind === "region" || CONCERNS[concern].maskKind === "roi";
  const fg = foregroundOf(mask, graded ? 1 : undefined);
  const k = Math.min(1, outWidth / mask.width);
  const w = Math.max(1, Math.round(mask.width * k));
  const h = Math.max(1, Math.round(mask.height * k));
  const weight = new Float32Array(w * h);
  const scale = fg.maxDiff > 0 ? 1 / fg.maxDiff : 0;
  for (let y = 0; y < mask.height; y++) {
    const oy = Math.min(h - 1, Math.floor(y * k));
    for (let x = 0; x < mask.width; x++) {
      const i = y * mask.width + x;
      const on = graded ? fg.diff[i] * scale : fg.binary[i];
      if (on === 0) continue;
      const o = oy * w + Math.min(w - 1, Math.floor(x * k));
      if (on > weight[o]) weight[o] = on;
    }
  }
  // Graded masks are shown as a soft wash; marks at full strength.
  const alpha = (v: number) => (graded ? Math.min(0.7, 0.15 + v * 0.55) * (v > 0.04 ? 1 : 0) : v);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      const a = alpha(weight[o]);
      if (a > 0) {
        data.set([255, 255, 255, Math.round(a * 255)], o * 4);
        continue;
      }
      if (graded) continue;
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) near = Math.max(near, weight[ny * w + nx]);
        }
      }
      if (near > 0) data.set([22, 21, 19, 150], o * 4);
    }
  }
  return { width: w, height: h, data };
}

/**
 * Neutral grey matched to the photo's backdrop: the mean luminance of the top corners and the mid-height edges
 * (never tinted). The bottom corners are skipped: they are often clothing.
 */
export function backdropGrey(photo: RgbaImage): string {
  const side = Math.max(8, Math.round(Math.min(photo.width, photo.height) * 0.04));
  let sum = 0;
  let n = 0;
  const corners = [
    [0, 0],
    [photo.width - side, 0],
    [0, Math.round((photo.height - side) / 2)],
    [photo.width - side, Math.round((photo.height - side) / 2)],
  ];
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + side; y++) {
      for (let x = cx; x < cx + side; x++) {
        const i = (y * photo.width + x) * 4;
        sum += 0.2126 * photo.data[i] + 0.7152 * photo.data[i + 1] + 0.0722 * photo.data[i + 2];
        n++;
      }
    }
  }
  const v = Math.round(sum / n);
  const hex = v.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}
