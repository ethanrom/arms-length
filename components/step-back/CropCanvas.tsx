"use client";

import { useEffect, useRef, useState } from "react";
import type { Box, RgbaImage } from "@/lib/contracts";
import { cropOf } from "./cropImage";
import { loadPhoto } from "./photo";

/** A decoded photo (or any same-origin image) at its natural size, or null while it loads or if it cannot. */
export function usePhotoImage(src: string | null, maxSide = 1800): RgbaImage | null {
  const [state, setState] = useState<{ src: string | null; image: RgbaImage | null }>({ src: null, image: null });
  useEffect(() => {
    if (!src) return;
    let live = true;
    loadPhoto(src, maxSide)
      .then(({ image }) => live && setState({ src, image }))
      .catch(() => live && setState({ src, image: null }));
    return () => {
      live = false;
    };
  }, [src, maxSide]);
  return state.src === src ? state.image : null;
}

interface CropCanvasProps {
  image: RgbaImage | null;
  frame: { width: number; height: number };
  /** The part of the frame to show, in frame px. */
  crop: Box;
  /** Burned into the top-left corner of the pixels themselves, so a screenshot or a crop of the page keeps it. */
  label?: string;
  /** What the crop shows, for assistive tech. */
  ariaLabel: string;
  className?: string;
}

/**
 * A local crop of a picture, drawn on a canvas. A label ("Simulation", "Virtual try-on") is painted into the corner of the
 * canvas at a readable size, not laid over it as markup, so it travels with the image.
 */
export function CropCanvas({ image, frame, crop, label, ariaLabel, className }: CropCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr);
    const h = Math.round((w * crop.h) / crop.w);
    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cropOf(image, frame, crop), 0, 0, w, h);
    if (label) {
      const px = 14 * dpr;
      const pad = 7 * dpr;
      ctx.font = `500 ${px}px ${getComputedStyle(canvas).fontFamily || "system-ui, sans-serif"}`;
      ctx.textBaseline = "middle";
      const box = ctx.measureText(label).width + pad * 2;
      ctx.fillStyle = "rgba(245, 243, 239, 0.94)";
      ctx.fillRect(0, 0, box, px + pad * 2);
      ctx.fillStyle = "#161513";
      ctx.fillText(label, pad, (px + pad * 2) / 2 + dpr * 0.5);
    }
  }, [image, frame, crop, label, width]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      className={`block w-full bg-stage ${className ?? ""}`}
      style={{ aspectRatio: `${crop.w} / ${crop.h}` }}
    />
  );
}
