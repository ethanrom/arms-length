/**
 * Resamples the model's frame to the video stream's size and back up to the screen, so the picture carries only the
 * detail the video does: whatever the stream could not hold stays gone, however large the face is drawn.
 */
export function resampleThroughStream(
  frame: HTMLCanvasElement,
  stream: { w: number; h: number },
  target: HTMLCanvasElement,
  display: { w: number; h: number },
): void {
  let current: HTMLCanvasElement = frame;
  // Halve until within a factor of two of the stream, so shrinking averages pixels instead of skipping them.
  while (stream.h < current.height && current.height > stream.h * 2) {
    current = scaled(current, Math.round(current.width / 2), Math.round(current.height / 2), "high");
  }
  // A stream with more rows than the frame cannot add detail: leave the frame as it is.
  if (stream.h < current.height) current = scaled(current, stream.w, stream.h, "high");

  target.width = display.w;
  target.height = display.h;
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(current, 0, 0, display.w, display.h);
}

function scaled(src: HTMLCanvasElement, w: number, h: number, quality: ImageSmoothingQuality): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, w);
  out.height = Math.max(1, h);
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = quality;
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  return out;
}
