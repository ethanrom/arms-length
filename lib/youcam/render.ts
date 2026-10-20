// RenderResult assembly and alignment of renders to the analysis frame.
import type { RenderResult, Size2 } from "@/lib/contracts";

export type RenderKind = "makeup" | "simulation";

/** A render within this many px of the input size is the same frame, shifted; anything else was rescaled. */
const SAME_FRAME_TOLERANCE_PX = 2;

/**
 * Offset to apply to a render to align it to the analysis frame: the render's pixel (x, y + dy) is the
 * input's pixel (x, y).
 *
 * - Makeup VTO (spike.md sections 3 and 9): the output is a black first row followed by input rows 0..H-3,
 *   so it is one row shorter and shifted down by 1. Row 0 of the render is invalid (never measure it).
 *   `dy` is 1 whenever the render is the same frame size (within 2 px), also when the frame is unknown.
 * - Skin Simulation: pixel-aligned, the same size as the input.
 * - A render whose size differs by more than 2 px was rescaled (VTO takes long sides up to 1920): no integer
 *   offset applies, so {0, 0} is returned and the caller must scale by width/height.
 */
export function renderOffset(kind: RenderKind, frame: Size2 | null, out: Size2): { dx: number; dy: number } {
  if (frame) {
    const sameFrame =
      Math.abs(frame.width - out.width) <= SAME_FRAME_TOLERANCE_PX &&
      Math.abs(frame.height - out.height) <= SAME_FRAME_TOLERANCE_PX;
    if (!sameFrame) return { dx: 0, dy: 0 };
  }
  return kind === "makeup" ? { dx: 0, dy: 1 } : { dx: 0, dy: 0 };
}

export function buildRender(
  kind: RenderKind,
  image: { dataUrl: string; width: number; height: number },
  frame: Size2 | null,
  unitsCharged: number,
  source: "live" | "replay",
): RenderResult {
  return {
    imageRef: image.dataUrl,
    width: image.width,
    height: image.height,
    offset: renderOffset(kind, frame, image),
    unitsCharged,
    source,
  };
}
