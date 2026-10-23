"use client";

/**
 * STUB (owned by the true-size face agent): draws the model's their-view frame at true size into the stage, inside the
 * call tile for video calls, at the stream's resolution; the mirror view when held. Replace the body, keep the props.
 */
import { inPersonHeightFraction, photoHeightMm } from "./pov";
import type { PovFaceProps } from "./types";

export function PovFace({ photo, observe, layout, mirror }: PovFaceProps) {
  const h = mirror ? 1.4 : inPersonHeightFraction(photoHeightMm(photo.frame, photo.scale), observe.distanceM);
  const w = (h * photo.frame.width) / photo.frame.height / 1.6;
  const box = layout.tile ?? { x: layout.face.cx - w / 2, y: layout.face.cy - h / 2, w, h };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.src}
      alt=""
      className="absolute object-contain"
      style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
    />
  );
}
