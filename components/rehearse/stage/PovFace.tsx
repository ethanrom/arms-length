"use client";

/**
 * Draws the model's their-view frame of your photo at true size into the stage: at its angular size at the viewer's
 * distance in person, inside the call tile at the stream's resolution on a video call, and the plain photo filling the
 * stage for the held mirror. Decorative: the Stage labels the picture.
 */
import { useEffect, useRef } from "react";
import { FacePicture } from "./face/FacePicture";
import { frameBase } from "./face/frames";
import { preloadImage } from "./face/preload";
import { useReducedMotion } from "./face/useReducedMotion";
import { useStageSize, type StageSize } from "./face/useStageSize";
import { useTheirView } from "./face/useTheirView";
import {
  callPhotoRect,
  callView,
  featherMask,
  inPersonRect,
  maxSideFor,
  mirrorRect,
  photoHeightMm,
  MAX_SIDE_CAP,
} from "./pov";
import type { CallGeometry } from "@/lib/contracts/rehearse";
import type { PovFaceProps, StageRect } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${v * 100}%`;

/** Blur of the placeholder, in CSS pixels: heavy, in proportion to the face as drawn. */
const placeholderBlur = (size: StageSize | null, rect: StageRect) => (size ? clamp(rect.h * size.h * 0.05, 3, 18) : 8);

export function PovFace(props: PovFaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const size = useStageSize(rootRef);
  const reduced = useReducedMotion();
  const { photo, mirror, layout, call } = props;

  // Decode the photo ahead, so flipping to the mirror shows it at once.
  useEffect(() => preloadImage(photo.src), [photo.src]);

  return (
    <div ref={rootRef} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {mirror ? <MirrorFace {...props} /> : call && layout.tile ? <CallFace {...props} call={call} tile={layout.tile} size={size} reduced={reduced} /> : <InPersonFace {...props} size={size} reduced={reduced} />}
    </div>
  );
}

type Sized = PovFaceProps & { size: StageSize | null; reduced: boolean };

function InPersonFace({ photo, observe, layout, priority = "now", size, reduced }: Sized) {
  const rect = inPersonRect(photo.frame, photoHeightMm(photo.frame, photo.scale), observe.distanceM, layout.face);
  const maxSide = size ? maxSideFor(Math.max(rect.w * size.w, rect.h * size.h), size.dpr) : MAX_SIDE_CAP;
  const view = useTheirView({
    src: photo.src,
    scale: photo.scale,
    distanceM: observe.distanceM,
    luminanceCdM2: observe.luminanceCdM2,
    acuityScale: observe.acuityScale,
    maxSide,
    priority,
    enabled: size !== null,
  });

  return (
    <>
      <FacePicture
        key={frameBase(photo.src, observe.distanceM, observe.luminanceCdM2, observe.acuityScale)}
        src={photo.src}
        frame={view.frame}
        fresh={view.fresh}
        box={{ left: rect.x * 100, top: rect.y * 100, width: rect.w * 100, height: rect.h * 100 }}
        mask={featherMask(rect)}
        blurPx={placeholderBlur(size, rect)}
        reduced={reduced}
      />
      {view.renderer}
    </>
  );
}

function CallFace({ photo, observe, call, tile, priority = "now", size, reduced }: Sized & { call: CallGeometry; tile: StageRect }) {
  const view = callView(photoHeightMm(photo.frame, photo.scale), call);
  const rect = callPhotoRect(photo.frame, view, tile, photo.focus);
  const maxSide = size ? maxSideFor(Math.max(rect.w * size.w, rect.h * size.h), size.dpr) : MAX_SIDE_CAP;
  const theirs = useTheirView({
    src: photo.src,
    scale: photo.scale,
    distanceM: observe.distanceM,
    luminanceCdM2: observe.luminanceCdM2,
    acuityScale: observe.acuityScale,
    maxSide,
    priority,
    enabled: size !== null,
  });

  return (
    <div style={{ position: "absolute", left: pct(tile.x), top: pct(tile.y), width: pct(tile.w), height: pct(tile.h), overflow: "hidden" }}>
      <FacePicture
        key={frameBase(photo.src, observe.distanceM, observe.luminanceCdM2, observe.acuityScale)}
        src={photo.src}
        frame={theirs.frame}
        fresh={theirs.fresh}
        box={{
          left: ((rect.x - tile.x) / tile.w) * 100,
          top: ((rect.y - tile.y) / tile.h) * 100,
          width: (rect.w / tile.w) * 100,
          height: (rect.h / tile.h) * 100,
        }}
        mask={featherMask(rect, tile)}
        blurPx={placeholderBlur(size, rect)}
        reduced={reduced}
        stream={{ rows: view.streamRows, display: size ? { w: rect.w * size.w * size.dpr, h: rect.h * size.h * size.dpr } : null }}
      />
      {theirs.renderer}
    </div>
  );
}

function MirrorFace({ photo }: PovFaceProps) {
  const rect = mirrorRect(photo.frame, photo.focus);
  const mask = featherMask(rect);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ position: "absolute", left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h), maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}
