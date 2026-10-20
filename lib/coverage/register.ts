/**
 * Register a makeup or simulation render to the analysed photo. The service's output offset is not constant: measured
 * on the recorded renders it is (0, +1) with a black first row for p2b, (-3, 0) with a black last row and column for
 * p3a (a 1078x1576 output for a 1080x1575 input), and (0, 0) for p1a, so the offset is found per render
 * (fixtures/youcam/<persona>/renders/offsets.json, spike.md section 3).
 *
 * Convention (RenderResult.offset): render(x + dx, y + dy) = input(x, y).
 * Method: normalised cross-correlation of blurred luminance over the most textured blocks of the input, for every
 * integer shift within +-MAX_SHIFT_PX (the same estimator as scripts/spikes/register.ts, integer only). NCC ignores
 * the gain and offset that smoothing or tone changes add, and a pure translation is all the service applies.
 */
import type { Box, RgbaImage } from "../contracts";
import { isFrameSized, resampleImage } from "../skin/remeasure";

export const MAX_SHIFT_PX = 6;
/** Block size and the least blocks needed. Heuristic: big enough to hold facial texture, small enough to have 20+ of them. */
const BLOCK_PX = 64;
const MIN_BLOCKS = 4;
const MAX_BLOCKS = 40;
/** Blocks flatter than this (std of luminance, 0..255, after blurring) carry no registration signal. Heuristic. */
const MIN_BLOCK_SD = 6;
/** Samples every STEP px inside a block: integer shifts do not need every pixel. */
const STEP = 2;
const BLUR_RADIUS_PX = 2;
/** At most this many padding lines are black borders; more is the picture. */
const MAX_BORDER_PX = 4;
/** A registration below this mean NCC is not trusted. The recorded renders score 0.87 to 0.99 at their best patch. */
export const MIN_TRUSTED_NCC = 0.6;

export interface Registration {
  dx: number;
  dy: number;
  /** Frame region (input coordinates) that has real render pixels at this shift: inside the render, and not black padding. */
  valid: Box;
  /** Mean NCC of the textured blocks at the chosen shift; 0 when there was not enough texture to register. */
  ncc: number;
}

function luminance(image: RgbaImage): Float32Array {
  const { width, height, data } = image;
  const n = width * height;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  return lum;
}

/** Separable box blur with edge clamping. */
function blur(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += src[y * width + Math.min(width - 1, Math.max(0, x + d))];
      tmp[y * width + x] = s / k;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[Math.min(height - 1, Math.max(0, y + d)) * width + x];
      out[y * width + x] = s / k;
    }
  }
  return out;
}

/** Black padding lines on each edge of a render (the service pads its output to an even size with black). */
function blackEdges(image: RgbaImage): { top: number; bottom: number; left: number; right: number } {
  const { width, height, data } = image;
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i] <= 2 && data[i + 1] <= 2 && data[i + 2] <= 2;
  };
  const row = (y: number) => {
    for (let x = 0; x < width; x++) if (!dark(x, y)) return false;
    return true;
  };
  const col = (x: number) => {
    for (let y = 0; y < height; y++) if (!dark(x, y)) return false;
    return true;
  };
  const run = (test: (i: number) => boolean, from: number, step: number) => {
    let k = 0;
    while (k < MAX_BORDER_PX && test(from + step * k)) k++;
    return k;
  };
  return { top: run(row, 0, 1), bottom: run(row, height - 1, -1), left: run(col, 0, 1), right: run(col, width - 1, -1) };
}

