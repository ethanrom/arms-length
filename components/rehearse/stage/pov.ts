/**
 * The maths of "their side": how big your face is in the picture, from the photo's real size and how far away the other
 * person is. Pure and deterministic; positions are fractions of the 16:10 stage (see types.ts).
 *
 * In person, the face is drawn at its true angular size. A photo `h` mm tall seen from `d` m subtends
 *
 *   angle = 2 * atan(h / (2 * d * 1000))
 *
 * and the stage height stands for the middle SCENE_FOV_DEG of the viewer's field, so the photo's share of the stage
 * height is angle / SCENE_FOV_DEG.
 *
 * Video call: the other person sees your whole camera frame on a tile. The frame is `2 * D * tan(vfov / 2)` tall at your
 * face (lib/rehearse/call.ts), so the photo covers photoHeight / frameHeight of the tile; if that is above 1 the camera
 * only sees part of the photo and the face fills the tile. The video carries `rows` pixel rows for that frame, so the
 * photo is `photoHeight / (frameHeight / rows)` rows tall in the stream, which is all the detail the viewer can get.
 */
import type { Box } from "@/lib/contracts";
import type { CallGeometry } from "@/lib/contracts/rehearse";
import { DEVICES, VIEWER_SCREEN, frameHeightMm } from "@/lib/rehearse/call";
import { STAGE_ASPECT, type StageRect } from "./types";

/** The middle of a viewer's field, drawn as the stage height: a project assumption, stated in "How we know". */
export const SCENE_FOV_DEG = 40;

export const SCENE_FOV_ASSUMPTION =
  `Project assumption: the picture's height stands for the middle ${SCENE_FOV_DEG} degrees of the other person's view, ` +
  "top to bottom. Your face is drawn at the size it covers of that view from where they stand, using the photo's measured size.";

export const STREAM_ASSUMPTION =
  "In a video call the face is shrunk to the pixel rows the video carries and then enlarged back to the screen, so detail the video drops stays dropped.";

export const MIRROR_ASSUMPTION =
  "Your mirror is the photo itself, enlarged to fill the picture, with none of the distance model applied: up close the eye picks out nearly every mark.";

/** Share of the stage height a face may take: small enough to stay findable, large enough to crop on a close view. */
export const FRACTION_MIN = 0.04;
export const FRACTION_MAX = 1.6;
/** The held mirror: the photo's height as a share of the stage height (the face fills the stage). */
export const MIRROR_HEIGHT_FRACTION = 1.15;
/**
 * The call tile's height as a share of the stage height when it covers what it covers of the other person's view: a tile
 * of VIEWER_SCREEN.tileHeightM seen from VIEWER_SCREEN.distanceM. Drawn at this height, the face in the tile comes out
 * the size it has in person at the call's equivalent distance. The scene art sizes the tile with it.
 */
export function callTileHeightFraction(layout: CallGeometry["layout"]): number {
  return angularHeightDeg(VIEWER_SCREEN.tileHeightM[layout] * 1000, VIEWER_SCREEN.distanceM) / SCENE_FOV_DEG;
}

/** Where the face sits down the photo when no focus patch is known: slightly above the middle. */
export const FACE_CENTRE_Y = 0.45;
/** The feather is solid out to this share of the photo's half-size, then fades to nothing at the edge. */
export const FEATHER_SOLID = 0.74;

