import { describe, expect, test } from "vitest";
import type { ConcernId, RgbaImage, SkinAnalysis } from "../contracts";
import { contrastBetween, linearLuminance, linearToLms, srgbToLinear, type ColorStat } from "./color";
import { measureAnalysis } from "./measure";
import { inDisk, makeMask, makePhoto, TEST_SCALE, type Rgb } from "./synth";

const SKIN: Rgb = [185, 135, 115];

function colorStat(c: Rgb): ColorStat {
  const [r, g, b] = c.map(srgbToLinear);
  const [l, m] = linearToLms(r, g, b);
  return { y: linearLuminance(r, g, b), l, m };
}

interface Entry {
  concern: ConcernId;
  region?: string;
  mask: RgbaImage;
}

function setup(width: number, height: number, entries: Entry[]) {
  const masks = new Map<string, RgbaImage>();
  const analysis: SkinAnalysis = {
    engine: "hd",
    frame: { width, height },
    results: entries.map((e, i) => {
      const ref = `mask${i}.png`;
      masks.set(ref, e.mask);
      return { concern: e.concern, region: e.region ?? "whole", rawScore: 50, uiScore: 50, maskRef: ref };
    }),
    skinAge: null,
    overall: null,
  };
  return { analysis, masks };
}

describe("measureAnalysis on planted features", () => {
  test("age spot: recovers diameter and Weber contrast, ignoring a neighbouring darker spot in its ring", () => {
    const W = 200;
    const H = 120;
    const spot = (x: number, y: number) => inDisk(x, y, 60, 60, 10); // 20 px = 4.0 mm
    const neighbour = (x: number, y: number) => inDisk(x, y, 92, 60, 7);
    const photo = makePhoto(W, H, SKIN, (x, y) => (spot(x, y) ? 0.75 : neighbour(x, y) ? 0.4 : null), 0.01);
    const mask = makeMask(W, H, 51, (x, y) => {
      for (const [cx, r] of [[60, 10], [92, 7]]) {
        if (inDisk(x, y, cx, 60, r)) return inDisk(x, y, cx, 60, r - 1.5) ? 0 : 200;
      }
      return null;
    });
    const { analysis, masks } = setup(W, H, [{ concern: "age_spot", mask }]);
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.features).toHaveLength(2);
    const [a, b] = m.features;
    expect(a.id).toBe("age_spot:0");
    expect(a.sizeSource).toBe("mask");
    expect(Math.abs(a.diameterMm! - 4.0)).toBeLessThan(0.2);
    expect(Math.abs(a.contrast.lum + 0.25)).toBeLessThan(0.03);
    expect(Math.abs(b.diameterMm! - 2.8)).toBeLessThan(0.2);
    expect(Math.abs(b.contrast.lum + 0.6)).toBeLessThan(0.04);
    expect(Math.abs(a.contrast.rg)).toBeLessThan(0.02);
  });

  test("wrinkle: length and width from a line the mask draws 2 px off the crease", () => {
    const W = 200;
    const H = 120;
    const crease = (x: number, y: number) => x >= 40 && x < 120 && y >= 59 && y <= 61;
    const photo = makePhoto(W, H, SKIN, (x, y) => (crease(x, y) ? 0.7 : null), 0.01);
    const mask = makeMask(W, H, 0, (x, y) => (x >= 40 && x < 120 && y >= 61 && y <= 63 ? 200 : null));
    const { analysis, masks } = setup(W, H, [{ concern: "wrinkle", mask }]);
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.features).toHaveLength(1);
    const f = m.features[0];
    expect(f.shape).toBe("line");
    expect(f.sizeSource).toBe("photo");
    expect(f.lengthMm!).toBeGreaterThan(80 * 0.2 * 0.94);
    expect(f.lengthMm!).toBeLessThan(80 * 0.2 * 1.03);
    expect(Math.abs(f.widthMm! - 3 * 0.2)).toBeLessThan(0.15);
    expect(Math.abs(f.contrast.lum + 0.3)).toBeLessThan(0.05);
  });

  test("wrinkle with nothing visible in the photo falls back to the mask width and says so", () => {
    const W = 200;
    const H = 120;
    const photo = makePhoto(W, H, SKIN, () => null, 0.01);
    const mask = makeMask(W, H, 0, (x, y) => (x >= 40 && x < 120 && y >= 59 && y <= 61 ? 200 : null));
    const { analysis, masks } = setup(W, H, [{ concern: "wrinkle", mask }]);
    const f = measureAnalysis(analysis, masks, photo, TEST_SCALE).features[0];
    expect(f.sizeSource).toBe("mask");
    expect(f.widthMm).toBeCloseTo(3 * 0.2, 1);
    expect(Math.abs(f.contrast.lum)).toBeLessThan(0.05);
  });

  test("pore marker: location from the mask, size and contrast from the photo; a flat photo gives a prior", () => {
    const W = 220;
    const H = 120;
    const dot = (cx: number) => (x: number, y: number) => Math.abs(x - cx) <= 4 && Math.abs(y - 60) <= 4;
    const photo = makePhoto(W, H, SKIN, (x, y) => (inDisk(x, y, 50, 60, 2.5) ? 0.6 : null), 0.01);
    const mask = makeMask(W, H, 102, (x, y) => (dot(50)(x, y) || dot(150)(x, y) ? 255 : null));
    const { analysis, masks } = setup(W, H, [{ concern: "pore", mask }]);
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.features.map((f) => f.id)).toEqual(["pore:0", "pore:1"]);
    const [lesion, flat] = m.features;
    expect(lesion.sizeSource).toBe("photo");
    expect(Math.abs(lesion.diameterMm! - 5 * 0.2)).toBeLessThan(0.3);
    expect(Math.abs(lesion.contrast.lum + 0.4)).toBeLessThan(0.05);
    expect(flat.sizeSource).toBe("prior");
    expect(flat.diameterMm!).toBeGreaterThanOrEqual(0.3 - 1e-9);
  });

  test("acne marker: red-green contrast is measured, matching the colour oracle", () => {
    const W = 120;
    const H = 120;
    const lesionRgb: Rgb = [205, 105, 95];
    const [sr, sg, sb] = SKIN.map(srgbToLinear);
    const [lr, lg, lb] = lesionRgb.map(srgbToLinear);
    const photo = makePhoto(W, H, SKIN, (x, y) => (inDisk(x, y, 60, 60, 3) ? [lr / sr, lg / sg, lb / sb] : null), 0.005);
    const ring = (x: number, y: number) => (inDisk(x, y, 60, 60, 8.5) ? (inDisk(x, y, 60, 60, 6.5) ? 0 : 255) : null);
    const { analysis, masks } = setup(W, H, [{ concern: "acne", mask: makeMask(W, H, 92, ring) }]);
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.features).toHaveLength(1);
    const f = m.features[0];
    const oracle = contrastBetween(colorStat(lesionRgb), colorStat(SKIN));
    expect(oracle.rg).toBeGreaterThan(0.1);
    expect(f.sizeSource).toBe("photo");
    expect(Math.abs(f.contrast.rg - oracle.rg)).toBeLessThan(0.03);
    expect(Math.abs(f.contrast.lum - oracle.lum)).toBeLessThan(0.04);
    expect(f.diameterMm!).toBeGreaterThan(4 * 0.2);
    expect(f.diameterMm!).toBeLessThan(10 * 0.2);
  });

  test("dark circle: region size from the mask bbox, contrast against the cheek band below", () => {
    const W = 240;
    const H = 200;
    const inRegion = (x: number, y: number) => x >= 60 && x < 140 && y >= 60 && y < 100;
    const photo = makePhoto(W, H, SKIN, (x, y) => (inRegion(x, y) ? 0.7 : null), 0.01);
    const mask = makeMask(W, H, 0, (x, y) => (inRegion(x, y) ? 100 : null));
    const { analysis, masks } = setup(W, H, [{ concern: "dark_circle", mask }]);
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.regions).toHaveLength(1);
    const r = m.regions[0];
    expect(r.id).toBe("dark_circle:0");
    expect(r.reference).toBe("cheek_band");
    expect(r.widthMm).toBeCloseTo(80 * 0.2, 6);
    expect(r.heightMm).toBeCloseTo(40 * 0.2, 6);
    expect(Math.abs(r.contrast.lum + 0.3)).toBeLessThan(0.02);
  });

  test("redness: an empty mask is skipped; a zone is compared with skin outside all zones in the texture window", () => {
    const W = 240;
    const H = 200;
    const zone = (x: number, y: number) => x >= 80 && x < 160 && y >= 70 && y < 130;
    const [sr, sg, sb] = SKIN.map(srgbToLinear);
    const flush: Rgb = [200, 120, 105];
    const [fr, fg, fb] = flush.map(srgbToLinear);
    const photo = makePhoto(W, H, SKIN, (x, y) => (zone(x, y) ? [fr / sr, fg / sg, fb / sb] : null), 0.01);
    const texture = makeMask(W, H, 102, (x, y) => (x >= 10 && x < 230 && y >= 10 && y < 190 ? 0 : null));
    const empty = setup(W, H, [{ concern: "redness", mask: makeMask(W, H, 51, () => null) }]);
    const skippedEmpty = measureAnalysis(empty.analysis, empty.masks, photo, TEST_SCALE);
    expect(skippedEmpty.regions).toHaveLength(0);
    expect(skippedEmpty.skipped.find((s) => s.concern === "redness")?.reason).toMatch(/empty/);

    const { analysis, masks } = setup(W, H, [
      { concern: "redness", mask: makeMask(W, H, 51, (x, y) => (zone(x, y) ? 20 : null)) },
      { concern: "texture", mask: texture },
    ]);
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.regions).toHaveLength(1);
    const oracle = contrastBetween(colorStat(flush), colorStat(SKIN));
    expect(m.regions[0].reference).toBe("skin_outside_zones");
    expect(Math.abs(m.regions[0].contrast.rg - oracle.rg)).toBeLessThan(0.02);
    expect(Math.abs(m.regions[0].contrast.lum - oracle.lum)).toBeLessThan(0.03);
  });

  test("ids are deterministic and sorted by position; regional masks only label the region", () => {
    const W = 200;
    const H = 200;
    const dot = (cx: number, cy: number) => (x: number, y: number) => Math.abs(x - cx) <= 4 && Math.abs(y - cy) <= 4;
    const dots = [dot(150, 30), dot(50, 150), dot(50, 30)];
    const whole = makeMask(W, H, 102, (x, y) => (dots.some((d) => d(x, y)) ? 255 : null));
    const forehead = makeMask(W, H, 102, (x, y) => (y < 100 ? (dots.some((d) => d(x, y)) ? 255 : 0) : null));
    const cheek = makeMask(W, H, 102, (x, y) => (y >= 100 ? (dots.some((d) => d(x, y)) ? 255 : 0) : null));
    const photo = makePhoto(W, H, SKIN, () => null, 0.01);
    const { analysis, masks } = setup(W, H, [
      { concern: "pore", mask: whole },
      { concern: "pore", region: "forehead", mask: forehead },
      { concern: "pore", region: "cheek", mask: cheek },
    ]);
    const a = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    const b = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(b).toEqual(a);
    expect(a.features.map((f) => [f.id, f.region, f.centroid.x, f.centroid.y])).toEqual([
      ["pore:0", "forehead", 50, 30],
      ["pore:1", "forehead", 150, 30],
      ["pore:2", "cheek", 50, 150],
    ]);
    expect(a.skipped.map((s) => s.concern)).toContain("texture");
  });

  test("a photo that is not in the analysis frame is rejected", () => {
    const { analysis, masks } = setup(50, 50, []);
    expect(() => measureAnalysis(analysis, masks, makePhoto(40, 50, SKIN), TEST_SCALE)).toThrow(RangeError);
  });
});
