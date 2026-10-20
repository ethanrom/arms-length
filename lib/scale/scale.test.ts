import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { Point } from "@/lib/contracts";
import { syntheticFace } from "@/lib/capture/testing";
import {
  estimateCardScale,
  estimateIrisScale,
  IRIS_DIAMETER_MM,
  IRIS_POPULATION_REL_SD,
  irisDiametersPx,
  rescaleEstimate,
} from "@/lib/scale";

const size = { width: 1600, height: 900 };
const box = { x: 400, y: 100, w: 700, h: 700 };

describe("iris scale", () => {
  test("mm per pixel is 11.71 over the mean iris diameter, in a non-square image", () => {
    const lm = syntheticFace({ size, box, irisPx: [60, 64] });
    const [a, b] = irisDiametersPx(lm, size);
    expect(a).toBeCloseTo(60, 6);
    expect(b).toBeCloseTo(64, 6);
    const est = estimateIrisScale(lm, size)!;
    expect(est.source).toBe("iris");
    expect(est.irisPx).toBeCloseTo(62, 6);
    expect(est.mmPerPx).toBeCloseTo(11.71 / 62, 8);
  });

  test("relSd adds population spread and landmark error in quadrature", () => {
    const est = estimateIrisScale(syntheticFace({ size, box, irisPx: 100 }), size)!;
    // 1 px per edge: sqrt(2) px per eye, divided by sqrt(2) for two eyes = 1 px of 100.
    expect(est.relSd).toBeCloseTo(Math.hypot(0.42 / 11.71, 0.01), 8);
    expect(IRIS_POPULATION_REL_SD).toBeCloseTo(0.0359, 3);
    expect(est.relSd).toBeGreaterThan(0.036);
    expect(est.relSd).toBeLessThan(0.04);
  });

  test("a smaller iris (webcam) has a larger landmark term; one eye is worse than two", () => {
    const two = estimateIrisScale(syntheticFace({ size, box, irisPx: 30 }), size)!;
    const one = estimateIrisScale(syntheticFace({ size, box, irisPx: [30, NaN] }), size)!;
    expect(two.relSd).toBeGreaterThan(estimateIrisScale(syntheticFace({ size, box, irisPx: 100 }), size)!.relSd);
    expect(one.relSd).toBeGreaterThan(two.relSd);
    expect(one.irisPx).toBeCloseTo(30, 6);
  });

  test("eyes that disagree widen the uncertainty beyond the modelled edge error", () => {
    const agree = estimateIrisScale(syntheticFace({ size, box, irisPx: [100, 100] }), size)!;
    const differ = estimateIrisScale(syntheticFace({ size, box, irisPx: [90, 110] }), size)!;
    expect(differ.relSd).toBeGreaterThan(agree.relSd);
    expect(differ.irisPx).toBeCloseTo(100, 6);
  });

  test("picks the horizontal diameter even if the ring starts at the vertical point", () => {
    const lm = syntheticFace({ size, box, irisPx: 80 });
    for (const ring of [[469, 470, 471, 472], [474, 475, 476, 477]]) {
      const pts = ring.map((i) => lm[i]);
      ring.forEach((i, k) => (lm[i] = pts[(k + 1) % 4])); // rotate the ring order by one
    }
    expect(estimateIrisScale(lm, size)!.irisPx).toBeCloseTo(80, 6);
  });

  test("returns null without a usable iris", () => {
    expect(estimateIrisScale([], size)).toBeNull();
    expect(estimateIrisScale(syntheticFace({ size, box }).slice(0, 468), size)).toBeNull();
    expect(estimateIrisScale(syntheticFace({ size, box, irisPx: [NaN, NaN] }), size)).toBeNull();
    expect(estimateIrisScale(syntheticFace({ size, box, irisPx: 0 }), size)).toBeNull();
  });

  test("rescaling to a resampled image keeps the physical size of a pixel-run consistent", () => {
    const est = estimateIrisScale(syntheticFace({ size, box, irisPx: 100 }), size)!;
    const half = rescaleEstimate(est, 0.5);
    expect(half.irisPx).toBeCloseTo(50, 8);
    expect(half.mmPerPx).toBeCloseTo(est.mmPerPx * 2, 10);
    expect(half.relSd).toBe(est.relSd);
    expect(half.irisPx! * half.mmPerPx).toBeCloseTo(IRIS_DIAMETER_MM, 8);
    expect(() => rescaleEstimate(est, 0)).toThrow();
  });
});

describe("card scale", () => {
  const corners = (pxPerMm: number, angleDeg = 0, squashShort = 1) => {
    const L = 85.6 * pxPerMm;
    const S = 53.98 * pxPerMm * squashShort;
    const a = (angleDeg * Math.PI) / 180;
    return [
      [0, 0],
      [L, 0],
      [L, S],
      [0, S],
    ].map(([x, y]) => ({
      x: 300 + x * Math.cos(a) - y * Math.sin(a),
      y: 200 + x * Math.sin(a) + y * Math.cos(a),
    })) as unknown as [Point, Point, Point, Point];
  };

  test("recovers mm per pixel from a flat card, rotated or not", () => {
    for (const angle of [0, 25, 90, -140]) {
      const est = estimateCardScale(corners(4, angle))!;
      expect(est.source).toBe("card");
      expect(est.mmPerPx).toBeCloseTo(0.25, 6);
      expect(est.relSd).toBeLessThan(0.01);
    }
  });

  test("a tilted card still gives a scale but says so in relSd", () => {
    const flat = estimateCardScale(corners(4))!;
    const tilted = estimateCardScale(corners(4, 0, 0.9))!;
    expect(tilted.relSd).toBeGreaterThan(flat.relSd);
    expect(tilted.mmPerPx).toBeGreaterThan(0.25);
    expect(tilted.mmPerPx).toBeLessThan(0.27);
  });

  test("rejects shapes that are not an ID-1 card", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ] as const;
    expect(estimateCardScale([...square])).toBeNull();
    expect(estimateCardScale(corners(4, 0, 0.6))).toBeNull();
  });

  test("the card is more certain than the iris", () => {
    const iris = estimateIrisScale(syntheticFace({ size, box, irisPx: 100 }), size)!;
    expect(estimateCardScale(corners(4))!.relSd).toBeLessThan(iris.relSd / 4);
  });
});

describe("committed fixture scales", () => {
  const root = path.join(process.cwd(), "fixtures", "youcam");
  const personas = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "scale.json")))
    .map((d) => d.name);

  test.each(personas)("%s scale.json is consistent with the iris ruler", (persona) => {
    const s = JSON.parse(fs.readFileSync(path.join(root, persona, "scale.json"), "utf8"));
    expect(s.source).toBe("iris");
    expect(s.mmPerPx * s.irisPx).toBeCloseTo(IRIS_DIAMETER_MM, 2);
    expect(s.relSd).toBeGreaterThan(0.036);
    expect(s.relSd).toBeLessThan(0.05);
    // The adult interpupillary distance is about 63 mm (SD about 3.5 mm).
    expect(s.interpupillaryMm).toBeGreaterThan(52);
    expect(s.interpupillaryMm).toBeLessThan(74);
  });
});
