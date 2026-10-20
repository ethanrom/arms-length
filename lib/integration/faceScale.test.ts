import { describe, expect, test } from "vitest";
import { faceScaleAt } from "./faceScale";

describe("faceScaleAt", () => {
  test("full size up to the selfie, then a gentle shrink that never goes below 0.6", () => {
    expect(faceScaleAt(0.25)).toBe(1);
    expect(faceScaleAt(0.3)).toBe(1);
    expect(faceScaleAt(1)).toBeCloseTo(Math.pow(0.3, 0.2), 9);
    expect(faceScaleAt(6)).toBe(0.6);
    const scales = [0.3, 0.6, 1, 1.5, 2.5, 4, 6].map(faceScaleAt);
    expect([...scales].sort((a, b) => b - a)).toEqual(scales);
  });
});
