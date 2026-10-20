import { describe, expect, it } from "vitest";
import { diskTruth } from "./ours";
import { diskColour, linearToSrgb, luminance, PATCH_PX, PX_PER_MM, renderPatchRaw, rulerSvg, SKIN_SRGB, srgbToLinear, weber } from "./patches";
import { extractJsonObject, factorOutside, toMetres } from "./stats";

describe("Test B patch generation", () => {
  it("transfer function round-trips and matches the sRGB reference points", () => {
    expect(srgbToLinear(255)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(128)).toBeCloseTo(0.2158605, 6); // IEC 61966-2-1
    for (const c of [0, 5, 10, 64, 128, 200, 255]) expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 9);
  });

  it("realises the requested Weber contrast in linear light after 8-bit quantisation", () => {
    for (const c of [0.05, 0.15, 0.3]) {
      const disk = diskColour(SKIN_SRGB, -c);
      expect(Math.abs(weber(disk, SKIN_SRGB) + c)).toBeLessThan(5e-4);
      expect(luminance(disk)).toBeLessThan(luminance(SKIN_SRGB));
    }
    // 5% darker in linear light is not 5% lower in sRGB code values.
    expect(diskColour(SKIN_SRGB, -0.3)[1] / SKIN_SRGB[1]).toBeGreaterThan(0.75);
  });

  it("draws the disk at 10 px/mm: diameter and equal-area diameter in pixels", () => {
    for (const d of [1, 2, 4]) {
      const p = renderPatchRaw({ id: `d${d}`, diameterMm: d, contrast: 0.3 });
      expect(p.width).toBe(PATCH_PX);
      const row = PATCH_PX / 2;
      const at = (x: number, y: number) => p.rgb[(y * PATCH_PX + x) * 3 + 1];
      let run = 0;
      for (let x = 0; x < PATCH_PX; x++) if (at(x, row) !== p.skin[1]) run++;
      expect(Math.abs(run - d * PX_PER_MM)).toBeLessThanOrEqual(2);

      // Area from the green channel's drop in linear light, edge pixels included.
      const bg = srgbToLinear(p.skin[1]);
      const full = bg - srgbToLinear(p.disk[1]);
      let area = 0;
      for (let y = 0; y < PATCH_PX; y++) for (let x = 0; x < PATCH_PX; x++) area += (bg - srgbToLinear(at(x, y))) / full;
      const diameterPx = 2 * Math.sqrt(area / Math.PI);
      expect(Math.abs(diameterPx / (d * PX_PER_MM) - 1)).toBeLessThan(0.02);
    }
  });

  it("prints a tick for every millimetre of the 60 mm patch", () => {
    expect((rulerSvg().match(/<line /g) ?? []).length).toBe(61);
  });
});

describe("ground truth and reply parsing", () => {
  it("the model's distance scales exactly with size at fixed contrast (the law the LLM is tested on)", () => {
    for (const c of [0.05, 0.15, 0.3]) {
      const [a, b, d] = [1, 2, 4].map((mm) => diskTruth(mm, c));
      expect(b.nominalM / a.nominalM).toBeCloseTo(2, 6);
      expect(d.boundM / b.boundM).toBeCloseTo(2, 6);
      expect(a.boundM).toBeGreaterThan(a.nominalM);
    }
  });

  it("reads JSON replies and distances robustly", () => {
    expect(extractJsonObject('```json\n{"distance_m": 3.5, "reasoning_short": "a {b} c"}\n```')).toEqual({ distance_m: 3.5, reasoning_short: "a {b} c" });
    expect(extractJsonObject("no json here")).toBeNull();
    expect(toMetres(2)).toBe(2);
    expect(toMetres("~1.5 m")).toBe(1.5);
    expect(toMetres("40 cm")).toBeCloseTo(0.4, 12);
    expect(toMetres("null")).toBeNull();
    expect(toMetres("2-3 m")).toBeUndefined();
    expect(toMetres(-1)).toBeUndefined();
    expect(factorOutside(3, 1, 2)).toBeCloseTo(1.5, 12);
    expect(factorOutside(0.5, 1, 2)).toBeCloseTo(2, 12);
    expect(factorOutside(1.5, 1, 2)).toBe(1);
  });
});
