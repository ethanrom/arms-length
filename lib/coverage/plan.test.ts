// planCoverage on a synthetic face with ten identical-size spots and a fake service whose response is known.
import { describe, expect, test } from "vitest";
import { DEFAULT_VIEWING, type ConcernId, type Lever, type RgbaImage, type SkinAnalysis } from "../contracts";
import { measureAnalysis } from "../skin/measure";
import { inDisk, makeMask, makePhoto, TEST_SCALE, type Rgb } from "../skin/synth";
import { concernStats, DEFAULT_TARGET_DISTANCE_M, type RenderedImage } from "./common";
import { planCoverage } from "./plan";

const SKIN: Rgb = [185, 135, 115];
const W = 420;
const H = 160;
const R = 6; // 12 px = 2.4 mm at 0.2 mm/px
const centres = Array.from({ length: 10 }, (_, i) => ({ x: 50 + (i % 5) * 80, y: 50 + Math.floor(i / 5) * 60 }));

const photoOf = (contrasts: number[]): RgbaImage =>
  makePhoto(W, H, SKIN, (x, y) => {
    const i = centres.findIndex((c) => inDisk(x, y, c.x, c.y, R));
    return i < 0 ? null : 1 - contrasts[i];
  }, 0.01, 3);

const maskOf = makeMask(W, H, 51, (x, y) => {
  const c = centres.find((p) => inDisk(x, y, p.x, p.y, R));
  return c ? (inDisk(x, y, c.x, c.y, R - 1.5) ? 0 : 200) : null;
});
const masks = new Map([["mask0.png", maskOf]]);
const analysis: SkinAnalysis = {
  engine: "hd",
  frame: { width: W, height: H },
  results: [{ concern: "age_spot", region: "whole", rawScore: 50, uiScore: 50, maskRef: "mask0.png" }],
  skinAge: null,
  overall: null,
};
const geometry = { analysis, masks };
const measure = (photo: RgbaImage) => measureAnalysis(analysis, masks, photo, TEST_SCALE);

