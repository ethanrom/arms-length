/**
 * STUB (owned by the true-size face agent): the composition maths. Replace the bodies, keep the exports.
 * The middle of a viewer's field, drawn as the stage height: a project assumption, stated in "How we know".
 */
export const SCENE_FOV_DEG = 40;

/** Physical height of the photo, mm. */
export function photoHeightMm(frame: { height: number }, scale: { mmPerPx: number }): number {
  return frame.height * scale.mmPerPx;
}

/** In person: the photo's display height as a fraction of the stage height at `distanceM` (true angular size). */
export function inPersonHeightFraction(heightMm: number, distanceM: number): number {
  const deg = (2 * Math.atan(heightMm / 2 / (distanceM * 1000)) * 180) / Math.PI;
  return Math.min(1.6, Math.max(0.04, deg / SCENE_FOV_DEG));
}