/** The frame region whose pixels exist in `render` (and are not black padding) when render(x + dx, y + dy) = input(x, y). */
export function validRegion(frame: { width: number; height: number }, render: RgbaImage, dx: number, dy: number): Box {
  const edge = blackEdges(render);
  const x0 = Math.max(0, edge.left - dx);
  const x1 = Math.min(frame.width, render.width - edge.right - dx);
  const y0 = Math.max(0, edge.top - dy);
  const y1 = Math.min(frame.height, render.height - edge.bottom - dy);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

interface Block {
  x: number;
  y: number;
  /** Zero-mean samples of the input block, and their energy. */
  samples: Float32Array;
  energy: number;
}

function textured(lum: Float32Array, width: number, size: { width: number; height: number }): Block[] {
  const margin = MAX_SHIFT_PX + MAX_BORDER_PX;
  const blocks: (Block & { sd: number })[] = [];
  for (let y = margin; y + BLOCK_PX <= size.height - margin; y += BLOCK_PX) {
    for (let x = margin; x + BLOCK_PX <= size.width - margin; x += BLOCK_PX) {
      const samples = new Float32Array(Math.ceil(BLOCK_PX / STEP) ** 2);
      let n = 0;
      let sum = 0;
      for (let by = 0; by < BLOCK_PX; by += STEP) {
        for (let bx = 0; bx < BLOCK_PX; bx += STEP) {
          const v = lum[(y + by) * width + x + bx];
          samples[n++] = v;
          sum += v;
        }
      }
      const mean = sum / n;
      let energy = 0;
      for (let i = 0; i < n; i++) {
        samples[i] -= mean;
        energy += samples[i] * samples[i];
      }
      blocks.push({ x, y, samples, energy, sd: Math.sqrt(energy / n) });
    }
  }
  return blocks
    .filter((b) => b.sd >= MIN_BLOCK_SD)
    .sort((a, b) => b.sd - a.sd)
    .slice(0, MAX_BLOCKS);
}

/** Mean NCC over the blocks when the render is read at (x + dx, y + dy). */
function meanNcc(blocks: Block[], out: Float32Array, outWidth: number, dx: number, dy: number): number {
  let total = 0;
  for (const b of blocks) {
    let sum = 0;
    let sumSq = 0;
    let cross = 0;
    let n = 0;
    let i = 0;
    for (let by = 0; by < BLOCK_PX; by += STEP) {
      const base = (b.y + by + dy) * outWidth + b.x + dx;
      for (let bx = 0; bx < BLOCK_PX; bx += STEP) {
        const v = out[base + bx];
        sum += v;
        sumSq += v * v;
        cross += v * b.samples[i++];
        n++;
      }
    }
    const energy = sumSq - (sum * sum) / n;
    // The input block is zero-mean, so cross is already the covariance.
    total += energy > 1e-6 && b.energy > 1e-6 ? cross / Math.sqrt(energy * b.energy) : 0;
  }
  return total / blocks.length;
}

export function registerRender(input: RgbaImage, render: RgbaImage): Registration {
  const frame = { width: input.width, height: input.height };
  const same = isFrameSized(render, frame);
  // A rescaled render is brought to the frame first; the shift found is then relative to the resampled image.
  const aligned = same ? render : resampleImage(render, frame.width, frame.height);

  const blocks = textured(blur(luminance(input), input.width, input.height, BLUR_RADIUS_PX), input.width, {
    width: Math.min(input.width, aligned.width),
    height: Math.min(input.height, aligned.height),
  });
  if (blocks.length < MIN_BLOCKS) return { dx: 0, dy: 0, valid: validRegion(frame, aligned, 0, 0), ncc: 0 };

  const out = blur(luminance(aligned), aligned.width, aligned.height, BLUR_RADIUS_PX);
  let best = { dx: 0, dy: 0, ncc: -Infinity };
  for (let dy = -MAX_SHIFT_PX; dy <= MAX_SHIFT_PX; dy++) {
    for (let dx = -MAX_SHIFT_PX; dx <= MAX_SHIFT_PX; dx++) {
      const ncc = meanNcc(blocks, out, aligned.width, dx, dy);
      if (ncc > best.ncc + 1e-9) best = { dx, dy, ncc };
    }
  }
  return { dx: best.dx, dy: best.dy, valid: validRegion(frame, aligned, best.dx, best.dy), ncc: best.ncc };
}
