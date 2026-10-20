// Foundation shade from the photo: the trimmed mean colour of skin beside the cheek marks.
import type { Measurements, RgbaImage } from "../contracts";

/** Skin sampled within this distance of a mark's centre. Heuristic: a few mm, near enough to share the local tone. */
const SAMPLE_RADIUS_MM = 3;
/** Share of samples dropped from each tail, per channel: hair, shadow and the odd specular spot. Heuristic. */
const TRIM = 0.2;
const MIN_SAMPLES = 200;
/** Marks sampled at most, spread evenly, to keep the cost flat. */
const MAX_MARKS = 200;

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

function trimmedMean(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const lo = Math.floor(s.length * TRIM);
  const kept = s.slice(lo, s.length - lo);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/**
 * Marks on the cheek first (the pore masks label them); any mark when none is labelled; the middle of the frame as a
 * last resort. Pixels inside any mark's box are skipped, so the shade is the skin beside the marks. Returns "#rrggbb".
 * The mean is over sRGB code values: for skin tones this is within a code value of averaging in linear light.
 */
export function skinShade(photo: RgbaImage, base: Measurements): string {
  const { width, height, data } = photo;
  const cheek = base.features.filter((f) => f.region === "cheek");
  const pool = cheek.length ? cheek : base.features;
  const step = Math.max(1, Math.ceil(pool.length / MAX_MARKS));
  const marks = pool.filter((_, i) => i % step === 0);

  const blocked = new Uint8Array(width * height);
  for (const f of base.features) {
    for (let y = Math.max(0, f.bbox.y - 1); y < Math.min(height, f.bbox.y + f.bbox.h + 1); y++) {
      for (let x = Math.max(0, f.bbox.x - 1); x < Math.min(width, f.bbox.x + f.bbox.w + 1); x++) blocked[y * width + x] = 1;
    }
  }
  const r = Math.max(4, Math.round(SAMPLE_RADIUS_MM / base.scale.mmPerPx));
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const take = (x: number, y: number) => {
    const i = y * width + x;
    if (blocked[i]) return;
    blocked[i] = 1; // overlapping windows count a pixel once
    reds.push(data[i * 4]);
    greens.push(data[i * 4 + 1]);
    blues.push(data[i * 4 + 2]);
  };
  for (const f of marks) {
    const cx = Math.round(f.centroid.x);
    const cy = Math.round(f.centroid.y);
    for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x++) take(x, y);
    }
  }
  if (reds.length < MIN_SAMPLES) {
    reds.length = greens.length = blues.length = 0;
    for (let y = Math.floor(height / 3); y < Math.ceil((2 * height) / 3); y++) {
      for (let x = Math.floor(width / 3); x < Math.ceil((2 * width) / 3); x++) {
        reds.push(data[(y * width + x) * 4]);
        greens.push(data[(y * width + x) * 4 + 1]);
        blues.push(data[(y * width + x) * 4 + 2]);
      }
    }
  }
  return `#${hex(trimmedMean(reds))}${hex(trimmedMean(greens))}${hex(trimmedMean(blues))}`;
}
