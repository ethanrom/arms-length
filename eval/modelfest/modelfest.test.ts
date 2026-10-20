import { describe, expect, test } from "vitest";
import type { ContrastPatch, Detector } from "@/lib/contracts";
import { referenceDetector } from "../reference-detector";
import { findThresholdContrast, MODELFEST_VIEWING, runModelFest } from "./run";
import {
  ANALYTIC_STIMULI,
  EXCLUDED_STIMULI,
  MODELFEST_PX_PER_DEG,
  MODELFEST_SIZE,
  generateStimulus,
  modelfestMmPerPx,
} from "./stimuli";
import thresholds from "./thresholds.json";

const peak = (p: ContrastPatch) => p.lum.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("observed thresholds", () => {
  test("43 entries with ids 1..43 and a citation", () => {
    expect(thresholds.stimuli).toHaveLength(43);
    expect(thresholds.stimuli.map((s) => s.id)).toEqual(Array.from({ length: 43 }, (_, i) => i + 1));
    expect(thresholds.citation.paper).toContain("Watson");
  });

  test("spot values match the published per-stimulus means (dB)", () => {
    const t = (id: number) => thresholds.stimuli[id - 1].thresholdDb;
    expect(t(4)).toBeCloseTo(-42.13, 2); // most sensitive, 4 cpd Gabor
    expect(t(10)).toBeCloseTo(-11.35, 2); // 30 cpd Gabor
    expect(t(29)).toBeCloseTo(-16.61, 2); // Gaussian sd 1.05 arcmin
    expect(t(31)).toBeCloseTo(-18.68, 2); // 0.5 arcmin line
    expect(t(40)).toBeCloseTo(-32.53, 2); // 0.25 deg disk
  });
});

describe("analytic stimuli", () => {
  test("41 analytic, noise #35 and natural scene #43 excluded", () => {
    expect(ANALYTIC_STIMULI).toHaveLength(41);
    expect(EXCLUDED_STIMULI.map((s) => s.id)).toEqual([35, 43]);
  });

  test("geometry: 256 px patch, one pixel subtends 1/120 deg", () => {
    const p = generateStimulus(26);
    expect(p.width).toBe(MODELFEST_SIZE);
    expect(p.height).toBe(MODELFEST_SIZE);
    const pxDeg = (Math.atan(p.mmPerPx / 1000) * 180) / Math.PI; // viewing distance 1 m
    expect(pxDeg * MODELFEST_PX_PER_DEG).toBeCloseTo(1, 6);
    expect(modelfestMmPerPx(2)).toBeCloseTo(2 * modelfestMmPerPx(1), 9);
  });

  test("Gaussians #26-29 have the published sd (arcmin) and unit peak", () => {
    const sdArcmin: Record<number, number> = { 26: 30, 27: 8.43, 28: 2.106, 29: 1.05 };
    for (const [id, want] of Object.entries(sdArcmin)) {
      const p = generateStimulus(Number(id));
      expect(peak(p)).toBeCloseTo(1, 6);
      // Pixels sample the Gaussian exactly, so sd = dx / sqrt(-2 ln(v(dx) / v(0))) for any dx along the centre row.
      const dx = Math.max(1, Math.round(1.5 * ((want * 2) / 60) * (MODELFEST_PX_PER_DEG / 2)));
      const v = p.lum[128 * p.width + 128 + dx] / p.lum[128 * p.width + 128];
      const sdArcminMeasured = ((dx / Math.sqrt(-2 * Math.log(v))) * 60) / MODELFEST_PX_PER_DEG;
      expect(sdArcminMeasured / want).toBeCloseTo(1, 3);
    }
  });

  test("disk #40 is 0.25 deg across, uniform, unit contrast", () => {
    const p = generateStimulus(40);
    const inside = p.lum.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);
    expect(p.lum.every((v) => v === 0 || v === 1)).toBe(true);
    expect(inside / (Math.PI * 15 ** 2)).toBeCloseTo(1, 1); // radius 15 px = 0.125 deg
    // widest row spans the diameter
    let widest = 0;
    for (let y = 0; y < p.height; y++) {
      let n = 0;
      for (let x = 0; x < p.width; x++) n += p.lum[y * p.width + x];
      widest = Math.max(widest, n);
    }
    expect(widest * (1 / MODELFEST_PX_PER_DEG)).toBeCloseTo(0.25, 1);
  });
});

describe("harness", () => {
  const unit = generateStimulus(40);
  const linear = (thresholdDb: number): Detector => ({
    response: (patch) => peak(patch) * 10 ** (-thresholdDb / 20),
  });

  test("recovers a known threshold from a linear detector", () => {
    const c = findThresholdContrast(linear(-33.3), unit, MODELFEST_VIEWING, 1);
    expect(20 * Math.log10(c)).toBeCloseTo(-33.3, 2);
  });

  test("works for a non-linear (but monotone) detector", () => {
    // response = (c / 0.02)^3 crosses 1 at c = 0.02 = -33.98 dB
    const cubic: Detector = { response: (patch) => (peak(patch) / 0.02) ** 3 };
    const c = findThresholdContrast(cubic, unit, MODELFEST_VIEWING, 1);
    expect(20 * Math.log10(c)).toBeCloseTo(20 * Math.log10(0.02), 2);
  });

  test("report: errors are prediction minus observation; RMS over the subsets", () => {
    const flat = linear(-30);
    const r = runModelFest(flat, { ids: [26, 29, 40, 4] });
    expect(r.results).toHaveLength(4);
    for (const x of r.results) expect(x.errorDb).toBeCloseTo(-30 - x.observedDb, 1);
    expect(r.nSkin).toBe(3);
    expect(r.rmsSkinDb).toBeCloseTo(
      Math.sqrt(r.results.filter((x) => x.skinRelevant).reduce((a, x) => a + x.errorDb ** 2, 0) / 3),
      9,
    );
  });

  test("reference stand-in lands within 3 dB RMS on the skin-relevant shapes", () => {
    const r = runModelFest(referenceDetector, { ids: [26, 27, 28, 29, 30, 31, 32, 40] });
    expect(r.rmsSkinDb).toBeLessThan(3);
  }, 30_000);
});
