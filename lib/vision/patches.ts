import type { ContrastPatch } from "../contracts/vision";

/**
 * Build a ContrastPatch of a centred Gaussian blob (sd) or uniform disk (diameter), sizes in mm, peak contrast
 * `contrast`, with `mmPerPx` resolution. The patch spans four times the feature size (at least 9 px) and has an odd
 * side so the feature sits on the middle pixel.
 */
export function synthesizePatch(
  shape: "gaussian" | "disk",
  sizeMm: number,
  contrast: number,
  mmPerPx: number,
): ContrastPatch {
  const extent = shape === "gaussian" ? 8 * sizeMm : 2 * sizeMm;
  const side = Math.max(9, Math.ceil(extent / mmPerPx) | 1);
  const lum = new Float32Array(side * side);
  const c = (side - 1) / 2;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const r = Math.hypot(x - c, y - c) * mmPerPx;
      lum[y * side + x] =
        shape === "gaussian" ? contrast * Math.exp(-(r * r) / (2 * sizeMm * sizeMm)) : r <= sizeMm / 2 ? contrast : 0;
    }
  }
  return { width: side, height: side, mmPerPx, lum };
}
