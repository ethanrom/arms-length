import { describe, expect, it } from "vitest";
import type { ConcernId, Measurements, RgbaImage, SkinAnalysis } from "../contracts";
import { PROFILE_DISTANCES_M } from "../contracts/vision";
import { measureAnalysis } from "../skin/measure";
import { makeMask, makePhoto, TEST_SCALE, type Rgb } from "../skin/synth";
import { worthIt } from "./worthIt";

const SKIN: Rgb = [185, 135, 115];
const W = 240;
const H = 200;
const inRegion = (x: number, y: number) => x >= 60 && x < 140 && y >= 50 && y < 90;
const inPore = (x: number, y: number) => Math.hypot(x - 190, y - 120) <= 2.5;

const gains = (region: number, pore: number) => (x: number, y: number) => (inRegion(x, y) ? region : inPore(x, y) ? pore : null);
const photo = makePhoto(W, H, SKIN, gains(0.7, 0.6), 0.01);
// Half strength takes about half the darkness away; full strength takes all of it.
const half = makePhoto(W, H, SKIN, gains(0.85, 0.8), 0.01);
const full = makePhoto(W, H, SKIN, () => null, 0.01);

const entries: { concern: ConcernId; mask: RgbaImage }[] = [
  { concern: "dark_circle", mask: makeMask(W, H, 0, (x, y) => (inRegion(x, y) ? 100 : null)) },
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
const base: Measurements = measureAnalysis(analysis, masks, photo, TEST_SCALE);
const run = (sim: RgbaImage, concerns: ConcernId[] = ["pore", "dark_circle"]) => worthIt(base, { analysis, masks }, photo, sim, concerns);

describe("worthIt", () => {
  it("a simulation equal to the photo changes nothing, so nothing would show", () => {
    for (const w of run(photo)) {
      expect(w.differenceMaxDistanceM, w.concern).toBe(0);
      expect(w.differenceProfile.every((p) => p.count === 0)).toBe(true);
    }
  });

  it("a bigger improvement shows from farther away; the profile is over the same targets", () => {
    const [pHalf, rHalf] = run(half);
    const [pFull, rFull] = run(full);
    expect(pHalf.concern).toBe("pore");
    expect(pHalf.differenceMaxDistanceM).toBeGreaterThan(0);
    expect(pFull.differenceMaxDistanceM).toBeGreaterThan(pHalf.differenceMaxDistanceM);
    expect(rFull.differenceMaxDistanceM).toBeGreaterThanOrEqual(rHalf.differenceMaxDistanceM);
    for (const w of [pHalf, rHalf]) {
      expect(w.targetCount).toBe(1);
      expect(w.differenceProfile.map((p) => p.distanceM)).toEqual([...PROFILE_DISTANCES_M]);
      expect(w.differenceMedianDistanceM).toBe(w.differenceMaxDistanceM);
    }
  });

  it("carries the typical-observer twins of the difference distances, never above the bound", () => {
    for (const w of run(full)) {
      expect(w.differenceNominalProfile, w.concern).toHaveLength(PROFILE_DISTANCES_M.length);
      expect(w.differenceNominalMaxDistanceM!, w.concern).toBeLessThanOrEqual(w.differenceMaxDistanceM);
      w.differenceNominalProfile!.forEach((p, i) => expect(p.count).toBeLessThanOrEqual(w.differenceProfile[i].count));
    }
    // Nothing measured: no nominal fields either.
    const [none] = run(half, ["acne"]);
    expect(none.differenceNominalProfile).toBeUndefined();
  });

  it("keeps the order asked for, only the concerns asked for, and reports an unmeasured concern as nothing", () => {
    expect(run(half, ["dark_circle", "pore"]).map((w) => w.concern)).toEqual(["dark_circle", "pore"]);
    const [only, none] = run(half, ["pore", "acne"]);
    expect(only.targetCount).toBe(1);
    expect(none).toMatchObject({ concern: "acne", targetCount: 0, differenceMaxDistanceM: 0 });
  });
});
