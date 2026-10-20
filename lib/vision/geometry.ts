/** Viewing geometry shared by the detector, the visibility scan and the renderer. */

/** Angular size of a length `mm` seen at `distanceM` (research 9.3): 2 * atan(s / 2d), in degrees. */
export function angleDeg(mm: number, distanceM: number): number {
  return (2 * Math.atan(mm / (2000 * distanceM)) * 180) / Math.PI;
}

/** Diameter of the disk with the given area. */
export function equalAreaDiameter(area: number): number {
  return 2 * Math.sqrt(area / Math.PI);
}
