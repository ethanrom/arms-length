/**
 * Photo quality checks from Face Landmarker output, tuned to what YouCam accepts (frontal within about 10 degrees,
 * face over 60% of the frame, enough light, forehead visible) plus what the iris ruler needs (a visible iris).
 * Thresholds are our own working values, not vendor-published numbers, except the 60% face width and the 10 degrees.
 */
import type { Box, Size2 } from "@/lib/contracts";
import { estimateIrisScale, FACE_MESH_LANDMARKS, type Landmark } from "@/lib/scale";
import { type LumaStats } from "./light";
import { poseFromMatrix } from "./pose";
import { MIN_FACE_FRACTION, planResize } from "./resize";

export const MAX_ANGLE_DEG = 10;
/** Eye aspect ratio below this reads as closed (open eyes sit around 0.25-0.35 on the MediaPipe mesh). */
export const MIN_EYE_OPENNESS = 0.15;
/** Mean luma (0-255) of the face. Deep skin in good light sits near 60, so the floor is deliberately low. */
export const MIN_MEAN_LUMA = 40;
export const MAX_MEAN_LUMA = 220;
export const MAX_CLIPPED_FRACTION = 0.05;
/** Iris diameter over face-mesh width: 11.7 mm over about 140 mm is 0.085; outside this band the iris is not real. */
export const IRIS_FRACTION_RANGE = [0.05, 0.13] as const;
/** Face mesh must stay this far inside the frame edge (fraction of the frame). */
export const EDGE_MARGIN = 0.005;

export type CheckId = "face" | "inFrame" | "size" | "iris" | "frontal" | "eyes" | "lighting";

export interface QualityCheck {
  id: CheckId;
  ok: boolean;
  /** Hard checks make the photo unusable; soft ones are warnings the user may override. */
  hard: boolean;
  /** What to do about it, plain and neutral. Meaningful when !ok. */
  hint: string;
}

export interface CaptureQuality {
  /** Every check passes. */
  ok: boolean;
  /** Every hard check passes: the photo can be analysed. */
  usable: boolean;
  engine: "hd" | "sd";
  /** Face width over the width of the frame YouCam will receive (after the planned crop). */
  faceWidthFraction: number;
  faceWidthPx: number;
  yawDeg: number | null;
  pitchDeg: number | null;
  /** Smaller of the two eyes' aspect ratios (vertical lid gap over eye width). */
  eyeOpenness: number | null;
  /** Iris diameter over face width. */
  irisFraction: number | null;
  meanLuma: number;
  clippedFraction: number;
  checks: QualityCheck[];
}

export interface QualityInput {
  landmarks: readonly Landmark[];
  size: Size2;
  /** MediaPipe facial transformation matrix (column-major 4x4). */
  matrix: ArrayLike<number>;
  luma: LumaStats;
}

const px = (lm: Landmark, size: Size2) => ({ x: lm.x * size.width, y: lm.y * size.height });
const dist = (a: Landmark, b: Landmark, size: Size2) => {
  const p = px(a, size);
  const q = px(b, size);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

/** Bounds of the 468-point face mesh (hairline to chin, cheek to cheek) in source px. */
export function faceBoxFromLandmarks(lm: readonly Landmark[], size: Size2): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < Math.min(lm.length, 468); i++) {
    x0 = Math.min(x0, lm[i].x);
    x1 = Math.max(x1, lm[i].x);
    y0 = Math.min(y0, lm[i].y);
    y1 = Math.max(y1, lm[i].y);
  }
  return { x: x0 * size.width, y: y0 * size.height, w: (x1 - x0) * size.width, h: (y1 - y0) * size.height };
}

/** Six-point eye aspect ratio (Soukupova and Cech 2016) on MediaPipe mesh indices. */
const EYES = [
  [33, 160, 158, 133, 153, 144],
  [362, 385, 387, 263, 373, 380],
] as const;

export function eyeOpenness(lm: readonly Landmark[], size: Size2): number | null {
  if (lm.length < FACE_MESH_LANDMARKS) return null;
  const ratios = EYES.map(([p1, p2, p3, p4, p5, p6]) => {
    const width = dist(lm[p1], lm[p4], size);
    return width > 0 ? (dist(lm[p2], lm[p6], size) + dist(lm[p3], lm[p5], size)) / (2 * width) : 0;
  });
  return Math.min(...ratios);
}

