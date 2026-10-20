"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { RgbaImage } from "@/lib/contracts";

/** Paints a rendered frame. Sized by CSS, so it scales like an image. */
export function FrameCanvas({
  image,
  className,
  style,
}: {
  image: RgbaImage | null;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx?.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  }, [image]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />;
}
