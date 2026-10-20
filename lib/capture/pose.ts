/**
 * Head pose from MediaPipe's facial transformation matrix (column-major 4x4, canonical face to camera space,
 * camera looks down -z, y up). A frontal face has its forward axis (matrix column 2) pointing at the camera.
 * Yaw and pitch are returned as magnitudes in degrees: the checks only care how far from frontal, not which way.
 */
export interface Pose {
  yawDeg: number;
  pitchDeg: number;
}

const RAD_TO_DEG = 180 / Math.PI;

export function poseFromMatrix(m: ArrayLike<number>): Pose | null {
  if (m.length < 11) return null;
  // Column 2 = where the face's forward axis points. The matrix may carry a uniform scale, so normalise.
  const fx = m[8];
  const fy = m[9];
  const fz = m[10];
  const len = Math.hypot(fx, fy, fz);
  if (!(len > 0) || !Number.isFinite(len)) return null;
  return {
    yawDeg: Math.abs(Math.atan2(fx, fz) * RAD_TO_DEG),
    pitchDeg: Math.abs(Math.asin(Math.max(-1, Math.min(1, fy / len))) * RAD_TO_DEG),
  };
}
