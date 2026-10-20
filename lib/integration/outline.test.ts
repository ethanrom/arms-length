import { describe, expect, it } from "vitest";
import type { Feature, RgbaImage } from "@/lib/contracts";
import { outlineOf, simplifyClosed } from "./outline";

/** A mask like YouCam's contour masks: background alpha 51, foreground pixels transparent (a differing alpha). */
function maskWith(width: number, height: number, draw: (x: number, y: number) => boolean): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = draw(x, y) ? 200 : 51;
  }
  return { width, height, data };
}

const target = (x: number, y: number, w: number, h: number): Feature => ({
  id: "age_spot:0",
  concern: "age_spot",
  shape: "spot",
  region: "whole",
  centroid: { x: x + w / 2, y: y + h / 2 },
  bbox: { x, y, w, h },
  areaPx: w * h,
  diameterMm: 2,
  sizeSource: "mask",
  contrast: { lum: -0.2, rg: 0 },
});

describe("outlineOf", () => {
  it("traces a filled square round its edge", () => {
    const mask = maskWith(60, 60, (x, y) => x >= 20 && x < 30 && y >= 20 && y < 30);
    const poly = outlineOf(target(20, 20, 10, 10), mask);
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(20.5, 0);
    expect(Math.max(...xs)).toBeCloseTo(29.5, 0);
    expect(Math.min(...ys)).toBeCloseTo(20.5, 0);
    expect(Math.max(...ys)).toBeCloseTo(29.5, 0);
    expect(poly.length).toBeGreaterThanOrEqual(4);
  });

  it("goes all the way round a ring whose inside is background-coloured (holes are filled)", () => {
    const mask = maskWith(80, 80, (x, y) => {
      const r = Math.hypot(x - 40, y - 40);
      return r <= 12 && r >= 9;
    });
    const poly = outlineOf(target(28, 28, 25, 25), mask);
    const maxR = Math.max(...poly.map((p) => Math.hypot(p.x - 40, p.y - 40)));
    const minR = Math.min(...poly.map((p) => Math.hypot(p.x - 40, p.y - 40)));
    expect(maxR).toBeGreaterThan(11);
    expect(minR).toBeGreaterThan(9); // outer edge only, not the inner one
  });

  it("covers the whole length of a thin line", () => {
    const mask = maskWith(120, 40, (x, y) => y === 20 && x >= 10 && x <= 100);
    const poly = outlineOf({ ...target(10, 19, 91, 3), concern: "wrinkle", shape: "line" }, mask);
    expect(Math.min(...poly.map((p) => p.x))).toBeLessThan(12);
    expect(Math.max(...poly.map((p) => p.x))).toBeGreaterThan(98);
  });

  it("falls back to the bounding box without a mask", () => {
    expect(outlineOf(target(5, 6, 7, 8), undefined)).toHaveLength(4);
  });
});

describe("simplifyClosed", () => {
  it("keeps at most the requested number of points", () => {
    const circle = Array.from({ length: 400 }, (_, i) => ({ x: 50 + 40 * Math.cos((i / 400) * 6.283), y: 50 + 40 * Math.sin((i / 400) * 6.283) }));
    expect(simplifyClosed(circle, 24).length).toBeLessThanOrEqual(24);
  });
});
