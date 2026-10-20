import { describe, expect, test } from "vitest";
import type { ConcernId, Measurements, RgbaImage, SkinAnalysis } from "../contracts";
import { DEFAULT_VIEWING } from "../contracts";
import { buildVisibilityReport } from "../vision/report";
import { applyCounterfactual } from "./counterfactual";
import { measureAnalysis } from "./measure";
import { makeMask, makePhoto, TEST_SCALE, type Rgb } from "./synth";

const SKIN: Rgb = [185, 135, 115];
const W = 240;
const H = 220;
const inCircle = (x: number, y: number) => x >= 60 && x < 140 && y >= 50 && y < 90;
const inCrease = (x: number, y: number) => x >= 40 && x < 140 && y >= 169 && y <= 171;

const inPore = (x: number, y: number) => Math.hypot(x - 190, y - 120) <= 2.5;

// A dark under-eye region (-30%), a crease (-30%) drawn 2 px off by the mask, and a pore (-40%): all in one face.
const photo = makePhoto(W, H, SKIN, (x, y) => (inCircle(x, y) || inCrease(x, y) ? 0.7 : inPore(x, y) ? 0.6 : null), 0.01);
// The same face, same noise, with the concerns gone: what Skin Simulation returns at full strength.
const sim = makePhoto(W, H, SKIN, () => null, 0.01);

function setup() {
  const entries: { concern: ConcernId; mask: RgbaImage }[] = [
    { concern: "dark_circle", mask: makeMask(W, H, 0, (x, y) => (inCircle(x, y) ? 100 : null)) },
    { concern: "wrinkle", mask: makeMask(W, H, 0, (x, y) => (x >= 40 && x < 140 && y >= 171 && y <= 173 ? 200 : null)) },
    { concern: "pore", mask: makeMask(W, H, 102, (x, y) => (Math.abs(x - 190) <= 4 && Math.abs(y - 120) <= 4 ? 255 : null)) },
  ];
  const masks = new Map<string, RgbaImage>();
  const analysis: SkinAnalysis = {
    engine: "hd",
    frame: { width: W, height: H },
    results: entries.map((e, i) => {
      masks.set(`m${i}.png`, e.mask);
      return { concern: e.concern, region: "whole", rawScore: 50, uiScore: 50, maskRef: `m${i}.png` };
    }),
    skinAge: null,
    overall: null,
  };
  return { analysis, masks };
}

describe("counterfactual contrast", () => {
  const { analysis, masks } = setup();

  test("a face darkened by the concerns recovers the difference against the simulation", () => {
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE, sim);
    const [region] = m.regions;
    expect(region).toMatchObject({ concern: "dark_circle", reference: "simulation", contrastBasis: "counterfactual" });
    expect(Math.abs(region.contrast.lum + 0.3)).toBeLessThan(0.02);
    expect(Math.abs(region.contrast.rg)).toBeLessThan(0.02);
    const line = m.features.find((f) => f.concern === "wrinkle")!;
    expect(line.contrastBasis).toBe("counterfactual");
    expect(Math.abs(line.contrast.lum + 0.3)).toBeLessThan(0.06);
    // Marks too: the pore's 3x3 box against the same box in the simulation.
    const pore = m.features.find((f) => f.concern === "pore")!;
    expect(pore.contrastBasis).toBe("counterfactual");
    expect(Math.abs(pore.contrast.lum + 0.4)).toBeLessThan(0.05);
  });

  test("sizes and ids do not depend on the simulation, so the two passes line up", () => {
    const plain = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    const diff = measureAnalysis(analysis, masks, photo, TEST_SCALE, sim);
    const shape = (m: Measurements) => m.features.map((f) => [f.id, f.diameterMm, f.lengthMm, f.widthMm, f.sizeSource, f.bbox]);
    expect(shape(diff)).toEqual(shape(plain));
    expect(diff.regions.map((r) => [r.id, r.bbox, r.areaPx])).toEqual(plain.regions.map((r) => [r.id, r.bbox, r.areaPx]));
  });

  test("a simulation equal to the photo gives no contrast, so no distance", () => {
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE, photo);
    for (const t of [...m.regions, ...m.features.filter((f) => f.concern === "wrinkle")]) {
      expect(Math.abs(t.contrast.lum), t.id).toBeLessThan(1e-6);
      expect(Math.abs(t.contrast.rg), t.id).toBeLessThan(1e-6);
    }
    const report = buildVisibilityReport(m, DEFAULT_VIEWING);
    const distance = (id: string) => report.targets.find((t) => t.targetId === id)!.distanceM;
    expect(distance("dark_circle:0")).toBe(0);
    expect(distance(m.features.find((f) => f.concern === "wrinkle")!.id)).toBe(0);
  });

  test("without a simulation everything is against its surround, marked as such, with the usual confidence", () => {
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.regions[0]).toMatchObject({ reference: "cheek_band", contrastBasis: "surround" });
    expect(m.features.every((f) => f.contrastBasis === "surround")).toBe(true);
    const sure = measureAnalysis(analysis, masks, photo, { ...TEST_SCALE, source: "iris" });
    const confidence = Object.fromEntries(buildVisibilityReport(sure, DEFAULT_VIEWING).concerns.map((c) => [c.concern, c.confidence]));
    expect(confidence).toMatchObject({ dark_circle: "high", wrinkle: "medium" });
  });

  test("applyCounterfactual swaps in the difference contrast and leaves sizes alone", () => {
    const base = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    const after = applyCounterfactual(base, photo, sim, { dx: 0, dy: 0 }, { analysis, masks });
    expect(after.regions[0]).toMatchObject({ reference: "simulation", contrastBasis: "counterfactual" });
    expect(after.regions[0].contrast.lum).toBeLessThan(-0.25);
    expect(after.features.every((f) => f.contrastBasis === "counterfactual")).toBe(true);
    const sizes = (m: Measurements) => m.features.map((f) => [f.id, f.diameterMm, f.widthMm, f.lengthMm]);
    expect(sizes(after)).toEqual(sizes(base));
    expect(after.scale).toEqual(base.scale);
  });

  test("a simulation of the wrong size is rejected", () => {
    expect(() => measureAnalysis(analysis, masks, photo, TEST_SCALE, makePhoto(W - 1, H, SKIN))).toThrow(RangeError);
  });
});
