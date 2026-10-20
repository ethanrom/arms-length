import { describe, expect, it } from "vitest";
import type { RgbaImage, ScaleEstimate } from "../contracts/measure";
import { DEFAULT_VIEWING } from "../contracts/vision";
import { prepareDistanceView, renderDistanceView } from "./renderer";

const scale: ScaleEstimate = { mmPerPx: 0.3, relSd: 0.04, source: "iris" };

/** Skin-coloured image with a gradient, a large soft dark patch, two small dark spots and +/-3 codes of noise. */
function synth(w: number, h: number, noise = 6, mmScale = 1): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = 205 - 20 * (y / h);
      let g = 155 - 15 * (y / h);
      let b = 135 - 12 * (y / h);
      const spot = (cx: number, cy: number, rad: number, k: number) => {
        const m = Math.exp((-2 * ((x - cx) ** 2 + (y - cy) ** 2)) / (rad * rad)) * k;
        r -= m * r;
        g -= m * g;
        b -= m * b;
      };
      spot(w * 0.3, h * 0.4, w * 0.12 * mmScale, 0.35);
      spot(w * 0.7, h * 0.6, w * 0.02 * mmScale, 0.4);
      spot(w * 0.5, h * 0.3, w * 0.005 * mmScale, 0.5);
      const n = (rnd() - 0.5) * noise;
      data[i] = r + n;
      data[i + 1] = g + n;
      data[i + 2] = b + n;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function diff(a: RgbaImage, b: RgbaImage) {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i + c] - b.data[i + c]);
      sum += d;
      max = Math.max(max, d);
    }
  }
  return { mean: sum / ((a.data.length / 4) * 3), max };
}

describe("distance renderer", () => {
  it("returns an image of the same size, keeps alpha and is deterministic", () => {
    const img = synth(128, 96);
    const a = renderDistanceView(img, scale, DEFAULT_VIEWING, 1);
    const b = renderDistanceView(img, scale, DEFAULT_VIEWING, 1);
    expect([a.width, a.height, a.data.length]).toEqual([128, 96, 128 * 96 * 4]);
    expect(a.data.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("is close to the identity at 10 cm, also for a photo above the 512 px working size", () => {
    for (const img of [synth(128, 96, 0), synth(700, 520, 0)]) {
      const out = renderDistanceView(img, { ...scale, mmPerPx: img.width > 512 ? 0.1 : 0.3 }, DEFAULT_VIEWING, 0.1);
      expect([out.width, out.height]).toEqual([img.width, img.height]);
      const d = diff(img, out);
      expect(d.mean).toBeLessThan(0.7);
      expect(d.max).toBeLessThanOrEqual(5);
    }
  });

  it("drops noise below threshold: +/-3 codes of pixel noise is removed from a far view", () => {
    const clean = synth(128, 96, 0);
    const noisy = synth(128, 96, 6);
    const far = renderDistanceView(noisy, scale, DEFAULT_VIEWING, 1);
    expect(diff(clean, far).mean).toBeLessThan(diff(clean, noisy).mean);
  });

  it("removes fine detail with distance and keeps the large soft patch", () => {
    const img = synth(256, 256);
    const render = prepareDistanceView(img);
    const px = (im: RgbaImage, x: number, y: number) => im.data[(y * im.width + x) * 4 + 1];
    const near = render(scale, DEFAULT_VIEWING, 0.25);
    const far = render(scale, DEFAULT_VIEWING, 5);
    // the small spot (sd about 2.5 px) is dark in the original and in the near view, gone at 5 m
    const x = Math.round(256 * 0.5);
    const y = Math.round(256 * 0.3);
    const around = px(img, x + 25, y);
    expect(around - px(img, x, y)).toBeGreaterThan(30);
    expect(around - px(near, x, y)).toBeGreaterThan(25);
    expect(Math.abs(px(far, x, y) - px(far, x + 25, y))).toBeLessThan(8);
    // the large patch (radius about 30 px, 9 mm) is still there at 2 m, where the picture spans 1.4 deg
    const mid = render(scale, DEFAULT_VIEWING, 2);
    const cx = Math.round(256 * 0.3);
    const cy = Math.round(256 * 0.4);
    expect(px(mid, cx + 60, cy) - px(mid, cx, cy)).toBeGreaterThan(25);
    // acuity 20/40 sees less than 20/20 at the same distance
    const blurry = render(scale, { ...DEFAULT_VIEWING, acuityScale: 2 }, 1);
    const sharp = render(scale, DEFAULT_VIEWING, 1);
    expect(diff(img, blurry).mean).toBeGreaterThanOrEqual(diff(img, sharp).mean);
  });

  it("renders a 512 px photo in well under a second on a cold start", () => {
    const img = synth(512, 512);
    const t0 = performance.now();
    renderDistanceView(img, scale, DEFAULT_VIEWING, 1);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
