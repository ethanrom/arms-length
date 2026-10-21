/**
 * How small the face is drawn at a viewing distance. A real face covers an angle that falls as 1 / distance, which would
 * leave a dot at 6 m; the slider shows a fifth of that power so the face stays readable and the eye still feels the step
 * back. This is a display choice, not a model parameter: the distances themselves never use it.
 */
export const SHRINK_REFERENCE_M = 0.3;
export const SHRINK_POWER = 0.2;
export const SHRINK_MIN = 0.6;

export function faceScaleAt(distanceM: number): number {
  if (!(distanceM > 0)) return 1;
  return Math.min(1, Math.max(SHRINK_MIN, Math.pow(SHRINK_REFERENCE_M / distanceM, SHRINK_POWER)));
}
