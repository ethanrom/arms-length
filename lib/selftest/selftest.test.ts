import { describe, expect, test } from "vitest";
import { MAX_DISTANCE_M, MIN_DISTANCE_M, type Detector } from "@/lib/contracts";
import { ID1_CARD_WIDTH_MM, pxPerMmFromCard } from "./calibration";
import { compareObserved, predictVanishing, vanishingDistance } from "./predict";
import { diskPatch, srgbForContrast } from "./target";

describe("calibration", () => {
  test("card width in px gives px per mm", () => {
    expect(ID1_CARD_WIDTH_MM).toBe(85.6);
    expect(pxPerMmFromCard(342.4)).toBeCloseTo(4, 9);
    expect(() => pxPerMmFromCard(0)).toThrow();
    expect(() => pxPerMmFromCard(Number.NaN)).toThrow();
  });
});

describe("target", () => {
  test("sRGB value reproduces the requested Weber contrast within 8-bit rounding", () => {
    for (const c of [0.05, 0.1, 0.3, 1, -0.2, -0.5]) {
      const d = srgbForContrast(c);
      expect(d.clipped).toBe(false);
      // one 8-bit step at mid-grey is about 1.7% in luminance
      expect(Math.abs(d.achievedContrast - c)).toBeLessThan(0.02 * (1 + c));
    }
    // 128 -> relative luminance (128/255)^2.2; +100% contrast doubles it
    const d = srgbForContrast(1);
    expect(d.srgb).toBe(Math.round(255 * (2 * (128 / 255) ** 2.2) ** (1 / 2.2)));
  });

  test("impossible contrasts are clipped and flagged", () => {
    expect(srgbForContrast(10).clipped).toBe(true);
    expect(srgbForContrast(10).srgb).toBe(255);
    expect(srgbForContrast(-1.5).srgb).toBe(0);
  });

  test("disk patch has the right area, contrast and pixel size", () => {
    const pxPerMm = 6;
    const p = diskPatch(5, 0.2, pxPerMm);
    expect(p.mmPerPx).toBeCloseTo(1 / 6, 9);
    const area = p.lum.reduce((a, v) => a + v / 0.2, 0);
    expect(area / (Math.PI * (2.5 * pxPerMm) ** 2)).toBeCloseTo(1, 2);
    expect(Math.max(...p.lum)).toBeCloseTo(0.2, 6);
  });
});

describe("prediction", () => {
  // Response falls as 1/d from `r1` at 1 m, so the target vanishes at d = r1 exactly.
  const inverse = (r1: number): Detector => ({ response: (patch, _v, d) => (Math.max(...patch.lum) > 0 ? r1 / d : 0) });
  const patch = diskPatch(4, 0.1, 5);
  const viewing = { luminanceCdM2: 100, acuityScale: 1, label: "custom" as const };

  test("vanishing distance by bisection; the margin scales distance by its gain", () => {
    const d0 = vanishingDistance(inverse(2), patch, viewing, 0);
    expect(d0).toBeCloseTo(2, 2);
    expect(vanishingDistance(inverse(2), patch, viewing, 6)).toBeCloseTo(2 * 10 ** (6 / 20), 2);
  });

  test("caps at the contract distances", () => {
    expect(vanishingDistance(inverse(1000), patch, viewing)).toBe(MAX_DISTANCE_M);
    expect(vanishingDistance(inverse(0.01), patch, viewing)).toBe(0);
    expect(MIN_DISTANCE_M).toBeLessThan(MAX_DISTANCE_M);
  });

  test("predictVanishing returns nominal below bound and uses the drawn contrast", () => {
    const seen: number[] = [];
    const spy: Detector = {
      response: (p, v, d) => {
        seen.push(Math.max(...p.lum), v.marginDb ?? -1);
        return 3 / d;
      },
    };
    const r = predictVanishing(spy, { diameterMm: 4, contrast: 0.1, pxPerMm: 5 });
    expect(r.nominalM).toBeCloseTo(3, 2);
    expect(r.boundM).toBeGreaterThan(r.nominalM);
    expect(seen[0]).toBeCloseTo(r.achievedContrast, 6);
    expect(seen.filter((_, i) => i % 2 === 1).every((m) => m === 0)).toBe(true); // detector never sees the margin
  });

  test("band comparison", () => {
    const band = { nominalM: 2, boundM: 3 };
    expect(compareObserved(1, band).side).toBe("below");
    expect(compareObserved(2.5, band)).toMatchObject({ side: "inside", inside: true });
    expect(compareObserved(3.5, band).side).toBe("above");
    expect(compareObserved(2.5, band).ratioToNominal).toBeCloseTo(1.25, 9);
  });
});
