import fs from "node:fs";
import { describe, expect, test } from "vitest";
import type { Feature } from "@/lib/contracts";
import type { ReadingBundle } from "@/lib/integration/types";
import { lintText } from "@/lib/copy/lint";
import { specFromTarget, rawDistances } from "@/lib/vision/visibility";
import { buildChecks, fiveStimuliWorstDb } from "./checks";
import { contrastToGrey, csfPeak, ditherAt, csfSeries, gaborFieldDeg, gaborImage, patchThreshold, patchThresholdPerfect } from "./csf";
import { boxMean, cropRgba, differenceToInk, relativeLuminanceDifference, shareAtLeast } from "./diff";
import { FILE_SUMMARY, MODELFEST_POINTS, summarize } from "./modelfest";
import { DEFAULT_DISTANCE_M, DEFAULT_MARK } from "./defaults";
import { niceDistance } from "./format";
import { neighbourInDirection, nearestFeature, stepFeature } from "./pick";
import { REFERENCES, codeUrl, refNumber } from "./refs";
import { countAtLeast, kthLargest, matchRecordedProfile, medianOf, survivalAt, survivalSentence } from "./survival";
import {
  arcminOf,
  boundaryLine,
  diskReach,
  diskReceipt,
  diskSpec,
  distanceForArcmin,
  doublingCheck,
  marginBand,
  marginCurve,
  poreSpec,
  ratioGrid,
  viewingAt,
} from "./visibility";

const indoor = viewingAt(45, 6);
const lab = viewingAt(30, 6);

describe("angle", () => {
  test("arcmin and its inverse agree", () => {
    for (const [mm, d] of [[0.3, 0.5], [3, 3.2], [12, 10]] as const) {
      expect(distanceForArcmin(mm, arcminOf(mm, d))).toBeCloseTo(d, 6);
    }
  });

  test("a 1.5 mm feature at 5 m covers about 1.03 arcmin", () => {
    expect(arcminOf(1.5, 5)).toBeCloseTo(1.031, 2);
  });
});

describe("vision depends only on the angle", () => {
  test("double the size, double the distance (both observers, several contrasts)", () => {
    for (const contrast of [4, 12, 30]) {
      for (const size of [0.5, 1, 2]) {
        const d = doublingCheck(size, contrast, indoor);
        expect(d.typicalFactor).toBeCloseTo(2, 3);
        expect(d.perfectFactor).toBeCloseTo(2, 3);
      }
    }
  });

  test("the boundary through (size, distance) points is a straight line through the origin", () => {
    const line = boundaryLine(12, indoor, [0.5, 1, 2, 4, 6]);
    const slopes = line.map((p) => p.sizeMm / p.typicalM);
    for (const k of slopes) expect(k / slopes[0]).toBeCloseTo(1, 3);
  });

  test("the verdict of the receipt agrees with the scan: visible out to boundM, not beyond", () => {
    const reach = diskReach(3, 12, indoor);
    const inside = diskReceipt(3, 12, reach.perfectM * 0.95, indoor);
    const outside = diskReceipt(3, 12, reach.perfectM * 1.05, indoor);
    expect(inside?.visible).toBe(true);
    expect(outside?.visible).toBe(false);
    const typicalIn = diskReceipt(3, 12, reach.typicalM * 0.95, indoor);
    const typicalOut = diskReceipt(3, 12, reach.typicalM * 1.05, indoor);
    expect(typicalIn?.typicalVisible).toBe(true);
    expect(typicalOut?.typicalVisible).toBe(false);
  });

  test("the ratio grid is above 1 exactly where the spot is bigger than the boundary at that distance", () => {
    const g = ratioGrid(12, lab, 6, 10, 20, 12);
    const k = 3 / diskReach(3, 12, lab).typicalM; // boundary slope, mm per metre
    let checked = 0;
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const size = ((j + 0.5) / g.rows) * 6;
        const d = ((i + 0.5) / g.cols) * 10;
        const sizeOnLine = k * d;
        if (Math.abs(size - sizeOnLine) / sizeOnLine < 0.1) continue; // too close to the line for a cell centre test
        expect(g.typicalLog[j * g.cols + i] > 0).toBe(size > sizeOnLine);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    // perfect eyes see at least what typical eyes see
    for (let i = 0; i < g.typicalLog.length; i++) expect(g.perfectLog[i]).toBeGreaterThanOrEqual(g.typicalLog[i] - 1e-9);
  });
});

