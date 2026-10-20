/**
 * Browser-only side of capture: the Face Landmarker, the camera, canvases and file decoding.
 * Everything with a decision in it lives in the pure modules next to this file; this one only moves pixels.
 */
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Box, Size2 } from "@/lib/contracts";
import { estimateIrisScale, rescaleEstimate, type Landmark } from "@/lib/scale";
import { orientationToApply, orientedDraw, readJpegInfo } from "./exif";
import { lumaStats, type LumaStats } from "./light";
import { assessQuality, faceBoxFromLandmarks, type CaptureQuality } from "./quality";
import { planResize, type ResizePlan } from "./resize";
import type { CaptureResult } from "./types";

/** Vendored under public/mediapipe (see the NOTICE there): no CDN at runtime. */
export const MEDIAPIPE_BASE = "/mediapipe";
const JPEG_QUALITY = 0.92;
/** Browsers cap canvas area (iOS Safari about 16.7 MP), so very large uploads are decoded at reduced size. */
const MAX_DECODE_PIXELS = 16_000_000;
const LUMA_SAMPLE_WIDTH = 320;
const DETECT_MAX_SIDE = 2048;

export interface Detection {
  landmarks: Landmark[];
  /** Facial transformation matrix, column-major 4x4. */
  matrix: number[];
}

type Mode = "IMAGE" | "VIDEO";
let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let currentMode: Mode = "VIDEO";

/** Load the model once per page. CPU delegate: deterministic, no WebGL dependency, fast enough for a few fps. */
export function loadLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE}/wasm`);
      currentMode = "VIDEO";
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${MEDIAPIPE_BASE}/face_landmarker.task`, delegate: "CPU" },
        runningMode: currentMode,
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
    })();
    landmarkerPromise.catch(() => {
      landmarkerPromise = null; // let the user retry
    });
  }
  return landmarkerPromise;
}

async function setRunningMode(lm: FaceLandmarker, mode: Mode): Promise<void> {
  if (currentMode === mode) return;
  await lm.setOptions({ runningMode: mode });
  currentMode = mode;
}

function toDetection(result: FaceLandmarkerResult): Detection | null {
  const face = result.faceLandmarks[0];
  const matrix = result.facialTransformationMatrixes?.[0];
  if (!face || !matrix) return null;
  return { landmarks: face.map(({ x, y, z }) => ({ x, y, z })), matrix: Array.from(matrix.data) };
}

/**
 * Landmarks for one unrelated image (an upload or a captured frame). Landmarks are normalised, so very large
 * photos are shown to the model at reduced size: it works on 256 px face crops anyway, and a 12 MP texture per
 * upload exhausts memory in some browsers.
 */
export async function detectStill(source: HTMLCanvasElement): Promise<Detection | null> {
  const lm = await loadLandmarker();
  await setRunningMode(lm, "IMAGE");
  const k = Math.min(1, DETECT_MAX_SIDE / Math.max(source.width, source.height));
  if (k === 1) return toDetection(lm.detect(source));
  const small = document.createElement("canvas");
  small.width = Math.round(source.width * k);
  small.height = Math.round(source.height * k);
  small.getContext("2d")?.drawImage(source, 0, 0, small.width, small.height);
  try {
    return toDetection(lm.detect(small));
  } finally {
    small.width = small.height = 0; // release the pixels now rather than at the next GC
  }
}

/** Prepare for per-frame detection on a live video. */
export async function startLiveDetection(): Promise<(video: HTMLVideoElement) => Detection | null> {
  const lm = await loadLandmarker();
  await setRunningMode(lm, "VIDEO");
  return (video) => toDetection(lm.detectForVideo(video, performance.now()));
}

export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
}

/** Plain-language reason for a camera failure. */
export function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The camera is blocked. Allow camera access in your browser, or upload a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. You can upload a photo instead.";
  }
  if (name === "NotReadableError") {
    return "The camera is busy in another app. Close it and try again, or upload a photo.";
  }
  return "The camera could not start. You can upload a photo instead.";
}

