import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CropViewProps {
  src: string;
  /** A transparent PNG of the same frame (a YouCam mask), drawn over the photo. */
  overlay?: string;
  frame: { width: number; height: number };
  /** The part of the frame to show, in frame px. */
  crop: CropBox;
  stageGrey?: string;
  /** Drawn in frame px (an SVG with the crop as its viewBox), or positioned with `framePct`. */
  children?: ReactNode;
}

/** Percent position of a frame-px point inside the crop, for HTML labels laid over the picture. */
export function framePct(crop: CropBox, x: number, y: number): CSSProperties {
  return { left: `${((x - crop.x) / crop.w) * 100}%`, top: `${((y - crop.y) / crop.h) * 100}%` };
}

/**
 * A crop of a photo at the crop's own aspect, with an optional mask over it. Served unoptimised on purpose: the crop
 * enlarges a 1080 px frame several times, and a resized copy would only blur it.
 */
export function CropView({ src, overlay, frame, crop, stageGrey = "#787878", children }: CropViewProps) {
  const style: CSSProperties = {
    width: `${(frame.width / crop.w) * 100}%`,
    left: `${(-crop.x / crop.w) * 100}%`,
    top: `${(-crop.y / crop.h) * 100}%`,
    height: "auto",
  };
  return (
    <div className="stage relative overflow-hidden" style={{ background: stageGrey, aspectRatio: `${crop.w} / ${crop.h}` }}>
      <Image src={src} alt="" width={frame.width} height={frame.height} unoptimized className="absolute max-w-none" style={style} />
      {overlay && <Image src={overlay} alt="" width={frame.width} height={frame.height} unoptimized className="absolute max-w-none" style={style} />}
      {children}
    </div>
  );
}
