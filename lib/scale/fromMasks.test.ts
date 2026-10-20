import fs from "node:fs";
import { describe, expect, test } from "vitest";
import type { RgbaImage } from "@/lib/contracts";
import { eyeRegionSeparationPx, estimateScaleFromMasks, IPD_REL_SD } from "@/lib/scale/fromMasks";
import { loadPersona } from "@/lib/skin/fixtures-io";

const irisScale = (persona: string) =>
  JSON.parse(fs.readFileSync(`fixtures/youcam/${persona}/scale.json`, "utf8")) as { mmPerPx: number };

const SETS = [
  ["p2b", "hd"],
  ["p3a", "hd"],
  ["p2b", "sd"], // held out when the ratios were calibrated
] as const;

function withoutMasks(loaded: Awaited<ReturnType<typeof loadPersona>>, concerns: string[]) {
  const masks = new Map(loaded.masks);
  for (const r of loaded.analysis.results) if (concerns.includes(r.concern) && r.maskRef) masks.delete(r.maskRef);
  return masks;
}

describe("estimateScaleFromMasks", () => {
  test.each(SETS)("eye regions agree with the iris scale within 10% (%s %s)", async (persona, quality) => {
    const loaded = await loadPersona(persona, quality);
    const est = estimateScaleFromMasks(loaded.analysis, loaded.masks);
    expect(est.method).toBe("eye-regions");
    expect(est.source).toBe("assumed");
    expect(Math.abs(est.mmPerPx / irisScale(persona).mmPerPx - 1)).toBeLessThan(0.1);
    // IPD spread alone is 5.6%; the calibration residual widens it a little.
    expect(est.relSd).toBeGreaterThan(IPD_REL_SD);
    expect(est.relSd).toBeLessThan(0.1);
  });

  test("falls back to the face extent, then to a frame prior, with wider uncertainty each time", async () => {
    const loaded = await loadPersona("p2b", "hd");
    const eyes = estimateScaleFromMasks(loaded.analysis, loaded.masks);
    const extent = estimateScaleFromMasks(loaded.analysis, withoutMasks(loaded, ["dark_circle", "eye_bag"]));
    const frame = estimateScaleFromMasks(loaded.analysis, new Map());
    expect([extent.method, frame.method]).toEqual(["face-extent", "frame-prior"]);
    expect(Math.abs(extent.mmPerPx / irisScale("p2b").mmPerPx - 1)).toBeLessThan(0.1);
    expect(Math.abs(frame.mmPerPx / irisScale("p2b").mmPerPx - 1)).toBeLessThan(0.25);
    expect(eyes.relSd).toBeLessThan(extent.relSd);
    expect(extent.relSd).toBeLessThan(frame.relSd);
  });

  test("an eye region needs two separate sides: one blob is rejected, two blobs give their centroid distance", () => {
    const paint = (boxes: [number, number, number, number][]): RgbaImage => {
      const image: RgbaImage = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4) };
      for (const [x0, y0, x1, y1] of boxes) {
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) image.data[(y * 400 + x) * 4 + 3] = 200;
      }
      return image;
    };
    expect(eyeRegionSeparationPx(paint([[100, 100, 300, 140]]))).toBeNull();
    // Centroids at x = 90 and 290 (box centres), same row.
    expect(eyeRegionSeparationPx(paint([[60, 100, 120, 140], [260, 100, 320, 140]]))).toBeCloseTo(200, 6);
  });
});
