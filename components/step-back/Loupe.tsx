"use client";

import { useEffect, useRef, useState } from "react";
import type { Box, RgbaImage } from "@/lib/contracts";
import { loadPhoto } from "./photo";

const BACKING_WIDTH = 640;

/** Crops are cached per rendered frame, so dragging the slider only draws small canvases. */
const cropCache = new WeakMap<RgbaImage, Map<string, HTMLCanvasElement>>();

function cropOf(image: RgbaImage, frame: { width: number; height: number }, patch: Box): HTMLCanvasElement {
  const k = image.width / frame.width;
  const sx = Math.max(0, Math.round(patch.x * k));
  const sy = Math.max(0, Math.round(patch.y * k));
  const sw = Math.max(1, Math.min(image.width - sx, Math.round(patch.w * k)));
  const sh = Math.max(1, Math.min(image.height - sy, Math.round(patch.h * k)));
  const key = `${sx},${sy},${sw},${sh}`;
  let byKey = cropCache.get(image);
  if (!byKey) cropCache.set(image, (byKey = new Map()));
  let canvas = byKey.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const data = new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height);
    // Only the dirty rectangle is painted, and it lands at the canvas origin.
    canvas.getContext("2d")?.putImageData(data, -sx, -sy, sx, sy, sw, sh);
    byKey.set(key, canvas);
  }
  return canvas;
}

interface LoupeProps {
  src: string;
  frame: { width: number; height: number };
  /** The patch of the photo to magnify, in frame px. */
  patch: Box;
  /** The stop renders from the Step back hero (the real renderer), and how opaque each one is at this distance. */
  frames: (RgbaImage | null)[];
  opacities: number[];
  className?: string;
}

/**
 * A magnified crop of the busiest patch of cheek and nose, drawn from the very renders the hero shows, so the same model
 * decides what fades. The pores are small enough that at hero size their fading is hard to see; here it is not.
 */
export function Loupe({ src, frame, patch, frames, opacities, className }: LoupeProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState<RgbaImage | null>(null);

  useEffect(() => {
    let live = true;
    loadPhoto(src, 1200)
      .then(({ image }) => live && setBase(image))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [src]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const width = BACKING_WIDTH;
    const height = Math.round((BACKING_WIDTH * patch.h) / patch.w);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    if (base) ctx.drawImage(cropOf(base, frame, patch), 0, 0, width, height);
    frames.forEach((image, i) => {
      const o = opacities[i] ?? 0;
      if (!image || o <= 0) return;
      ctx.globalAlpha = o;
      ctx.drawImage(cropOf(image, frame, patch), 0, 0, width, height);
    });
    ctx.globalAlpha = 1;
  }, [base, frames, opacities, patch, frame]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={{ aspectRatio: `${patch.w} / ${patch.h}` }} />;
}