function noFace(): CaptureQuality {
  const fail = (id: CheckId, hard: boolean, hint: string): QualityCheck => ({ id, ok: false, hard, hint });
  return {
    ok: false,
    usable: false,
    engine: "sd",
    faceWidthFraction: 0,
    faceWidthPx: 0,
    yawDeg: null,
    pitchDeg: null,
    eyeOpenness: null,
    irisFraction: null,
    meanLuma: 0,
    clippedFraction: 0,
    checks: [
      fail("face", true, "I can't find a face. Face the camera with your whole face in view."),
      fail("inFrame", true, "Keep your whole face in the frame."),
      fail("size", true, "Move closer."),
      fail("iris", true, "Make sure both eyes are clearly visible."),
      fail("frontal", false, "Face the camera straight on."),
      fail("eyes", false, "Open your eyes wide."),
      fail("lighting", false, "Find even light on your face."),
    ],
  };
}

/** Pass null when no face was detected. */
export function assessQuality(input: QualityInput | null): CaptureQuality {
  if (!input || input.landmarks.length < FACE_MESH_LANDMARKS) return noFace();
  const { landmarks, size, luma } = input;

  const box = faceBoxFromLandmarks(landmarks, size);
  const plan = planResize(size.width, size.height, box);
  const inFrame =
    box.x >= size.width * EDGE_MARGIN &&
    box.y >= size.height * EDGE_MARGIN &&
    box.x + box.w <= size.width * (1 - EDGE_MARGIN) &&
    box.y + box.h <= size.height * (1 - EDGE_MARGIN);

  const pose = poseFromMatrix(input.matrix);
  const frontal = !!pose && pose.yawDeg <= MAX_ANGLE_DEG && pose.pitchDeg <= MAX_ANGLE_DEG;

  const openness = eyeOpenness(landmarks, size);
  const eyesOpen = openness !== null && openness >= MIN_EYE_OPENNESS;

  const iris = estimateIrisScale(landmarks, size);
  const irisFraction = iris?.irisPx !== undefined && box.w > 0 ? iris.irisPx / box.w : null;
  const irisOk =
    irisFraction !== null && irisFraction >= IRIS_FRACTION_RANGE[0] && irisFraction <= IRIS_FRACTION_RANGE[1];

  const tooDark = luma.mean < MIN_MEAN_LUMA;
  const tooBright = luma.mean > MAX_MEAN_LUMA || luma.clippedFraction > MAX_CLIPPED_FRACTION;
  const lightHint = tooDark
    ? "More light, please. Face a window or a lamp."
    : "Too bright or glary. Move out of direct light.";

  const sizeOk = plan.ok && plan.faceFraction >= MIN_FACE_FRACTION;
  const checks: QualityCheck[] = [
    { id: "face", ok: true, hard: true, hint: "" },
    { id: "inFrame", ok: inFrame, hard: true, hint: "Keep your whole face in the frame." },
    { id: "size", ok: sizeOk, hard: true, hint: "Move closer." },
    { id: "iris", ok: irisOk, hard: true, hint: "Make sure both eyes are clearly visible." },
    { id: "frontal", ok: frontal, hard: false, hint: "Face the camera straight on." },
    { id: "eyes", ok: eyesOpen, hard: false, hint: "Open your eyes wide." },
    { id: "lighting", ok: !tooDark && !tooBright, hard: false, hint: lightHint },
  ];

  return {
    ok: checks.every((c) => c.ok),
    usable: checks.every((c) => c.ok || !c.hard),
    engine: plan.engine,
    faceWidthFraction: plan.faceFraction,
    faceWidthPx: box.w,
    yawDeg: pose?.yawDeg ?? null,
    pitchDeg: pose?.pitchDeg ?? null,
    eyeOpenness: openness,
    irisFraction,
    meanLuma: luma.mean,
    clippedFraction: luma.clippedFraction,
    checks,
  };
}

/** The single most useful instruction right now, in fix-it order; null when everything passes. */
export function guidance(q: CaptureQuality): string | null {
  const order: CheckId[] = ["face", "inFrame", "size", "frontal", "eyes", "lighting", "iris"];
  for (const id of order) {
    const check = q.checks.find((c) => c.id === id);
    if (check && !check.ok) return check.hint;
  }
  return null;
}
