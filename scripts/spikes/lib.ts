// Shared helpers for spike analysis scripts (no network, no paid calls).
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

export const ROOT = path.resolve(__dirname, "../..");
export const DATA = path.join(ROOT, "internal/research/spike-data");
export const p = (...s: string[]) => path.join(DATA, ...s);

export type Img = { w: number; h: number; ch: number; data: Uint8Array };

export async function load(file: string, ensureAlpha = false): Promise<Img> {
  let s = sharp(file);
  if (ensureAlpha) s = s.ensureAlpha();
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, ch: info.channels, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

export function writeJson(name: string, obj: unknown) {
  fs.writeFileSync(p(name), JSON.stringify(obj, null, 2));
}

// sRGB (0-255) -> linear (0-1)
const LUT = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export const lin = (v: number) => LUT[v];
// Rec.709 relative luminance Y from sRGB bytes
export const lumY = (r: number, g: number, b: number) => 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b];

// CIELAB (D65) from sRGB bytes
export function lab(r: number, g: number, b: number): [number, number, number] {
  const R = LUT[r], G = LUT[g], B = LUT[b];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function stats(a: number[]) {
  if (!a.length) return { n: 0 };
  const s = [...a].sort((x, y) => x - y);
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  const sum = s.reduce((x, y) => x + y, 0);
  return { n: s.length, min: s[0], p10: q(0.1), median: q(0.5), mean: +(sum / s.length).toFixed(2), p90: q(0.9), p99: q(0.99), max: s[s.length - 1] };
}

/** Connected components (8-connectivity) of pixels where pred(idx) is true. Returns per-component pixel count, bbox, centroid. */
export function components(w: number, h: number, pred: (i: number) => boolean, conn: 4 | 8 = 8) {
  const label = new Int32Array(w * h);
  const comps: { area: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] || !pred(start)) continue;
    const id = comps.length + 1;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i - x) / w;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (conn === 4 && dx && dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!label[j] && pred(j)) { label[j] = id; stack[sp++] = j; }
        }
    }
    comps.push({ area, x0, y0, x1, y1, cx: sx / area, cy: sy / area });
  }
  return { label, comps };
}
