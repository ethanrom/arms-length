import { describe, expect, test } from "vitest";
import { DEFAULT_VIEWING, type ConcernId, type Lever, type Measurements, type RgbaImage, type SkinAnalysis } from "../contracts";
import { alignRender, remeasure } from "../skin/remeasure";
import { measureAnalysis } from "../skin/measure";
import { inDisk, makeMask, makePhoto, TEST_SCALE, type Rgb } from "../skin/synth";
import { concernDistance, type RenderedImage } from "./common";
import { planCoverage } from "./plan";
import { registerRender } from "./register";
import { skinShade } from "./shade";
import { whatIf } from "./whatif";

const W = 200;
const H = 120;
const SKIN: Rgb = [185, 135, 115];

/** A skin photo with one darker age spot (16 px = 3.2 mm at 0.2 mm/px) of Weber contrast `contrast` (negative = darker). */
const photoWith = (contrast: number): RgbaImage =>
  makePhoto(W, H, SKIN, (x, y) => (inDisk(x, y, 100, 60, 8) ? 1 + contrast : null), 0.01, 7);

function setup(photo: RgbaImage, mask?: RgbaImage) {
  const spotMask = mask ?? makeMask(W, H, 51, (x, y) => (inDisk(x, y, 100, 60, 8) ? (inDisk(x, y, 100, 60, 6.5) ? 0 : 200) : null));
  const masks = new Map([["mask0.png", spotMask]]);
  const analysis: SkinAnalysis = {
    engine: "hd",
    frame: { width: photo.width, height: photo.height },
    results: [{ concern: "age_spot", region: "whole", rawScore: 50, uiScore: 50, maskRef: "mask0.png" }],
    skinAge: null,
    overall: null,
  };
  const base = measureAnalysis(analysis, masks, photo, TEST_SCALE);
  return { analysis, masks, base };
}

const spotContrast = (m: Measurements) => m.features[0].contrast.lum;
const distance = (m: Measurements, concern: ConcernId = "age_spot") => concernDistance(m, concern, DEFAULT_VIEWING).maxDistanceM;
const NO_SHIFT = { dx: 0, dy: 0 };

describe("remeasure", () => {
  const photo = photoWith(-0.3);
  const { analysis, masks, base } = setup(photo);

  test("the identity render gives the base contrast: exactly with the masks, within a few percent without", () => {
    expect(base.features).toHaveLength(1);
    const exact = remeasure(base, photo, NO_SHIFT, { geometry: { analysis, masks } });
    expect(exact.features[0].contrast).toEqual(base.features[0].contrast);
    const approx = remeasure(base, photo, NO_SHIFT);
    expect(Math.abs(spotContrast(approx) / spotContrast(base) - 1)).toBeLessThan(0.1);
    expect(approx.features[0].diameterMm).toBe(base.features[0].diameterMm); // geometry is kept
  });

  test("a render that halves the spot's contrast has a lower visibility distance", () => {
    const half = photoWith(-0.15);
    for (const options of [{ geometry: { analysis, masks } }, {}]) {
      const after = remeasure(base, half, NO_SHIFT, options);
      expect(spotContrast(after) / spotContrast(base)).toBeGreaterThan(0.4);
      expect(spotContrast(after) / spotContrast(base)).toBeLessThan(0.6);
      expect(distance(after)).toBeLessThan(distance(base));
    }
  });

  test("a VTO-style render (one row short, black first row, shifted +1) is measured after undoing the offset", () => {
    const dot = (x: number, y: number) => inDisk(x, y, 100, 60, 1.5);
    const dotPhoto = makePhoto(W, H, SKIN, (x, y) => (dot(x, y) ? 0.5 : null), 0, 1);
    const dotMask = makeMask(W, H, 51, (x, y) => (dot(x, y) ? 200 : null)); // a 3x3 spot: a one-row error covers a third of it
    const { base: dotBase } = setup(dotPhoto, dotMask);
    expect(dotBase.features).toHaveLength(1);

    // render(x, y + 1) = photo(x, y)
    const render: RgbaImage = { width: W, height: H - 1, data: new Uint8ClampedArray(W * (H - 1) * 4) };
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const from = ((y - 1) * W + x) * 4;
        render.data.set(y === 0 ? [0, 0, 0, 255] : dotPhoto.data.subarray(from, from + 4), (y * W + x) * 4);
      }
    }
    const aligned = alignRender(render, { dx: 0, dy: 1 }, dotPhoto);
    const rows = (H - 1) * W * 4; // the last frame row has no render pixels and repeats its neighbour
    expect(Array.from(aligned.data.subarray(0, rows))).toEqual(Array.from(dotPhoto.data.subarray(0, rows)));

    const right = remeasure(dotBase, render, { dx: 0, dy: 1 }, { frame: dotPhoto });
    const ignored = remeasure(dotBase, render, NO_SHIFT, { frame: dotPhoto });
    expect(spotContrast(right)).toBeCloseTo(spotContrast(dotBase), 1);
    expect(Math.abs(spotContrast(ignored))).toBeLessThan(Math.abs(spotContrast(right)) * 0.8);
  });
});

