/**
 * Lighting statistics over the face region of an RGBA frame. Luma uses Rec. 709 weights on the 8-bit encoded
 * values (not linearised): cheap, and what a user perceives as "dark" or "washed out" on their screen.
 */
import type { Box } from "@/lib/contracts";

export interface LumaStats {
  /** Mean luma 0-255 over the face region. */
  mean: number;
  /** Fraction of face-region pixels with luma >= CLIP_LUMA (blown highlights). */
  clippedFraction: number;
}

export const CLIP_LUMA = 250;

/** `box` is in pixels of the frame; the whole frame is used when omitted. */
export function lumaStats(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  box?: Box,
): LumaStats {
  const x0 = Math.max(0, Math.floor(box?.x ?? 0));
  const y0 = Math.max(0, Math.floor(box?.y ?? 0));
  const x1 = Math.min(width, Math.ceil((box?.x ?? 0) + (box?.w ?? width)));
  const y1 = Math.min(height, Math.ceil((box?.y ?? 0) + (box?.h ?? height)));
  let sum = 0;
  let clipped = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const luma = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      sum += luma;
      if (luma >= CLIP_LUMA) clipped++;
      n++;
    }
  }
  return n === 0 ? { mean: 0, clippedFraction: 0 } : { mean: sum / n, clippedFraction: clipped / n };
}