/** The darkening (positive Weber magnitude) at which one of these spots is exactly detectable at the target distance. */
function thresholdContrast(targetM: number): number {
  let lo = 0.005;
  let hi = 0.9;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const m = measure(photoOf(centres.map(() => mid)));
    if (concernStats(m, "age_spot", DEFAULT_VIEWING, targetM).fractionAtTarget >= 1) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

const T = DEFAULT_TARGET_DISTANCE_M;
const threshold = thresholdContrast(T);
/** Coverage c shrinks every spot's contrast to this share: 1, 0.8, 0.6, 0.4, 0.2 at 0, 25, 50, 75, 100. */
const shrink = (c: number) => 1 - (0.8 * c) / 100;
// A spot with ratio r (its contrast over the threshold) is still detectable at coverage c iff r * shrink(c) >= 1, i.e. r >= 1.25
// at 25, 1.67 at 50, 2.5 at 75, 5 at 100. Ratios sit at least 10% from those edges.
const scenario = (ratios: number[]) => {
  const base = measure(photoOf(ratios.map((r) => r * threshold)));
  const log: number[] = [];
  const render = async (lever: Lever): Promise<RenderedImage> => {
    log.push(lever.value);
    return {
      photo: photoOf(ratios.map((r) => r * threshold * shrink(lever.value))),
      result: { imageRef: `fake:${lever.value}`, width: W, height: H, offset: { dx: 0, dy: 0 }, unitsCharged: 1, source: "preview" },
    };
  };
  const plan = () => planCoverage({ concern: "age_spot", base, scale: TEST_SCALE, viewing: DEFAULT_VIEWING, photo: photoOf(ratios.map((r) => r * threshold)), geometry, render });
  return { plan, log };
};

const low = 1.1;
describe("planCoverage: fraction of marks still detectable at the target (default 1.5 m), at most 4 renders", () => {
  test("the target defaults to 1.5 m and the fractions follow the designed ratios", async () => {
    const { plan } = scenario([low, low, low, 1.4, 1.5, 1.5, 1.5, 3, 8, 9]);
    const p = await plan();
    expect(p.targetDistanceM).toBe(1.5);
    expect(p.baselineFraction).toBe(1);
    // r >= 1.25 at 25 -> 7 spots; r >= 1.667 at 50 -> {3, 8, 9}; r >= 2.5 at 75 -> {3, 8, 9}; r >= 5 at 100 -> {8, 9}
    expect(p.steps.map((s) => [s.lever.value, s.fractionAtTarget])).toEqual([[50, 0.3], [75, 0.3], [100, 0.2], [25, 0.7]]);
  });

  test.each([
    { name: "met at 25 (50 and 25 both hide it)", ratios: [...Array(9).fill(low), 3], order: [50, 25], chosen: 25 },
    { name: "met at 50 (25 still shows 30%)", ratios: [...Array(7).fill(low), 1.4, 1.5, 3], order: [50, 25], chosen: 50 },
    { name: "met at 75", ratios: [...Array(7).fill(low), 2, 2.1, 3], order: [50, 75], chosen: 75 },
    { name: "met only at 100", ratios: [...Array(7).fill(low), 3, 3.5, 9], order: [50, 75, 100], chosen: 100 },
  ])("$name", async ({ ratios, order, chosen }) => {
    const { plan, log } = scenario(ratios);
    const p = await plan();
    expect(log).toEqual(order);
    expect(p.status).toBe("met");
    expect(p.chosen?.lever.value).toBe(chosen);
    expect(p.chosen?.fractionAtTarget).toBeLessThanOrEqual(0.1);
    expect(p.reason).toBeUndefined();
  });

  test.each([
    // fractions 1.0 / 0.7 / 0.4 / 0.3 / 0.2 at 0 / 25 / 50 / 75 / 100: 50 gives 0.6 of the 0.8 reduction (< 80%), 75 gives 0.7
    { name: "not met: the knee is 75 and 25 is never rendered", ratios: [low, low, low, 1.4, 1.5, 1.5, 2, 3, 8, 9], order: [50, 75, 100], chosen: 75 },
    // fractions 1.0 / 0.7 / 0.3 / 0.3 / 0.2: 50 already gives 0.7 of 0.8 (>= 80%), so 25 is rendered to see if it does too
    { name: "not met: the knee is 50, which costs a fourth render at 25", ratios: [low, low, low, 1.4, 1.5, 1.5, 1.5, 3, 8, 9], order: [50, 75, 100, 25], chosen: 50 },
    // fractions 1.0 / 0.3 / 0.3 / 0.3 / 0.2: most of the effect is already there at 25
    { name: "not met: the knee is 25", ratios: [low, low, low, low, low, low, low, 3, 8, 9], order: [50, 75, 100, 25], chosen: 25 },
  ])("$name", async ({ ratios, order, chosen }) => {
    const { plan, log } = scenario(ratios);
    const p = await plan();
    expect(log).toEqual(order);
    expect(p.status).toBe("not_met");
    expect(p.chosen?.lever.value).toBe(chosen);
    expect(p.reason).toBeUndefined();
    expect(log.length).toBeLessThanOrEqual(4);
  });

  test("not met and 100 reduces nothing: no chosen coverage, reason no_effect", async () => {
    const ratios = Array(10).fill(3);
    const base = measure(photoOf(ratios.map((r) => r * threshold)));
    const same = photoOf(ratios.map((r) => r * threshold));
    const p = await planCoverage({
      concern: "age_spot", base, scale: TEST_SCALE, viewing: DEFAULT_VIEWING, photo: same, geometry,
      render: async () => ({ photo: same, result: { imageRef: "fake", width: W, height: H, offset: { dx: 0, dy: 0 }, unitsCharged: 1, source: "preview" } }),
    });
    expect(p).toMatchObject({ status: "not_met", chosen: null, reason: "no_effect" });
    expect(p.steps.map((s) => s.lever.value)).toEqual([50, 75, 100]);
  });

  test("a concern already at or below 10% with no makeup needs no render", async () => {
    const { plan, log } = scenario(Array(10).fill(0.9));
    const p = await plan();
    expect(log).toEqual([]);
    expect(p).toMatchObject({ status: "met", chosen: null, steps: [], reason: "already_met", baselineFraction: 0 });
  });

  test.each(["dark_circle", "eye_bag"] as const)("%s has no makeup lever and renders nothing", async (concern: ConcernId) => {
    const { log } = scenario(Array(10).fill(3));
    const base = measure(photoOf(Array(10).fill(3 * threshold)));
    const p = await planCoverage({
      concern, base, scale: TEST_SCALE, viewing: DEFAULT_VIEWING, photo: photoOf(Array(10).fill(0)), geometry,
      render: () => Promise.reject(new Error("must not render")),
    });
    expect(log).toEqual([]);
    expect(p).toMatchObject({ concern, status: "no_lever", chosen: null, steps: [], reason: "no_makeup_lever" });
  });
});
