/**
 * Plan the one frame that goes to YouCam: a crop around the face, resampled to the sizes the APIs accept.
 * Limits (docs.perfectcorp.com, see internal/research/RESEARCH.md section 1):
 * - Skin Analysis: face width over 60% of image width; HD short side >= 1080, SD short side >= 480.
 * - Makeup VTO: long side under 1920. Using the same frame for analysis and makeup keeps masks and renders aligned.
 * Pure: the caller draws the crop.
 */
import type { Box, Size2 } from "@/lib/contracts";

export const TARGET_FACE_FRACTION = 0.7;
/** YouCam needs more than this fraction; below it we warn even though planning aims for 0.7. */
export const MIN_FACE_FRACTION = 0.6;
export const HD_MIN_SHORT = 1080;
export const SD_MIN_SHORT = 480;
export const MAX_LONG = 1919;
/** Largest enlargement when only reaching SD's minimum (a tiny source). */
export const MAX_UPSCALE = 1.25;
/**
 * Largest enlargement that still takes the HD engine (integration, 2026-10-21): a webcam frame cannot reach a 1080 px
 * short side otherwise. The plan says so (`upscaled`) and the app tells the user the finest detail is less certain.
 */
export const HD_MAX_UPSCALE = 2;
/** Output frame is portrait 4:5 (height / width) where the source allows: the face mesh is about 1.3x taller than wide. */
const FRAME_ASPECT = 1.25;
/** Keep at least this much of the frame's height around the face (forehead and chin margin). */
const FACE_HEIGHT_MARGIN = 1.08;
/** The face never takes more than this share of the frame width, even when the photo is tight. */
const FACE_WIDTH_MARGIN = 0.97;

export interface ResizePlan {
  /** Crop rectangle in source pixels (integers, inside the source). */
  crop: Box;
  /** Output size in pixels. */
  target: Size2;
  /** Output px per source px, measured along x. Multiply source-pixel measurements by this. */
  scale: number;
  engine: "hd" | "sd";
  /** False when even SD cannot be reached within the upscale limit. */
  ok: boolean;
  /** True when the output is an enlargement of the source pixels (only HD can be: SD never enlarges past reaching 480 px). */
  upscaled: boolean;
  /** Face width as a fraction of the output width. */
  faceFraction: number;
  reason?: "invalid_input" | "source_too_small";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function invalid(srcW: number, srcH: number): ResizePlan {
  const w = Math.max(0, Math.round(srcW));
  const h = Math.max(0, Math.round(srcH));
  return {
    crop: { x: 0, y: 0, w, h },
    target: { width: w, height: h },
    scale: 1,
    engine: "sd",
    ok: false,
    upscaled: false,
    faceFraction: 0,
    reason: "invalid_input",
  };
}

/**
 * @param faceBox face extent in source px (the landmark mesh bounds: hairline to chin, cheek to cheek)
 */
export function planResize(srcW: number, srcH: number, faceBox: Box): ResizePlan {
  const finite = [srcW, srcH, faceBox.x, faceBox.y, faceBox.w, faceBox.h].every(Number.isFinite);
  if (!finite || srcW <= 0 || srcH <= 0 || faceBox.w <= 0 || faceBox.h <= 0) {
    return invalid(srcW, srcH);
  }

  // Crop around the face so it fills about TARGET_FACE_FRACTION of the width.
  let cw = faceBox.w / TARGET_FACE_FRACTION;
  let ch = Math.max(cw * FRAME_ASPECT, faceBox.h * FACE_HEIGHT_MARGIN);
  // Cannot crop beyond the photo: shrink uniformly (the face only gets larger in frame), then give back any
  // margin around the face that the shrink took, as far as the photo allows.
  const fit = Math.min(1, srcW / cw, srcH / ch);
  cw = Math.min(srcW, Math.max(cw * fit, faceBox.w / FACE_WIDTH_MARGIN));
  ch = Math.min(srcH, Math.max(ch * fit, faceBox.h * FACE_HEIGHT_MARGIN));
  // Keep the frame within the long-side limit at a 1080 short side by trimming the long axis, never the face.
  const maxRatio = MAX_LONG / HD_MIN_SHORT;
  if (cw > ch * maxRatio) cw = Math.max(ch * maxRatio, faceBox.w / FACE_WIDTH_MARGIN);
  else if (ch > cw * maxRatio) ch = Math.max(cw * maxRatio, faceBox.h * FACE_HEIGHT_MARGIN);
  cw = Math.min(cw, srcW);
  ch = Math.min(ch, srcH);

  const cx = faceBox.x + faceBox.w / 2;
  const cy = faceBox.y + faceBox.h / 2;
  const w = Math.round(cw);
  const h = Math.round(ch);
  const crop: Box = {
    x: Math.round(clamp(cx - cw / 2, 0, srcW - w)),
    y: Math.round(clamp(cy - ch / 2, 0, srcH - h)),
    w,
    h,
  };

  const short = Math.min(crop.w, crop.h);
  const long = Math.max(crop.w, crop.h);
  const capScale = MAX_LONG / long;
  const hdScale = HD_MIN_SHORT / short;

  let engine: "hd" | "sd";
  let scale: number;
  if (hdScale <= Math.min(HD_MAX_UPSCALE, capScale)) {
    engine = "hd";
    scale = hdScale;
  } else {
    // HD is out of reach. SD never needs more pixels than the crop has, so only upscale to reach its minimum.
    engine = "sd";
    scale = short >= SD_MIN_SHORT ? Math.min(1, capScale) : Math.min(MAX_UPSCALE, SD_MIN_SHORT / short);
  }

  // Force the short side to an exact integer so HD is exactly 1080.
  const outShort = engine === "hd" ? HD_MIN_SHORT : Math.round(short * scale);
  const outLong = Math.round(long * scale);
  const target: Size2 =
    crop.w <= crop.h ? { width: outShort, height: outLong } : { width: outLong, height: outShort };
  const ok = Math.min(target.width, target.height) >= SD_MIN_SHORT && outLong <= MAX_LONG;
  const outScale = target.width / crop.w;

  return {
    crop,
    target,
    scale: outScale,
    engine,
    ok,
    upscaled: ok && outScale > 1 + 1e-9,
    faceFraction: (faceBox.w * outScale) / target.width,
    ...(ok ? {} : { reason: "source_too_small" as const }),
  };
}