describe("alignRender", () => {
  test("a rescaled render is resampled to the frame", () => {
    const smooth = (x: number, y: number) => 1 + 0.3 * Math.sin(x / 11) * Math.cos(y / 13);
    const frame = makePhoto(120, 80, SKIN, smooth);
    const double = makePhoto(240, 160, SKIN, (x, y) => smooth((x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5));
    const aligned = alignRender(double, NO_SHIFT, frame);
    expect({ width: aligned.width, height: aligned.height }).toEqual({ width: 120, height: 80 });
    let worst = 0;
    for (let i = 0; i < aligned.data.length; i++) worst = Math.max(worst, Math.abs(aligned.data[i] - frame.data[i]));
    expect(worst).toBeLessThanOrEqual(3);
  });
});

describe("registerRender", () => {
  test("finds a known shift, a smaller output size and the black padding", () => {
    // A smooth texture, so the blocks have something to lock onto.
    const textured = makePhoto(300, 240, SKIN, (x, y) => 1 + 0.3 * Math.sin(x / 5.3 + Math.cos(y / 9)) * Math.cos(y / 6.1 + x / 17));
    // Like p3a's output: render(x - 3, y) = photo(x, y), 2 columns narrower and 1 row taller, black right column and bottom row.
    const render: RgbaImage = { width: 298, height: 241, data: new Uint8ClampedArray(298 * 241 * 4) };
    for (let y = 0; y < 241; y++) {
      for (let x = 0; x < 298; x++) {
        const from = (y * 300 + x + 3) * 4;
        render.data.set(y < 240 && x < 297 ? textured.data.subarray(from, from + 4) : [0, 0, 0, 255], (y * 298 + x) * 4);
      }
    }
    const found = registerRender(textured, render);
    expect(found).toMatchObject({ dx: -3, dy: 0, valid: { x: 3, y: 0, w: 297, h: 240 } });
    expect(found.ncc).toBeGreaterThan(0.95);
  });
});

describe("skinShade", () => {
  test("is the colour of the skin beside the marks, not of the marks", () => {
    const photo = photoWith(-0.5);
    const shade = skinShade(photo, setup(photo).base);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(shade.slice(i, i + 2), 16));
    expect(Math.abs(r - SKIN[0])).toBeLessThanOrEqual(3);
    expect(Math.abs(g - SKIN[1])).toBeLessThanOrEqual(3);
    expect(Math.abs(b - SKIN[2])).toBeLessThanOrEqual(3);
  });
});

