// Smoke test on the recorded HD analyses (synthetic faces p2b and p3a): feature counts and magnitudes must land
// in the ranges the Phase 0 spike measured (internal/research/spike.md section 4). Scale is the 11.71 mm / 52 px placeholder.
import { describe, expect, test } from "vitest";
import type { Feature, Measurements } from "../contracts";
import { loadPersona } from "./fixtures-io";
import { measureAnalysis } from "./measure";

const SCALE = { mmPerPx: 11.71 / 52, relSd: 0.04, source: "assumed" as const };

const of = (m: Measurements, concern: string): Feature[] => m.features.filter((f) => f.concern === concern);
const median = (v: number[]) => v.slice().sort((a, b) => a - b)[v.length >> 1];
/** Concerns that could not be measured; the age-spot dedupe notes are not skips of a concern. */
const unmeasured = (m: Measurements) => m.skipped.filter((s) => !/inside age spots/.test(s.reason)).map((s) => s.concern);
const deduped = (m: Measurements) =>
  Object.fromEntries(m.skipped.filter((s) => s.reason.endsWith(" markers inside age spots")).map((s) => [s.concern, parseInt(s.reason, 10)]));

async function measure(persona: string) {
  const { analysis, masks, photo } = await loadPersona(persona);
  return measureAnalysis(analysis, masks, photo, SCALE);
}

describe("recorded HD analyses", () => {
  test("p2b: counts and sizes are plausible, redness is skipped", { timeout: 120_000 }, async () => {
    const m = await measure("p2b");
    expect(of(m, "age_spot").length).toBeGreaterThanOrEqual(80); // spike: 89 components
    expect(of(m, "age_spot").length).toBeLessThanOrEqual(100);
    expect(of(m, "acne").length).toBeGreaterThanOrEqual(10); // spike: 15 rings (some merged rings split)
    expect(of(m, "acne").length).toBeLessThanOrEqual(25);
    expect(of(m, "pore").length).toBeGreaterThanOrEqual(190); // spike: 201 components, dense clusters split into dots
    expect(of(m, "pore").length).toBeLessThanOrEqual(1000);
    expect(of(m, "wrinkle").length).toBeGreaterThanOrEqual(120); // spike: 229 components minus short fragments
    expect(of(m, "wrinkle").length).toBeLessThanOrEqual(229);
    expect(m.regions.filter((r) => r.concern === "dark_circle")).toHaveLength(2);
    expect(m.regions.filter((r) => r.concern === "eye_bag")).toHaveLength(2);
    expect(unmeasured(m).sort()).toEqual(["redness", "texture"]);
    expect(deduped(m)).toEqual({ pore: 7, acne: 1 }); // markers inside age spots

    const spots = of(m, "age_spot");
    expect(median(spots.map((f) => f.diameterMm!))).toBeGreaterThan(1.5); // spike: median 12.8 px = 2.9 mm here
    expect(median(spots.map((f) => f.diameterMm!))).toBeLessThan(5);
    expect(median(spots.map((f) => f.contrast.lum))).toBeLessThan(-0.1); // spike: -0.196
    expect(median(spots.map((f) => f.contrast.lum))).toBeGreaterThan(-0.3);
    expect(spots.every((f) => f.sizeSource === "mask")).toBe(true);
    expect(new Set(of(m, "pore").map((f) => f.region))).toEqual(new Set(["forehead", "nose", "cheek"]));

    const ids = m.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of m.features) {
      expect(Number.isFinite(f.contrast.lum) && Number.isFinite(f.contrast.rg)).toBe(true);
      expect((f.diameterMm ?? f.lengthMm ?? 0) > 0).toBe(true);
    }
    for (const r of m.regions) expect(r.contrast.lum).toBeLessThan(0); // under-eye regions are darker than the cheek below
  });

  test("p3a: counts are plausible and redness zones are measured", { timeout: 120_000 }, async () => {
    const m = await measure("p3a");
    expect(of(m, "age_spot").length).toBeGreaterThanOrEqual(180); // spike: 194
    expect(of(m, "age_spot").length).toBeLessThanOrEqual(205);
    expect(of(m, "acne").length).toBeGreaterThanOrEqual(5); // spike: 7
    expect(of(m, "acne").length).toBeLessThanOrEqual(12);
    expect(of(m, "pore").length).toBeGreaterThanOrEqual(170); // spike: 184
    expect(m.regions.filter((r) => r.concern === "redness").length).toBeGreaterThanOrEqual(2); // spike: 4 zones
    expect(m.regions.filter((r) => r.concern === "redness").every((r) => r.contrast.rg > 0)).toBe(true);
    expect(unmeasured(m)).toEqual(["texture"]);
    expect(deduped(m)).toEqual({ pore: 19, acne: 2 });
  });
});