describe("distances people say", () => {
  test("nice distances are exact at the report's anchors and stay close to the input", () => {
    for (const d of [0.25, 0.3, 0.6, 1, 1.5, 2.5, 4, 6]) expect(niceDistance(d * 1.004)).toBe(d);
    for (const d of [0.2, 0.37, 0.83, 1.77, 2.9, 5.55, 9.4]) expect(Math.abs(niceDistance(d) / d - 1)).toBeLessThan(0.06);
  });
});

describe("typical and perfect eyes", () => {
  test("a 3 mm, 12% spot: 3.2 m, 4.8 m (+6 dB, x1.5), 5.9 m (+9 dB) at the lab luminance (docs/MODEL.md section 6)", () => {
    const spec = diskSpec(3, 12);
    const b0 = marginBand(spec, 30, 0);
    const b6 = marginBand(spec, 30, 6);
    const b9 = marginBand(spec, 30, 9);
    expect(b0.typicalM).toBeCloseTo(3.23, 1);
    expect(b0.perfectM).toBeCloseTo(b0.typicalM, 6);
    expect(b6.perfectM).toBeCloseTo(4.85, 1);
    expect(b6.factor).toBeGreaterThan(1.45);
    expect(b6.factor).toBeLessThan(1.55);
    expect(b9.perfectM).toBeCloseTo(5.86, 1);
  });

  test("the band only widens with the margin, and the typical distance does not move", () => {
    const curve = marginCurve(poreSpec(0.3, 5), 45, [0, 1.5, 3, 4.5, 6, 7.5, 9]);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].band.perfectM).toBeGreaterThan(curve[i - 1].band.perfectM);
      expect(curve[i].band.typicalM).toBeCloseTo(curve[0].band.typicalM, 9);
    }
  });
});

describe("the CSF", () => {
  test("Standard A peaks at 217.29 near 3.45 cycles/degree", () => {
    const p = csfPeak();
    expect(p.gain).toBeCloseTo(217.29, 1);
    expect(p.f).toBeCloseTo(3.45, 1);
  });

  test("the series covers the table range, in order, and daylight is at least as sensitive at the peak", () => {
    const indoorSeries = csfSeries(45, 80);
    const day = csfSeries(1000, 80);
    expect(indoorSeries).toHaveLength(81);
    expect(indoorSeries[0].patchSensitivity).toBeNull();
    const mid = indoorSeries.findIndex((s) => s.f > 4);
    expect(day[mid].patchSensitivity!).toBeGreaterThan(indoorSeries[mid].patchSensitivity!);
  });

  test("perfect eyes need less contrast than typical eyes", () => {
    for (const f of [0.5, 2, 4, 8, 16, 30]) expect(patchThresholdPerfect(f, 45)).toBeLessThan(patchThreshold(f, 45));
  });

  test("the Gabor image has the requested peak contrast and a centred cosine carrier", () => {
    const n = 128;
    const img = gaborImage(4, 0.1, n);
    const max = img.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(max).toBeGreaterThan(0.09);
    expect(max).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(gaborFieldDeg(0.5)).toBeGreaterThan(gaborFieldDeg(8));
    expect(gaborFieldDeg(30)).toBe(1);
    expect(contrastToGrey(0)).toBe(128);
    // dither is repeatable, inside half a code value, and averages out near zero
    let sum = 0;
    for (let i = 0; i < 4096; i++) {
      const d = ditherAt(i);
      expect(d).toBeGreaterThanOrEqual(-0.5);
      expect(d).toBeLessThan(0.5);
      sum += d;
    }
    expect(Math.abs(sum / 4096)).toBeLessThan(0.02);
    expect(ditherAt(7)).toBe(ditherAt(7));
    expect(contrastToGrey(0, 0.4)).toBe(128);
    expect(contrastToGrey(0.5)).toBeGreaterThan(contrastToGrey(0.1));
  });
});

describe("ModelFest points", () => {
  test("41 points, 8 skin-like, and the recomputed RMS equals the committed one", () => {
    const s = summarize();
    expect(MODELFEST_POINTS).toHaveLength(41);
    expect(s.nSkin).toBe(8);
    expect(s.rmsAllDb).toBeCloseTo(FILE_SUMMARY.rmsAllDb, 9);
    expect(s.rmsSkinDb).toBeCloseTo(FILE_SUMMARY.rmsSkinDb, 9);
    expect(s.rmsAllDb.toFixed(2)).toBe("0.69");
    expect(s.rmsSkinDb.toFixed(2)).toBe("0.78");
    for (const p of MODELFEST_POINTS) expect(p.errorDb).toBeCloseTo(p.predictedDb - p.observedDb, 9);
  });
});

