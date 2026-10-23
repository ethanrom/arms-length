import type { RgbaImage } from "@/lib/contracts";
import { LruCache } from "./lru";

/** The model's their-view render of the photo, ready to draw. */
export interface TheirFrame {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** About 12 frames at the largest size: moving between moments and back stays instant without holding the whole day. */
const BUDGET_BYTES = 72e6;
export const frameStore = new LruCache<TheirFrame>(BUDGET_BYTES, (f) => f.width * f.height * 4);

/** What the render depends on besides its size. Distances compare to the millimetre. */
export function frameBase(src: string, distanceM: number, luminanceCdM2: number, acuityScale: number): string {
  return [src, distanceM.toFixed(3), luminanceCdM2.toFixed(2), acuityScale.toFixed(2)].join("|");
}

/** The cache key: (src, distance, luminance, acuity, maxSide). */
export function frameKey(src: string, distanceM: number, luminanceCdM2: number, acuityScale: number, maxSide: number): string {
  return `${frameBase(src, distanceM, luminanceCdM2, acuityScale)}|${maxSide}`;
}

export function toCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")?.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  return canvas;
}

/** Counters for the render cost and the cache (read in dev tools as `window.__povStats`). */
export const povStats = { hits: 0, misses: 0, renders: [] as { key: string; ms: number; at: number }[] };

if (typeof window !== "undefined") (window as unknown as { __povStats: typeof povStats }).__povStats = povStats;
