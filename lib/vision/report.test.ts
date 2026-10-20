import { describe, expect, it } from "vitest";
import type { Feature, Measurements, RegionMeasure, ScaleEstimate } from "../contracts/measure";
import { DEFAULT_VIEWING, PROFILE_DISTANCES_M } from "../contracts/vision";
import { buildVisibilityReport, detectabilityProfile } from "./report";

describe("detectabilityProfile", () => {
  it("counts targets whose bound reaches each fixed distance, inclusive, with the share of all targets", () => {
    // 0 = vanished before the minimum distance; 10 = the cap.
    const profile = detectabilityProfile([0, 0.3, 0.6, 0.99, 1, 1.5, 2.4, 10]);
    expect(profile.map((p) => p.distanceM)).toEqual([...PROFILE_DISTANCES_M]);
    const count = (d: number) => profile.find((p) => p.distanceM === d)!;
    expect(PROFILE_DISTANCES_M.map((d) => count(d).count)).toEqual([7, 7, 6, 4, 3, 1, 1, 1]);
    expect(count(1.5)).toEqual({ distanceM: 1.5, count: 3, fraction: 3 / 8 });
    // Non-increasing in distance, all in [0, 1].
    for (let i = 1; i < profile.length; i++) expect(profile[i].count).toBeLessThanOrEqual(profile[i - 1].count);
  });

  it("is all zeros for nothing", () => {
    expect(detectabilityProfile([]).every((p) => p.count === 0 && p.fraction === 0)).toBe(true);
  });
});

describe("profile in the visibility report", () => {
  const scale: ScaleEstimate = { mmPerPx: 0.1, relSd: 0.04, source: "iris", irisPx: 117 };
  const spot = (i: number, diameterMm: number): Feature => ({
    id: `age_spot:${i}`,
    concern: "age_spot",
    shape: "spot",
    region: "whole",
    centroid: { x: 0, y: 0 },
    bbox: { x: 0, y: 0, w: 1, h: 1 },
    areaPx: 10,
    diameterMm,
    sizeSource: "mask",
    contrast: { lum: -0.12, rg: 0 },
  });
  const zone = (i: number, widthMm: number): RegionMeasure => ({
    id: `dark_circle:${i}`,
    concern: "dark_circle",
    bbox: { x: 0, y: 0, w: 1, h: 1 },
    areaPx: (Math.PI * widthMm * widthMm) / 4 / (scale.mmPerPx * scale.mmPerPx),
    widthMm,
    heightMm: widthMm,
    contrast: { lum: -0.3, rg: 0 },
    reference: "cheek_band",
  });
  const measurements: Measurements = {
    scale,
    features: [0.2, 0.5, 1, 2, 3, 4, 6, 8].map((d, i) => spot(i, d)),
    regions: [zone(0, 30), zone(1, 40)],
    skipped: [],
  };

  it("matches the per-target bound distances, for features and for regions", () => {
    const report = buildVisibilityReport(measurements, DEFAULT_VIEWING);
    for (const c of report.concerns) {
      const distances = report.targets.filter((t) => t.concern === c.concern).map((t) => t.distanceM);
      expect(c.profile).toHaveLength(PROFILE_DISTANCES_M.length);
      for (const p of c.profile!) {
        expect(p.count).toBe(distances.filter((x) => x >= p.distanceM).length);
        expect(p.fraction).toBeCloseTo(p.count / c.targetCount, 12);
      }
    }
    const spots = report.concerns.find((c) => c.concern === "age_spot")!;
    // Bigger spots are seen from farther: the share falls as the observer steps back, and is not all-or-nothing.
    const counts = spots.profile!.map((p) => p.count);
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1]);
    expect(counts[0]).toBeLessThanOrEqual(8);
    expect(counts[counts.length - 1]).toBeGreaterThan(0);
    const circles = report.concerns.find((c) => c.concern === "dark_circle")!;
    expect(circles.profile!.every((p) => p.count === 2)).toBe(true);
  });
});
