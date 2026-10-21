import type { Box, RgbaImage } from "@/lib/contracts";

/** Crops are cached per decoded or rendered image, so redrawing while a slider moves only copies small canvases. */
const cropCache = new WeakMap<RgbaImage, Map<string, HTMLCanvasElement>>();

/**
 * The part of `image` that `crop` (frame px) covers, as a canvas at the image's own resolution. The image may be a working
 * size or differ slightly from the frame, so each axis has its own factor.
 */
export function cropOf(image: RgbaImage, frame: { width: number; height: number }, crop: Box): HTMLCanvasElement {
  const kx = image.width / frame.width;
  const ky = image.height / frame.height;
  const sx = Math.max(0, Math.round(crop.x * kx));
  const sy = Math.max(0, Math.round(crop.y * ky));
  const sw = Math.max(1, Math.min(image.width - sx, Math.round(crop.w * kx)));
  const sh = Math.max(1, Math.min(image.height - sy, Math.round(crop.h * ky)));
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
