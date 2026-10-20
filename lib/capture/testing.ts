/** Synthetic Face Landmarker output for tests: a 478-point mesh whose measurements we control exactly. */
import type { Box, Size2 } from "@/lib/contracts";
import type { Landmark } from "@/lib/scale";

export interface SyntheticFaceOptions {
  size: Size2;
  /** Face mesh bounds in px. */
  box: Box;
  /** Iris diameter in px, one value for both eyes or [A, B]. Use NaN to drop an eye's iris. */
  irisPx?: number | [number, number];
  /** Eye aspect ratio of both eyes. */
  eyeOpenness?: number;
}

const RIGHT_EYE = [33, 160, 158, 133, 153, 144] as const;
const LEFT_EYE = [362, 385, 387, 263, 373, 380] as const;
const IRIS = [
  { centre: 468, ring: [469, 470, 471, 472] },
  { centre: 473, ring: [474, 475, 476, 477] },
] as const;

export function syntheticFace(opts: SyntheticFaceOptions): Landmark[] {
  const { size, box } = opts;
  const irisPx = opts.irisPx ?? 0.085 * box.w;
  const irises = Array.isArray(irisPx) ? irisPx : [irisPx, irisPx];
  const ear = opts.eyeOpenness ?? 0.3;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  const px: { x: number; y: number }[] = Array.from({ length: 478 }, () => ({ x: cx, y: cy }));
  // Extremes that fix the mesh bounds.
  px[234] = { x: box.x, y: cy };
  px[454] = { x: box.x + box.w, y: cy };
  px[10] = { x: cx, y: box.y };
  px[152] = { x: cx, y: box.y + box.h };

  [RIGHT_EYE, LEFT_EYE].forEach(([p1, p2, p3, p4, p5, p6], k) => {
    const ex = cx + (k === 0 ? -0.22 : 0.22) * box.w;
    const ey = cy - 0.1 * box.h;
    const width = 0.2 * box.w;
    const gap = ear * width;
    px[p1] = { x: ex - width / 2, y: ey };
    px[p4] = { x: ex + width / 2, y: ey };
    px[p2] = { x: ex - width / 6, y: ey - gap / 2 };
    px[p6] = { x: ex - width / 6, y: ey + gap / 2 };
    px[p3] = { x: ex + width / 6, y: ey - gap / 2 };
    px[p5] = { x: ex + width / 6, y: ey + gap / 2 };
    const iris = IRIS[k];
    const r = irises[k] / 2;
    px[iris.centre] = { x: ex, y: ey };
    px[iris.ring[0]] = { x: ex - r, y: ey };
    px[iris.ring[1]] = { x: ex, y: ey - r };
    px[iris.ring[2]] = { x: ex + r, y: ey };
    px[iris.ring[3]] = { x: ex, y: ey + r };
  });

  return px.map((p) => ({ x: p.x / size.width, y: p.y / size.height, z: 0 }));
}

/** Column-major 4x4 pose matrix for a head turned by yaw (about y) then pitch (about x), in degrees. */
export function poseMatrix(yawDeg: number, pitchDeg: number, scale = 1): number[] {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const ry = [
    [Math.cos(y), 0, Math.sin(y)],
    [0, 1, 0],
    [-Math.sin(y), 0, Math.cos(y)],
  ];
  const rx = [
    [1, 0, 0],
    [0, Math.cos(p), -Math.sin(p)],
    [0, Math.sin(p), Math.cos(p)],
  ];
  const r = ry.map((row) => [0, 1, 2].map((c) => row[0] * rx[0][c] + row[1] * rx[1][c] + row[2] * rx[2][c]));
  const out: number[] = [];
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) out.push(r[row][col] * scale);
  // Re-lay as 4x4 column-major: three columns of (r0, r1, r2, 0) plus translation.
  return [
    out[0], out[1], out[2], 0,
    out[3], out[4], out[5], 0,
    out[6], out[7], out[8], 0,
    0, 0, -40, 1,
  ];
}
