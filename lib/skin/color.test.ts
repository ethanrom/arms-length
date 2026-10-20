import { describe, expect, test } from "vitest";
import {
  LINEAR_SRGB_TO_LMS, coneContrastRg, contrastBetween, linearLuminance, linearToLms, srgbToLinear, weberContrast,
  type ColorStat,
} from "./color";

const stat = (r: number, g: number, b: number): ColorStat => {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const [l, m] = linearToLms(lr, lg, lb);
  return { y: linearLuminance(lr, lg, lb), l, m };
};

describe("colour maths", () => {
  test("sRGB decoding and luminance anchor points", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
    expect(srgbToLinear(128)).toBeCloseTo(0.2158605, 5); // IEC 61966-2-1
    expect(linearLuminance(1, 1, 1)).toBeCloseTo(1, 5);
    expect(linearLuminance(0, 1, 0)).toBeCloseTo(0.7152, 3);
  });

  test("D65 white is equal-energy in LMS, so neutral greys have zero red-green contrast", () => {
    const [l, m, s] = linearToLms(1, 1, 1);
    expect(l).toBeCloseTo(1, 3);
    expect(m).toBeCloseTo(1, 3);
    expect(s).toBeCloseTo(1, 3);
    expect(LINEAR_SRGB_TO_LMS).toHaveLength(9);
    expect(coneContrastRg(stat(200, 200, 200), stat(90, 90, 90))).toBeCloseTo(0, 6);
  });

  test("Weber is signed and red-green contrast is positive for a redder patch at equal luminance-ish", () => {
    expect(weberContrast(0.5, 1)).toBeCloseTo(-0.5, 12);
    const skin = stat(190, 140, 120);
    const flushed = stat(205, 120, 105);
    const c = contrastBetween(flushed, skin);
    expect(c.rg).toBeGreaterThan(0.05);
    expect(contrastBetween(skin, flushed).rg).toBeLessThan(-0.05);
  });
});
