/**
 * Skin concerns we request from YouCam HD Skin Analysis and how each mask is read.
 * Mask anatomy comes from the Phase 0 spike (internal/research/spike.md §4).
 */

export type ConcernId =
  | "acne"
  | "age_spot"
  | "pore"
  | "wrinkle"
  | "dark_circle"
  | "eye_bag"
  | "redness"
  | "texture";

/**
 * - contour: closed outlines with a transparent interior (HD age spots); a component is "alpha != modal alpha".
 * - polyline: thin lines (HD wrinkles, about 3 px).
 * - marker: fixed-size location markers (pores: 7 px dots; acne: 17 px rings). Location only; the
 *   feature's size and contrast must be measured in the photo.
 * - region: graded or filled areas (dark circles, eye bags, redness zones).
 * - roi: a sampling window, not a visible feature (texture).
 */
export type MaskKind = "contour" | "polyline" | "marker" | "region" | "roi";

/** How a concern's features are presented to the detector. */
export type TargetShape = "spot" | "line" | "patch";

export interface ConcernSpec {
  id: ConcernId;
  hdAction: string;
  sdAction: string;
  maskKind: MaskKind;
  shape: TargetShape;
  /** False for concerns that are not visible marks (we report no distance for them). */
  visibility: boolean;
  /** Whether red-green (chromatic) contrast matters for this concern. */
  chromatic: boolean;
}

export const CONCERNS: Record<ConcernId, ConcernSpec> = {
  acne: { id: "acne", hdAction: "hd_acne", sdAction: "acne", maskKind: "marker", shape: "spot", visibility: true, chromatic: true },
  age_spot: { id: "age_spot", hdAction: "hd_age_spot", sdAction: "age_spot", maskKind: "contour", shape: "spot", visibility: true, chromatic: false },
  pore: { id: "pore", hdAction: "hd_pore", sdAction: "pore", maskKind: "marker", shape: "spot", visibility: true, chromatic: false },
  wrinkle: { id: "wrinkle", hdAction: "hd_wrinkle", sdAction: "wrinkle", maskKind: "polyline", shape: "line", visibility: true, chromatic: false },
  dark_circle: { id: "dark_circle", hdAction: "hd_dark_circle", sdAction: "dark_circle_v2", maskKind: "region", shape: "patch", visibility: true, chromatic: false },
  eye_bag: { id: "eye_bag", hdAction: "hd_eye_bag", sdAction: "eye_bag", maskKind: "region", shape: "patch", visibility: true, chromatic: false },
  redness: { id: "redness", hdAction: "hd_redness", sdAction: "redness", maskKind: "region", shape: "patch", visibility: true, chromatic: true },
  texture: { id: "texture", hdAction: "hd_texture", sdAction: "texture", maskKind: "roi", shape: "patch", visibility: false, chromatic: false },
};

/** The dst_actions we send (8 HD concerns = the 16-unit tier). */
export const HD_ACTIONS = Object.values(CONCERNS).map((c) => c.hdAction);
export const SD_ACTIONS = Object.values(CONCERNS).map((c) => c.sdAction);

export function concernFromAction(action: string): ConcernId | null {
  for (const c of Object.values(CONCERNS)) if (c.hdAction === action || c.sdAction === action) return c.id;
  return null;
}