const UNIT_STAGE: StageRect = { x: 0, y: 0, w: 1, h: 1 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const EPS = 1e-6;

/** Physical height of the photo, mm. */
export function photoHeightMm(frame: { height: number }, scale: { mmPerPx: number }): number {
  return frame.height * scale.mmPerPx;
}

/** Visual angle of something `heightMm` tall at `distanceM`, degrees. */
export function angularHeightDeg(heightMm: number, distanceM: number): number {
  return (2 * Math.atan(heightMm / 2 / (distanceM * 1000)) * 180) / Math.PI;
}

/** In person: the photo's display height as a fraction of the stage height at `distanceM` (true angular size). */
export function inPersonHeightFraction(heightMm: number, distanceM: number): number {
  return clamp(angularHeightDeg(heightMm, distanceM) / SCENE_FOV_DEG, FRACTION_MIN, FRACTION_MAX);
}

/** Width as a fraction of the stage width, for a photo whose height is `heightFraction` of the stage height. */
export function widthFraction(heightFraction: number, frame: { width: number; height: number }): number {
  return (heightFraction * frame.width) / frame.height / STAGE_ASPECT;
}

/** In person: the photo's rectangle on the stage, centred at `face`. */
export function inPersonRect(frame: { width: number; height: number }, heightMm: number, distanceM: number, face: { cx: number; cy: number }): StageRect {
  const h = inPersonHeightFraction(heightMm, distanceM);
  const w = widthFraction(h, frame);
  return { x: face.cx - w / 2, y: face.cy - h / 2, w, h };
}

/** Your camera's frame height at your face, mm (lib/rehearse/call.ts, the one source for the geometry). */
export function cameraFrameMm(call: CallGeometry): number {
  return frameHeightMm(call.device, call.cameraDistanceCm);
}

export interface CallView {
  /** The camera frame's height at your face, mm. */
  cameraFrameMm: number;
  /** The photo's height as a share of the tile's height. Above 1 the camera sees only part of the photo. */
  share: number;
  /** The face fills the tile: the photo is larger than the camera frame. */
  cropped: boolean;
  /** How much of your face one pixel of the received video covers, mm. */
  mmPerStreamPx: number;
  /** Pixel rows of the received video that the whole photo spans. */
  streamRows: number;
}

export function callView(heightMm: number, call: CallGeometry): CallView {
  const frameMm = cameraFrameMm(call);
  const rows = DEVICES[call.device].rows[call.layout];
  const mmPerStreamPx = frameMm / rows;
  const share = heightMm / frameMm;
  return { cameraFrameMm: frameMm, share, cropped: share > 1, mmPerStreamPx, streamRows: heightMm / mmPerStreamPx };
}

/** Where the face sits down the photo, 0..1: the middle of the cheek and nose patch if known. */
export function faceCentreY(frame: { height: number }, focus?: Box): number {
  return focus ? clamp((focus.y + focus.h / 2) / frame.height, 0, 1) : FACE_CENTRE_Y;
}

/**
 * Video call: the photo's rectangle on the stage, inside `tile`. Centred in the tile; when it is taller than the tile
 * (the camera sees only part of it) the face is centred instead, as far as the photo still covers the tile.
 */
export function callPhotoRect(
  frame: { width: number; height: number },
  view: CallView,
  tile: StageRect,
  focus?: Box,
): StageRect {
  const h = view.share * tile.h;
  const w = widthFraction(h, frame);
  const x = tile.x + tile.w / 2 - w / 2;
  let y = tile.y + tile.h / 2 - h / 2;
  if (view.cropped) y = clamp(tile.y + tile.h / 2 - faceCentreY(frame, focus) * h, tile.y + tile.h - h, tile.y);
  return { x, y, w, h };
}

/** The held mirror: the photo fills the stage's height, the face (or the focus patch) in the middle, no gaps top or bottom. */
export function mirrorRect(frame: { width: number; height: number }, focus?: Box): StageRect {
  const h = MIRROR_HEIGHT_FRACTION;
  const w = widthFraction(h, frame);
  const y = clamp(0.5 - faceCentreY(frame, focus) * h, 1 - h, 0);
  return { x: 0.5 - w / 2, y, w, h };
}

/**
 * Half-sizes of the feather's ellipse, as percentages of the photo box. The photo's grey surround fades into the scene
 * over the outer quarter. Where the clip (the stage or a call tile) cuts the photo off, the fade moves outside the clip so
 * it never shows inside it.
 */
export function featherRadii(photo: StageRect, clip: StageRect = UNIT_STAGE): { rx: number; ry: number } {
  const axis = (p0: number, p: number, c0: number, c: number) => {
    const centre = p0 + p / 2;
    const cropped = p0 < c0 - EPS || p0 + p > c0 + c + EPS;
    if (!cropped) return 50;
    const visible = Math.max(Math.abs(Math.max(c0, p0) - centre), Math.abs(Math.min(c0 + c, p0 + p) - centre));
    return Math.max(50, (visible / p / FEATHER_SOLID) * 100);
  };
  return { rx: axis(photo.x, photo.w, clip.x, clip.w), ry: axis(photo.y, photo.h, clip.y, clip.h) };
}

/** CSS `mask-image` value for the feather. */
export function featherMask(photo: StageRect, clip: StageRect = UNIT_STAGE): string {
  const { rx, ry } = featherRadii(photo, clip);
  return `radial-gradient(ellipse ${rx.toFixed(2)}% ${ry.toFixed(2)}% at 50% 50%, #000 ${(FEATHER_SOLID * 100).toFixed(0)}%, transparent 100%)`;
}

const MAX_SIDE_STEPS = [320, 480, 640, 800, 1000] as const;
export const MAX_SIDE_CAP = MAX_SIDE_STEPS[MAX_SIDE_STEPS.length - 1];

/**
 * The working size for the model's render: the longer side of what is shown, in device pixels, rounded up to a step so a
 * small resize reuses the cached frame. Capped at 1000 (the model's detail is gone long before that at any distance on
 * the stage).
 */
export function maxSideFor(cssPx: number, devicePixelRatio: number): number {
  const want = cssPx * Math.max(1, devicePixelRatio);
  return MAX_SIDE_STEPS.find((s) => s >= want) ?? MAX_SIDE_CAP;
}

/** The received video's size for the photo: `rows` tall, the photo's aspect wide, at least 2 px so the resample stays valid. */
export function streamSize(rows: number, frame: { width: number; height: number }): { w: number; h: number } {
  const h = Math.max(2, Math.round(rows));
  return { w: Math.max(2, Math.round((h * frame.width) / frame.height)), h };
}