describe("survival", () => {
  test("counts, fractions and the receipt sentence", () => {
    const d = [0.5, 1, 1.5, 2, 4];
    expect(countAtLeast(d, 1.5)).toBe(3);
    expect(survivalAt(d, [0.25, 1.5, 6])).toEqual([1, 0.6, 0]);
    expect(kthLargest(d, 1)).toBe(4);
    expect(medianOf(d)).toBe(1.5);
    expect(survivalSentence("pore", 649, 141, 342, 1.5)).toBe(
      "At 1.5 m: about 141 of 649 pores for a typical sharp-eyed person looking right at them; at most 342 for even perfect eyes.",
    );
  });

  test("recomputing p2b's pores gives the profile the bundle recorded, at every report distance", () => {
    const bundle = JSON.parse(fs.readFileSync("public/demo/p2b/bundle.json", "utf8")) as ReadingBundle;
    const pores = bundle.measurements.features.filter((f) => f.concern === "pore");
    const cv = bundle.report.concerns.find((c) => c.concern === "pore")!;
    const bound: number[] = [];
    const nominal: number[] = [];
    for (const f of pores) {
      const spec = specFromTarget(f, bundle.scale);
      if (!spec) continue;
      const r = rawDistances(spec, bundle.viewing);
      // The report caps at the contract's 10 m and floors at 0 below 10 cm; pores never get near either.
      bound.push(r.bound);
      nominal.push(r.nominal);
    }
    expect(bound).toHaveLength(cv.targetCount);
    expect(matchRecordedProfile(bound, cv.profile!).allEqual).toBe(true);
    expect(matchRecordedProfile(nominal, cv.nominalProfile!).allEqual).toBe(true);
    expect(Math.max(...bound)).toBeCloseTo(cv.maxDistanceM, 3);
    expect(medianOf(bound)).toBeCloseTo(cv.medianDistanceM, 3);
  });
});

describe("picking a feature", () => {
  const f = (id: string, x: number, y: number): Feature => ({
    id,
    concern: "pore",
    shape: "spot",
    region: "whole",
    centroid: { x, y },
    bbox: { x: x - 2, y: y - 2, w: 4, h: 4 },
    areaPx: 16,
    sizeSource: "prior",
    contrast: { lum: -0.1, rg: 0 },
  });
  const set = [f("a", 100, 100), f("b", 140, 104), f("c", 100, 160), f("d", 40, 96)];

  test("nearest by box within a radius, and null beyond it", () => {
    expect(nearestFeature(set, { x: 141, y: 105 }, 10)?.id).toBe("b");
    expect(nearestFeature(set, { x: 300, y: 300 }, 10)).toBeNull();
  });

  test("a neighbour in each direction stays near its row or column, and the edge returns null", () => {
    expect(neighbourInDirection(set, set[0], "right")?.id).toBe("b");
    expect(neighbourInDirection(set, set[0], "down")?.id).toBe("c");
    expect(neighbourInDirection(set, set[0], "left")?.id).toBe("d");
    expect(neighbourInDirection(set, set[0], "up")).toBeNull();
  });

  test("stepping wraps around the list", () => {
    expect(stepFeature(set, set[3], 1)?.id).toBe("a");
    expect(stepFeature(set, set[0], -1)?.id).toBe("d");
    expect(stepFeature(set, null, 1)?.id).toBe("a");
    expect(stepFeature([], null, 1)).toBeNull();
  });
});

describe("default marks", () => {
  test("each starting mark's reaches sit inside the slider's range, with the distance between them", () => {
    const bundle = JSON.parse(fs.readFileSync("public/demo/p2b/bundle.json", "utf8")) as ReadingBundle;
    for (const [concern, id] of Object.entries(DEFAULT_MARK)) {
      const f = bundle.measurements.features.find((x) => x.id === id);
      expect(f, id).toBeDefined();
      expect(f!.concern).toBe(concern);
      const r = rawDistances(specFromTarget(f!, bundle.scale)!, bundle.viewing);
      expect(r.nominal, id).toBeGreaterThan(1.5);
      expect(r.bound, id).toBeLessThan(6);
      expect(DEFAULT_DISTANCE_M).toBeGreaterThan(r.nominal);
      expect(DEFAULT_DISTANCE_M).toBeLessThan(r.bound);
    }
  });
});

