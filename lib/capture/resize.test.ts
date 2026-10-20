import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Box } from "@/lib/contracts";
import { MAX_LONG, MAX_UPSCALE, planResize } from "./resize";

const faceAt = (cx: number, cy: number, w: number, aspect = 1.3): Box => ({
  x: cx - w / 2,
  y: cy - (w * aspect) / 2,
  w,
  h: w * aspect,
});

describe("planResize", () => {
  test("a big phone portrait is cropped to the face and downscaled to a 1080 short side", () => {
    const plan = planResize(3024, 4032, faceAt(1512, 1900, 1500));
    expect(plan.engine).toBe("hd");
    expect(plan.ok).toBe(true);
    expect(plan.target.width).toBe(1080);
    expect(plan.target.height).toBeLessThanOrEqual(MAX_LONG);
    expect(plan.scale).toBeLessThan(1);
    expect(plan.faceFraction).toBeCloseTo(0.7, 2);
    // Crop is the 4:5 frame around the face, centred on it.
    expect(plan.crop.w).toBeCloseTo(1500 / 0.7, -1);
    expect(plan.crop.h).toBeCloseTo((1500 / 0.7) * 1.25, -1);
  });

  test("a huge landscape photo is downscaled, never beyond the long-side limit", () => {
    const plan = planResize(8000, 6000, faceAt(4000, 3000, 2400));
    expect(plan.engine).toBe("hd");
    expect(Math.min(plan.target.width, plan.target.height)).toBe(1080);
    expect(Math.max(plan.target.width, plan.target.height)).toBeLessThanOrEqual(1919);
  });

  test("a 720p webcam frame gives SD at native resolution (no upscale)", () => {
    const plan = planResize(1280, 720, faceAt(640, 360, 380));
    expect(plan.engine).toBe("sd");
    expect(plan.ok).toBe(true);
    expect(plan.scale).toBe(1);
    expect(plan.crop.h).toBeLessThanOrEqual(720);
    expect(Math.min(plan.target.width, plan.target.height)).toBeGreaterThanOrEqual(480);
    expect(plan.faceFraction).toBeGreaterThanOrEqual(0.6);
  });

  test("a face that nearly fills a short frame keeps its whole head and stays inside the photo", () => {
    const plan = planResize(1280, 720, faceAt(640, 360, 480));
    expect(plan.crop.y).toBe(0);
    expect(plan.crop.h).toBe(720);
    expect(plan.crop.x).toBeGreaterThanOrEqual(0);
    expect(plan.crop.x + plan.crop.w).toBeLessThanOrEqual(1280);
  });

  test("upscaling is capped at 1.25x: a 900 px crop reaches HD, an 800 px crop does not", () => {
    const hd = planResize(1200, 1500, faceAt(600, 750, 900 * 0.7));
    expect(hd.engine).toBe("hd");
    expect(hd.scale).toBeLessThanOrEqual(MAX_UPSCALE + 1e-9);
    expect(hd.target.width).toBe(1080);

    const sd = planResize(1200, 1500, faceAt(600, 750, 800 * 0.7));
    expect(sd.engine).toBe("sd");
    expect(sd.scale).toBe(1);
    expect(sd.target.width).toBe(sd.crop.w);
  });

  test("a frame too small even for SD is flagged, upscaling only 1.25x", () => {
    const plan = planResize(400, 300, faceAt(200, 150, 160));
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe("source_too_small");
    expect(plan.scale).toBeLessThanOrEqual(MAX_UPSCALE + 1e-9);
  });

  test("a face near the edge shifts the crop inward instead of padding", () => {
    const plan = planResize(3000, 4000, faceAt(300, 2000, 500));
    expect(plan.crop.x).toBe(0);
    expect(plan.crop.x + plan.crop.w).toBeLessThanOrEqual(3000);
  });

  test("invalid input is reported, not thrown", () => {
    expect(planResize(0, 0, { x: 0, y: 0, w: 10, h: 10 }).ok).toBe(false);
    expect(planResize(1000, 1000, { x: 0, y: 0, w: NaN, h: 10 }).reason).toBe("invalid_input");
  });

  test("invariants hold for any photo and face", () => {
    const sourceAndFace = fc
      .record({
        srcW: fc.integer({ min: 200, max: 8000 }),
        srcH: fc.integer({ min: 200, max: 8000 }),
        faceH: fc.double({ min: 0.1, max: 0.95, noNaN: true }),
        aspect: fc.double({ min: 1.15, max: 1.5, noNaN: true }),
        px: fc.double({ min: 0, max: 1, noNaN: true }),
        py: fc.double({ min: 0, max: 1, noNaN: true }),
      })
      .map(({ srcW, srcH, faceH, aspect, px, py }) => {
        const h = faceH * srcH;
        const w = Math.min(h / aspect, srcW * 0.95);
        return { srcW, srcH, face: { x: px * (srcW - w), y: py * (srcH - h), w, h } };
      });
    fc.assert(
      fc.property(sourceAndFace, ({ srcW, srcH, face }) => {
        const p = planResize(srcW, srcH, face);
        const { crop, target } = p;
        const tol = 1.5;
        expect(crop.x).toBeGreaterThanOrEqual(0);
        expect(crop.y).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.w).toBeLessThanOrEqual(srcW);
        expect(crop.y + crop.h).toBeLessThanOrEqual(srcH);
        // The crop contains the whole face.
        expect(crop.x).toBeLessThanOrEqual(face.x + tol);
        expect(crop.y).toBeLessThanOrEqual(face.y + tol);
        expect(crop.x + crop.w).toBeGreaterThanOrEqual(face.x + face.w - tol);
        expect(crop.y + crop.h).toBeGreaterThanOrEqual(face.y + face.h - tol);
        if (p.ok) {
          expect(Math.max(target.width, target.height)).toBeLessThanOrEqual(MAX_LONG);
          expect(target.width / crop.w).toBeLessThanOrEqual(MAX_UPSCALE + 1 / crop.w);
          expect(p.faceFraction).toBeGreaterThan(0.6);
        }
        if (p.engine === "hd") {
          expect(p.ok).toBe(true);
          expect(Math.min(target.width, target.height)).toBe(1080);
        }
      }),
      { numRuns: 400 },
    );
  });
});
