import { describe, expect, it } from "vitest";
import type { ConcernId } from "../contracts/concerns";
import type { Feature, Measurements, RegionMeasure, ScaleEstimate } from "../contracts/measure";
import { DEFAULT_VIEWING, MAX_DISTANCE_M, type ViewingConditions } from "../contracts/vision";
import { FWHM_PER_SD } from "./params";
import { buildVisibilityReport } from "./report";
import { rawDistances, specFromTarget, targetVisibility } from "./visibility";

const scale: ScaleEstimate = { mmPerPx: 0.1, relSd: 0.04, source: "iris", irisPx: 117 };
// ModelFest luminance, where the luminance factor is 1 and the research 9.4 illustrative numbers apply.
const viewing = (marginDb: number): ViewingConditions => ({ luminanceCdM2: 30, acuityScale: 1, label: "custom", marginDb });

function spot(concern: ConcernId, diameterMm: number, lum: number, extra: Partial<Feature> = {}): Feature {
  return {
    id: `${concern}:0`,
    concern,
    shape: "spot",
    region: "whole",
    centroid: { x: 0, y: 0 },
    bbox: { x: 0, y: 0, w: 1, h: 1 },
    areaPx: 10,
    diameterMm,
    sizeSource: "mask",
    contrast: { lum, rg: 0 },
    ...extra,
  };
}

function wrinkle(widthMm: number, lengthMm: number | undefined, lum: number): Feature {
  return { ...spot("wrinkle", 0, lum), shape: "line", diameterMm: undefined, widthMm, lengthMm };
}

function region(concern: ConcernId, diameterMm: number, lum: number, rg = 0): RegionMeasure {
  const areaMm2 = (Math.PI * diameterMm * diameterMm) / 4;
  return {
    id: `${concern}:0`,
    concern,
    bbox: { x: 0, y: 0, w: 1, h: 1 },
    areaPx: areaMm2 / (scale.mmPerPx * scale.mmPerPx),
    widthMm: diameterMm,
    heightMm: diameterMm,
    contrast: { lum, rg },
    reference: "cheek_band",
  };
}

const near = (value: number, target: number, tol = 0.05) => Math.abs(value / target - 1) < tol;

describe("visibility distance (research 9.4, Standard A at 30 cd/m2)", () => {
  // [description, target, nominal (margin 0) m, bound (margin 6 dB) m]
  const illustrative: [string, Feature, number, number][] = [
    ["3 mm disk at 12% Weber contrast", spot("age_spot", 3, -0.12), 3.2, 4.8],
    ["pore (Gaussian sd 0.12 mm) at 30%", spot("pore", 0.12 * FWHM_PER_SD, -0.3), 0.6, 0.88],
    ["4 mm spot at 10%", spot("age_spot", 4, -0.1), 3.9, 5.8],
    ["2 mm freckle at 15%", spot("age_spot", 2, -0.15), 2.5, 3.7],
    ["5 mm papule at 15%", spot("acne", 5, -0.15), 6.2, 9.1],
  ];
  it("reproduces the illustrative nominal / bound distances within 5%", () => {
    for (const [name, feature, nominal, bound] of illustrative) {
      const v = targetVisibility(feature, scale, viewing(6));
      expect(near(v.distanceM, bound), `${name}: bound ${v.distanceM}`).toBe(true);
      expect(near(v.nominalM as number, nominal), `${name}: nominal ${v.nominalM}`).toBe(true);
    }
  });

  it("distance increases with size, contrast and margin, scales linearly with size, and the bound is above the nominal", () => {
    const d = (diam: number, c: number, m: number) => targetVisibility(spot("age_spot", diam, -c), scale, viewing(m)).distanceM;
    for (const [a, b] of [[1, 2], [2, 4], [4, 8]]) expect(d(b, 0.1, 6)).toBeGreaterThan(d(a, 0.1, 6));
    for (const [a, b] of [[0.05, 0.1], [0.1, 0.2], [0.2, 0.4]]) expect(d(3, b, 6)).toBeGreaterThan(d(3, a, 6));
    for (const [a, b] of [[0, 3], [3, 6], [6, 9]]) expect(d(3, 0.1, b)).toBeGreaterThan(d(3, 0.1, a));
    // the bound is never below the nominal distance
    const v = targetVisibility(spot("age_spot", 3, -0.1), scale, viewing(6));
    expect(v.distanceM).toBeGreaterThan(v.nominalM as number);
    // at fixed contrast the model only sees size / distance
    const spec = (mm: number) => specFromTarget(spot("age_spot", mm, -0.1), scale)!;
    expect(rawDistances(spec(2.5), viewing(6)).bound / rawDistances(spec(1), viewing(6)).bound).toBeCloseTo(2.5, 5);
  });

  it("returns an interval from the scale uncertainty and respects the contract limits", () => {
    const v = targetVisibility(spot("age_spot", 2, -0.1), scale, viewing(6));
    expect(v.intervalM[0]).toBeCloseTo(v.distanceM * 0.96, 6);
    expect(v.intervalM[1]).toBeCloseTo(v.distanceM * 1.04, 6);
    expect(targetVisibility(spot("age_spot", 40, -0.5), scale, viewing(6)).distanceM).toBe(MAX_DISTANCE_M);
    expect(targetVisibility(spot("age_spot", 0.05, -0.01), scale, viewing(6)).distanceM).toBe(0);
    expect(targetVisibility(spot("age_spot", 0, -0.1), scale, viewing(6)).distanceM).toBe(0); // no size
  });

  it("a longer wrinkle is more visible; a dim room shortens the nominal distance, daylight does not shorten the bound", () => {
    const d = (len: number | undefined) => targetVisibility(wrinkle(0.4, len, -0.1), scale, viewing(6)).distanceM;
    expect(d(10)).toBeLessThan(d(30));
    expect(d(30)).toBeLessThan(d(undefined));
    const f = spot("age_spot", 3, -0.1);
    const dim = { ...viewing(6), luminanceCdM2: 5 };
    const bright = { ...viewing(6), luminanceCdM2: 1000 };
    expect(targetVisibility(f, scale, dim).nominalM as number).toBeLessThan(targetVisibility(f, scale, viewing(6)).nominalM as number);
    expect(targetVisibility(f, scale, dim).distanceM).toBeCloseTo(targetVisibility(f, scale, viewing(6)).distanceM, 6); // max(1, g)
    expect(targetVisibility(f, scale, bright).distanceM).toBeGreaterThan(targetVisibility(f, scale, viewing(6)).distanceM);
  });

  it("redness: a red-green contrast makes an isoluminant region visible and never shortens it", () => {
    const flat = targetVisibility(region("redness", 20, -0.01, 0), scale, DEFAULT_VIEWING);
    const red = targetVisibility(region("redness", 20, -0.01, 0.05), scale, DEFAULT_VIEWING);
    expect(red.distanceM).toBeGreaterThan(flat.distanceM);
    // a concern that is not chromatic ignores rg
    const dark = targetVisibility(region("dark_circle", 20, -0.01, 0.05), scale, DEFAULT_VIEWING);
    const darkFlat = targetVisibility(region("dark_circle", 20, -0.01, 0), scale, DEFAULT_VIEWING);
    expect(dark.distanceM).toBe(darkFlat.distanceM);
  });
});

