import type { RgbaImage, ScaleEstimate } from "@/lib/contracts";

export interface LoadedPhoto {
  image: RgbaImage;
  /** Natural width / working width. Multiply mm-per-px by this when rendering at the working size. */
  shrink: number;
}

const cache = new Map<string, Promise<LoadedPhoto>>();

async function decode(src: string, maxSide: number): Promise<LoadedPhoto> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * k);
  const height = Math.round(img.naturalHeight * k);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { image: { width, height, data }, shrink: img.naturalWidth / width };
}

/** Decodes a same-origin photo to RGBA at a working size (cached per src and size). */
export function loadPhoto(src: string, maxSide = 1200): Promise<LoadedPhoto> {
  const key = `${src}@${maxSide}`;
  let p = cache.get(key);
  if (!p) {
    p = decode(src, maxSide);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** The scale estimate for the working-size image. */
export function scaleForWorking(scale: ScaleEstimate, shrink: number): ScaleEstimate {
  return { ...scale, mmPerPx: scale.mmPerPx * shrink };
}