let sampleCanvas: HTMLCanvasElement | null = null;

/** Lighting over the face region, measured on a small copy of the frame. */
export function sampleLuma(source: CanvasImageSource, size: Size2, faceBox: Box): LumaStats {
  const k = Math.min(1, LUMA_SAMPLE_WIDTH / size.width);
  const w = Math.max(1, Math.round(size.width * k));
  const h = Math.max(1, Math.round(size.height * k));
  sampleCanvas ??= document.createElement("canvas");
  sampleCanvas.width = w;
  sampleCanvas.height = h;
  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { mean: 128, clippedFraction: 0 };
  ctx.drawImage(source, 0, 0, w, h);
  const scaled: Box = { x: faceBox.x * k, y: faceBox.y * k, w: faceBox.w * k, h: faceBox.h * k };
  return lumaStats(ctx.getImageData(0, 0, w, h).data, w, h, scaled);
}

/** Quality of a detection on a frame (live preview or still). */
export function assessFrame(
  source: CanvasImageSource,
  size: Size2,
  detection: Detection | null,
): CaptureQuality {
  if (!detection) return assessQuality(null);
  const luma = sampleLuma(source, size, faceBoxFromLandmarks(detection.landmarks, size));
  return assessQuality({ landmarks: detection.landmarks, size, matrix: detection.matrix, luma });
}

/** Copy the current video frame at its native resolution. */
export function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return canvas;
}

/** Decode an uploaded file upright, honouring the EXIF orientation of JPEGs. */
export async function decodeUpload(file: File): Promise<HTMLCanvasElement> {
  const bytes = await file.arrayBuffer();
  const info = readJpegInfo(bytes);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: file.type }));
  try {
    const draw = orientedDraw(orientationToApply(info, bitmap), bitmap.width, bitmap.height);
    const k = Math.min(1, Math.sqrt(MAX_DECODE_PIXELS / (draw.width * draw.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(draw.width * k));
    canvas.height = Math.max(1, Math.round(draw.height * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    const [a, b, c, d, e, f] = draw.matrix;
    ctx.setTransform(a * k, b * k, c * k, d * k, e * k, f * k);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/** Draw the planned crop at the planned size and encode it. */
export function renderPlan(source: HTMLCanvasElement, plan: ResizePlan): string {
  const out = document.createElement("canvas");
  out.width = plan.target.width;
  out.height = plan.target.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingQuality = "high";
  const { crop, target } = plan;
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, target.width, target.height);
  return out.toDataURL("image/jpeg", JPEG_QUALITY);
}

export interface Finalized {
  quality: CaptureQuality;
  /** Null when the photo cannot be analysed (no face, no iris, too small). */
  result: CaptureResult | null;
  /** The planned frame as a data URL for the review screen; null when there is no plan. */
  preview: string | null;
}

/** Everything after landmarks: quality, crop plan, iris scale in the output frame, and the encoded image. */
export function finalizeCapture(source: HTMLCanvasElement, detection: Detection | null): Finalized {
  const size = { width: source.width, height: source.height };
  const quality = assessFrame(source, size, detection);
  if (!detection) return { quality, result: null, preview: null };

  const plan = planResize(size.width, size.height, faceBoxFromLandmarks(detection.landmarks, size));
  const estimate = estimateIrisScale(detection.landmarks, size);
  if (!plan.ok || !estimate) return { quality, result: null, preview: null };

  const image = renderPlan(source, plan);
  // Landmarks were measured in source px; YouCam sees the resampled frame.
  const scale = rescaleEstimate(estimate, plan.scale);
  const result: CaptureResult = {
    image,
    engine: plan.engine,
    upscaled: plan.upscaled,
    upscale: plan.scale,
    scale,
    quality,
    size: plan.target,
  };
  return { quality, result: quality.usable ? result : null, preview: image };
}