describe("planCoverage", () => {
  const photo = photoWith(-0.3);
  const { analysis, masks, base } = setup(photo);
  const geometry = { analysis, masks };
  const request = { concern: "age_spot" as const, base, scale: TEST_SCALE, viewing: DEFAULT_VIEWING, photo, geometry };

  // A fake service with a known monotone response: coverage c scales the spot's contrast by (1 - 0.8 c / 100).
  const render = (c: number) => photoWith(-0.3 * (1 - (0.8 * c) / 100));
  const fakeRender = (log: number[]) => async (lever: Lever): Promise<RenderedImage> => {
    log.push(lever.value);
    return {
      photo: render(lever.value),
      result: { imageRef: `fake:${lever.value}`, width: W, height: H, offset: NO_SHIFT, unitsCharged: 1, source: "preview" },
    };
  };

  // What each grid level measures through the same pipeline, to place targets between them.
  const level = (c: number) => distance(remeasure(base, render(c), NO_SHIFT, { geometry }));
  const d = { base: distance(base), 25: level(25), 50: level(50), 75: level(75), 100: level(100) };

  test("the fake response is strictly decreasing, so bisection is well posed", () => {
    expect(d.base).toBeGreaterThan(d[25]);
    expect(d[25]).toBeGreaterThan(d[50]);
    expect(d[50]).toBeGreaterThan(d[75]);
    expect(d[75]).toBeGreaterThan(d[100]);
  });

  test.each([
    { name: "50 meets, 25 does not: choose 50", target: (d[25] + d[50]) / 2, order: [50, 25], chosen: 50, status: "met" },
    { name: "50 and 25 meet: choose 25", target: d[25] + 0.01, order: [50, 25], chosen: 25, status: "met" },
    { name: "50 fails, 75 meets: choose 75", target: (d[50] + d[75]) / 2, order: [50, 75], chosen: 75, status: "met" },
    { name: "only 100 meets: choose 100", target: (d[75] + d[100]) / 2, order: [50, 75, 100], chosen: 100, status: "met" },
    { name: "even 100 fails: not met, nothing chosen", target: d[100] / 2, order: [50, 75, 100], chosen: null, status: "not_met" },
  ])("$name", async ({ target, order, chosen, status }) => {
    const log: number[] = [];
    const plan = await planCoverage({ ...request, targetDistanceM: target, render: fakeRender(log) });
    expect(log).toEqual(order);
    expect(plan.steps.map((s) => s.lever.value)).toEqual(order);
    expect(plan.chosen?.lever.value ?? null).toBe(chosen);
    expect(plan.status).toBe(status);
    expect(plan.baselineDistanceM).toBeCloseTo(d.base, 6);
    expect(plan.steps[0].lever).toEqual({ category: "foundation", field: "coverageIntensity", value: 50 });
  });

  test("a concern already below the target needs no render", async () => {
    const log: number[] = [];
    const plan = await planCoverage({ ...request, targetDistanceM: d.base + 1, render: fakeRender(log) });
    expect(log).toEqual([]);
    expect(plan).toMatchObject({ status: "met", chosen: null, steps: [], reason: "already_met" });
  });

  test.each(["dark_circle", "eye_bag"] as const)("%s has no makeup lever and renders nothing", async (concern) => {
    const log: number[] = [];
    const plan = await planCoverage({ ...request, concern, targetDistanceM: 1, render: fakeRender(log) });
    expect(log).toEqual([]);
    expect(plan).toMatchObject({ concern, status: "no_lever", chosen: null, steps: [], reason: "no_makeup_lever" });
  });
});

describe("whatIf", () => {
  test("maps the concern to its simulation control and reports before and after", async () => {
    const photo = photoWith(-0.3);
    const { analysis, masks, base } = setup(photo);
    const seen: unknown[] = [];
    const common = { base, scale: TEST_SCALE, viewing: DEFAULT_VIEWING, photo };
    const result = await whatIf({
      ...common,
      concern: "age_spot",
      geometry: { analysis, masks },
      render: async (strengths) => {
        seen.push(strengths);
        return {
          photo: photoWith(-0.15),
          result: { imageRef: "fake", width: W, height: H, offset: NO_SHIFT, unitsCharged: 4, source: "preview" },
        };
      },
    });
    expect(seen).toEqual([{ spots: 0.5 }]);
    expect(result.strengths).toEqual({ spots: 0.5 });
    expect(result.afterDistanceM).toBeLessThan(result.beforeDistanceM);
    await expect(whatIf({ ...common, concern: "texture", render: () => Promise.reject(new Error("unused")) })).rejects.toThrow(RangeError);
  });
});
