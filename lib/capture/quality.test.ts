import { describe, expect, test } from "vitest";
import { lumaStats } from "./light";
import { poseFromMatrix } from "./pose";
import { assessQuality, guidance, type QualityInput } from "./quality";
import { poseMatrix, syntheticFace } from "./testing";

const size = { width: 3000, height: 4000 };
const box = { x: 700, y: 1100, w: 1600, h: 2000 };
const goodLuma = { mean: 120, clippedFraction: 0.002 };

const input = (over: Partial<QualityInput> & { face?: Parameters<typeof syntheticFace>[0] } = {}): QualityInput => ({
  landmarks: syntheticFace(over.face ?? { size, box }),
  size,
  matrix: poseMatrix(2, 3),
  luma: goodLuma,
  ...over,
});

const failing = (q: ReturnType<typeof assessQuality>) => q.checks.filter((c) => !c.ok).map((c) => c.id);

describe("pose", () => {
  test("reads yaw and pitch magnitudes from the transformation matrix", () => {
    const p = poseFromMatrix(poseMatrix(-14, 0))!;
    expect(p.yawDeg).toBeCloseTo(14, 6);
    expect(p.pitchDeg).toBeCloseTo(0, 6);
    const q = poseFromMatrix(poseMatrix(0, 12, 3.7))!; // uniform scale is ignored
    expect(q.pitchDeg).toBeCloseTo(12, 6);
    expect(q.yawDeg).toBeCloseTo(0, 6);
    expect(poseFromMatrix([])).toBeNull();
  });
});

describe("lumaStats", () => {
  test("mean and clipped share over the face box only", () => {
    const w = 4;
    const h = 2;
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    // Left half black, right half white.
    for (let y = 0; y < h; y++) for (let x = 0; x < 2; x++) px.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
    const all = lumaStats(px, w, h);
    expect(all.mean).toBeCloseTo(127.5, 1);
    expect(all.clippedFraction).toBeCloseTo(0.5, 6);
    const right = lumaStats(px, w, h, { x: 2, y: 0, w: 2, h: 2 });
    expect(right.mean).toBeCloseTo(255, 6);
    expect(right.clippedFraction).toBe(1);
  });
});

describe("assessQuality", () => {
  test("a frontal, open-eyed, well-lit face passes and reports HD for a big photo", () => {
    const q = assessQuality(input());
    expect(q.ok).toBe(true);
    expect(q.usable).toBe(true);
    expect(q.engine).toBe("hd");
    expect(q.faceWidthFraction).toBeGreaterThan(0.6);
    expect(q.irisFraction).toBeCloseTo(0.085, 3);
    expect(guidance(q)).toBeNull();
  });

  test("no face is unusable and says so", () => {
    const q = assessQuality(null);
    expect(q.usable).toBe(false);
    expect(guidance(q)).toMatch(/can't find a face/i);
  });

  test("a small face in a webcam frame fails size with 'Move closer'", () => {
    const webcam = { width: 640, height: 480 };
    const q = assessQuality(
      input({ size: webcam, face: { size: webcam, box: { x: 280, y: 200, w: 80, h: 100 } } }),
    );
    expect(failing(q)).toContain("size");
    expect(q.usable).toBe(false);
    expect(guidance(q)).toBe("Move closer.");
  });

  test("a 720p webcam face passes at SD", () => {
    const webcam = { width: 1280, height: 720 };
    const q = assessQuality(
      input({ size: webcam, face: { size: webcam, box: { x: 450, y: 120, w: 380, h: 480 } } }),
    );
    expect(q.ok).toBe(true);
    expect(q.engine).toBe("sd");
  });

  test("a face cut off by the frame edge fails inFrame", () => {
    const q = assessQuality(input({ face: { size, box: { ...box, x: -50 } } }));
    expect(failing(q)).toEqual(["inFrame"]);
    expect(q.usable).toBe(false);
  });

  test("yaw and pitch beyond 10 degrees fail frontal, but stay usable", () => {
    expect(assessQuality(input({ matrix: poseMatrix(9, 9) })).ok).toBe(true);
    for (const matrix of [poseMatrix(12, 0), poseMatrix(0, -11)]) {
      const q = assessQuality(input({ matrix }));
      expect(failing(q)).toEqual(["frontal"]);
      expect(q.usable).toBe(true);
      expect(guidance(q)).toBe("Face the camera straight on.");
    }
  });

  test("closed eyes fail the eyes check", () => {
    const q = assessQuality(input({ face: { size, box, eyeOpenness: 0.06 } }));
    expect(failing(q)).toEqual(["eyes"]);
    expect(q.eyeOpenness).toBeCloseTo(0.06, 6);
    expect(assessQuality(input({ face: { size, box, eyeOpenness: 0.2 } })).ok).toBe(true);
  });

  test("lighting: dark, washed out and clipped all fail with the right advice", () => {
    const dark = assessQuality(input({ luma: { mean: 30, clippedFraction: 0 } }));
    expect(failing(dark)).toEqual(["lighting"]);
    expect(guidance(dark)).toMatch(/more light/i);
    // Deep skin in decent light (mean about 60) must pass.
    expect(assessQuality(input({ luma: { mean: 60, clippedFraction: 0 } })).ok).toBe(true);
    const glare = assessQuality(input({ luma: { mean: 150, clippedFraction: 0.08 } }));
    expect(failing(glare)).toEqual(["lighting"]);
    expect(guidance(glare)).toMatch(/bright|glary/i);
    expect(failing(assessQuality(input({ luma: { mean: 230, clippedFraction: 0.01 } })))).toEqual(["lighting"]);
  });

  test("an implausibly small iris (sunglasses, a bad fit) fails the hard iris check", () => {
    const q = assessQuality(input({ face: { size, box, irisPx: 40 } }));
    expect(failing(q)).toEqual(["iris"]);
    expect(q.usable).toBe(false);
  });

  test("guidance names one issue at a time, most important first", () => {
    const q = assessQuality(input({ matrix: poseMatrix(20, 0), luma: { mean: 20, clippedFraction: 0 } }));
    expect(failing(q).sort()).toEqual(["frontal", "lighting"]);
    expect(guidance(q)).toBe("Face the camera straight on.");
  });
});
