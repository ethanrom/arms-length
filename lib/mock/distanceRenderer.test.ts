import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWING } from "@/lib/contracts";
import type { RgbaImage, ScaleEstimate } from "@/lib/contracts";
import { boxWidthsForGaussian, mockBlurSigmaPx, mockDistanceRenderer } from "./distanceRenderer";

const scale: ScaleEstimate = { mmPerPx: 0.13, relSd: 0.04, source: "iris", irisPx: 90 };

/** A mid-grey field with one dark dot: the simplest thing a blur must soften. */
function dot(size = 64): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([128, 128, 128, 255], i * 4);
  const c = (size / 2) * size + size / 2;
  data.set([20, 20, 20, 255], c * 4);
  return { width: size, height: size, data };
}

const mean = (img: RgbaImage) => {
  let s = 0;
  for (let i = 0; i < img.data.length; i += 4) s += img.data[i];
  return s / (img.data.length / 4);
};

describe("mock distance renderer (placeholder blur)", () => {
  it("returns the photo itself at the mirror distance", () => {
    const photo = dot();
    expect(Array.from(mockDistanceRenderer(photo, scale, DEFAULT_VIEWING, 0.25).data)).toEqual(Array.from(photo.data));
  });

  it("grows sigma with distance", () => {
    const s = [0.4, 1, 2, 4].map((d) => mockBlurSigmaPx(scale, DEFAULT_VIEWING, d));
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });

  it("softens a dark dot more the farther away, and keeps the average brightness roughly", () => {
    const photo = dot();
    const centre = (img: RgbaImage) => img.data[((img.height / 2) * img.width + img.width / 2) * 4];
    const near = mockDistanceRenderer(photo, scale, DEFAULT_VIEWING, 1);
    const far = mockDistanceRenderer(photo, scale, DEFAULT_VIEWING, 4);
    expect(centre(near)).toBeGreaterThan(centre(photo));
    expect(centre(far)).toBeGreaterThan(centre(near));
    expect(Math.abs(mean(far) - mean(photo))).toBeLessThan(2);
  });

  it("builds box widths whose variance matches the Gaussian", () => {
    for (const sigma of [1.5, 4, 12]) {
      const widths = boxWidthsForGaussian(sigma);
      const variance = widths.reduce((acc, w) => acc + (w * w - 1) / 12, 0);
      expect(Math.sqrt(variance)).toBeGreaterThan(sigma * 0.9);
      expect(Math.sqrt(variance)).toBeLessThan(sigma * 1.1);
    }
  });
});