describe("visibility report", () => {
  const measurements = (features: Feature[], regions: RegionMeasure[] = []): Measurements => ({
    scale,
    features,
    regions,
    skipped: [],
  });

  it("aggregates per concern: max, median, interval of the max target, at most 5 top targets", () => {
    const sizes = [1, 2, 3, 4, 5, 6, 7];
    const features = sizes.map((s, i) => spot("age_spot", s, -0.08, { id: `age_spot:${i}` }));
    const report = buildVisibilityReport(measurements(features), viewing(6));
    expect(report.targets).toHaveLength(7);
    const c = report.concerns.find((x) => x.concern === "age_spot")!;
    const d = report.targets.map((t) => t.distanceM);
    expect(c.targetCount).toBe(7);
    expect(c.maxDistanceM).toBe(Math.max(...d));
    expect(c.medianDistanceM).toBe([...d].sort((a, b) => a - b)[3]);
    expect(c.topTargets).toEqual(["age_spot:6", "age_spot:5", "age_spot:4", "age_spot:3", "age_spot:2"]);
    expect(c.intervalM).toEqual(report.targets.find((t) => t.targetId === "age_spot:6")!.intervalM);
  });

  it("confidence: concern base, capped by the size source of the headline target", () => {
    const conf = (concern: ConcernId, extra: Partial<Feature> = {}, s: ScaleEstimate = scale) =>
      buildVisibilityReport({ ...measurements([spot(concern, 3, -0.1, extra)]), scale: s }, viewing(6)).concerns[0].confidence;
    expect(conf("age_spot")).toBe("high");
    expect(conf("age_spot", { sizeSource: "photo" })).toBe("medium");
    expect(conf("age_spot", { sizeSource: "prior" })).toBe("low");
    expect(conf("pore")).toBe("medium");
    expect(conf("acne")).toBe("low");
    expect(conf("age_spot", {}, { ...scale, source: "assumed" })).toBe("low");
    const wr = buildVisibilityReport(measurements([wrinkle(0.4, 30, -0.1)]), viewing(6));
    expect(wr.concerns[0].confidence).toBe("high");
    const dc = buildVisibilityReport(measurements([], [region("dark_circle", 20, -0.1), region("eye_bag", 20, -0.1)]), viewing(6));
    expect(Object.fromEntries(dc.concerns.map((c) => [c.concern, c.confidence]))).toEqual({ dark_circle: "high", eye_bag: "medium" });
  });

  it("skips texture and targets without a usable size, and orders concerns most visible first", () => {
    const texture = region("texture", 30, -0.2);
    const broken = spot("age_spot", 0, -0.1, { id: "age_spot:9", diameterMm: undefined });
    const report = buildVisibilityReport(
      measurements([spot("pore", 0.3, -0.3), spot("age_spot", 5, -0.2), broken], [texture]),
      viewing(6),
    );
    expect(report.concerns.map((c) => c.concern)).toEqual(["age_spot", "pore"]);
    expect(report.targets.some((t) => t.targetId === "age_spot:9")).toBe(false);
    expect(report.viewing).toEqual(viewing(6));
  });
});
