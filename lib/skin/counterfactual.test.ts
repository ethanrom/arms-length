import { describe, expect, test } from "vitest";
import type { ConcernId, Measurements, RgbaImage, SkinAnalysis } from "../contracts";
import { DEFAULT_VIEWING } from "../contracts";
import { buildVisibilityReport } from "../vision/report";
import { applyCounterfactual } from "./counterfactual";
import { measureAnalysis } from "./measure";
import { COUNTERFACTUAL_CONCERNS } from "./params";
import { makeMask, makePhoto, TEST_SCALE, type Rgb } from "./synth";

const SKIN: Rgb = [185, 135, 115];
const W = 240;
const H = 220;
const inCircle = (x: number, y: number) => x >= 60 && x < 140 && y >= 50 && y < 90;
const inCrease = (x: number, y: number) => x >= 40 && x < 140 && y >= 169 && y <= 171;

// A dark under-eye region (-30%), a crease (-30%) drawn 2 px off by the mask, and a pore: all in one face.
const photo = makePhoto(W, H, SKIN, (x, y) => (inCircle(x, y) || inCrease(x, y) ? 0.7 : null), 0.01);
// The same face, same noise, without the concern: what Skin Simulation returns.
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

  test("a face darkened by the concern recovers its contrast against the simulation", () => {
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE, sim);
    const [region] = m.regions;
    expect(region).toMatchObject({ concern: "dark_circle", reference: "simulation", contrastBasis: "counterfactual" });
    expect(Math.abs(region.contrast.lum + 0.3)).toBeLessThan(0.02);
    expect(Math.abs(region.contrast.rg)).toBeLessThan(0.02);
    const line = m.features.find((f) => f.concern === "wrinkle")!;
    expect(line.contrastBasis).toBe("counterfactual");
    expect(Math.abs(line.contrast.lum + 0.3)).toBeLessThan(0.06);
    // Spots, pores and acne are never counterfactual.
    expect(m.features.find((f) => f.concern === "pore")!.contrastBasis).toBe("surround");
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

  test("without a simulation the surround contrast is kept, marked as such, and the report is low confidence", () => {
    const m = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    expect(m.regions[0]).toMatchObject({ reference: "cheek_band", contrastBasis: "surround" });
    expect(m.features.every((f) => f.contrastBasis === "surround")).toBe(true);
    const sure = { ...m, scale: { ...m.scale, source: "iris" as const } };
    const confidence = (x: Measurements) => Object.fromEntries(buildVisibilityReport(x, DEFAULT_VIEWING).concerns.map((c) => [c.concern, c.confidence]));
    expect(confidence(sure)).toMatchObject({ dark_circle: "low", wrinkle: "low" });
    const withSim = measureAnalysis(analysis, masks, photo, { ...TEST_SCALE, source: "iris" }, sim);
    expect(confidence(withSim)).toMatchObject({ dark_circle: "high", wrinkle: "medium" });
  });

  test("applyCounterfactual swaps in the counterfactual contrast of those concerns only", () => {
    const base = measureAnalysis(analysis, masks, photo, TEST_SCALE);
    const after = applyCounterfactual(base, photo, sim, { dx: 0, dy: 0 }, { analysis, masks });
    expect(after.regions[0]).toMatchObject({ reference: "simulation", contrastBasis: "counterfactual" });
    expect(after.regions[0].contrast.lum).toBeLessThan(-0.25);
    expect(after.features.find((f) => f.concern === "pore")).toEqual(base.features.find((f) => f.concern === "pore"));
    expect(after.features.filter((f) => COUNTERFACTUAL_CONCERNS.includes(f.concern)).every((f) => f.contrastBasis === "counterfactual")).toBe(true);
    expect(after.scale).toEqual(base.scale);
  });

  test("a simulation of the wrong size is rejected", () => {
    expect(() => measureAnalysis(analysis, masks, photo, TEST_SCALE, makePhoto(W - 1, H, SKIN))).toThrow(RangeError);
  });
});