describe("difference map", () => {
  const solid = (v: number) => ({ width: 2, height: 2, data: new Uint8ClampedArray(Array.from({ length: 16 }, (_, i) => (i % 4 === 3 ? 255 : v))) });

  test("identical images differ by nothing; a lighter simulation differs by the luminance ratio", () => {
    const same = relativeLuminanceDifference(solid(120), solid(120));
    expect(Array.from(same)).toEqual([0, 0, 0, 0]);
    // sRGB 200 vs 100: linear 0.578 vs 0.127, so |a - b| / b is about 3.55
    const diff = relativeLuminanceDifference(solid(200), solid(100));
    expect(diff[0]).toBeCloseTo(0.578 / 0.127 - 1, 1);
    expect(shareAtLeast(diff, 1)).toBe(1);
    expect(shareAtLeast(same, 0.01)).toBe(0);
  });

  test("the ink ramp runs from paper to ink", () => {
    const px = differenceToInk(new Float32Array([0, 0.25, 1]), 0.25, [245, 243, 239], [22, 21, 19]);
    expect(Array.from(px.slice(0, 3))).toEqual([245, 243, 239]);
    expect(Array.from(px.slice(4, 7))).toEqual([22, 21, 19]);
    expect(Array.from(px.slice(8, 11))).toEqual([22, 21, 19]);
  });

  test("a crop keeps the pixels it covers, scaled from the frame to the image", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) data[i * 4] = i;
    const image = { width: 4, height: 4, data };
    const whole = cropRgba(image, { width: 8, height: 8 }, { x: 2, y: 2, w: 4, h: 4 }); // frame twice the image: covers pixels 1..2
    expect([whole.width, whole.height]).toEqual([2, 2]);
    expect(Array.from(whole.data).filter((_, i) => i % 4 === 0)).toEqual([5, 6, 9, 10]);
  });

  test("a 3 x 3 box mean keeps a constant plane, spreads a single bright pixel and leaves the total unchanged", () => {
    const flat = new Float32Array(25).fill(0.4);
    expect(Array.from(boxMean(flat, 5, 5, 1)).every((v) => Math.abs(v - 0.4) < 1e-6)).toBe(true);
    const one = new Float32Array(25);
    one[12] = 9;
    const blurred = boxMean(one, 5, 5, 1);
    expect(blurred[12]).toBeCloseTo(1, 6);
    expect(blurred[6]).toBeCloseTo(1, 6);
    expect(blurred[0]).toBe(0);
    expect(blurred.reduce((a, v) => a + v, 0)).toBeCloseTo(9, 4);
    expect(boxMean(one, 5, 5, 0)).toBe(one);
  });

  test("a different size is refused", () => {
    expect(() => relativeLuminanceDifference(solid(1), { width: 1, height: 1, data: new Uint8ClampedArray(4) })).toThrow();
  });
});

describe("checks and references", () => {
  const rows = buildChecks();

  test("the five analytic stimuli agree to 0.03 dB, as the page says", () => {
    expect(fiveStimuliWorstDb()).toBeLessThan(0.03);
  });

  test("every row has a result, a source and (where possible) a command; numbers come from the files", () => {
    expect(rows.map((r) => r.id)).toEqual(["replication", "csf-peak", "five-stimuli", "modelfest", "castle", "angle-law", "oracles", "scale", "determinism", "ai"]);
    for (const r of rows) {
      expect(r.result.length).toBeGreaterThan(40);
      expect(r.sources.length).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.id === "modelfest")!.result).toContain("0.69 dB RMS over 41");
    expect(rows.find((r) => r.id === "modelfest")!.result).toContain("0.78 dB over the 8");
    expect(rows.find((r) => r.id === "csf-peak")!.result).toContain("217.29");
    expect(rows.find((r) => r.id === "ai")!.result).toContain("65 real calls");
    expect(rows.find((r) => r.id === "determinism")!.result).toContain("identical");
  });

  test("references are numbered in order, keys are unique, and cited keys exist", () => {
    const keys = REFERENCES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(refNumber(keys[0])).toBe(1);
    expect(refNumber(keys[keys.length - 1])).toBe(keys.length);
    for (const r of rows) for (const c of r.cites) expect(keys).toContain(c);
    expect(() => refNumber("nobody2099")).toThrow();
    for (const r of REFERENCES) for (const l of r.links) expect(l.href).toMatch(/^https?:\/\//);
  });

  test("code links point into the repository", () => {
    expect(codeUrl("lib/vision/standard.ts")).toBe("https://github.com/ethanrom/arms-length/blob/main/lib/vision/standard.ts");
    expect(codeUrl("eval/llm-baseline")).toBe("https://github.com/ethanrom/arms-length/tree/main/eval/llm-baseline");
  });

  test("the copy linter finds nothing in the page's data strings", () => {
    const text = [...rows.flatMap((r) => [r.check, r.result, ...r.sources.map((s) => s.label)]), ...REFERENCES.flatMap((r) => [r.title ?? "", r.used, r.venue])].join("\n");
    expect(lintText(text)).toEqual([]);
  });
});
