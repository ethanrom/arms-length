import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_VIEWING, type Feature, type RegionMeasure, type ScaleEstimate } from "@/lib/contracts";
import { lintText } from "@/lib/copy/lint";
import { angleDeg } from "@/lib/vision/geometry";
import { luminanceGain } from "@/lib/vision/castle";
import { blobThresholdLookup } from "@/lib/vision/tables";
import { targetVisibility } from "@/lib/vision/visibility";
import { buildReceipt, locationInPhoto, receiptSentences } from "./receipt";
import type { ReadingBundle } from "./types";

const scale: ScaleEstimate = { mmPerPx: 0.17, relSd: 0.04, source: "iris", irisPx: 69 };

const disk = (diameterMm: number, lum: number, rg = 0): Feature => ({
  id: "age_spot:0",
  concern: "age_spot",
  shape: "spot",
  region: "whole",
  centroid: { x: 10, y: 10 },
  bbox: { x: 5, y: 5, w: 10, h: 10 },
  areaPx: 78,
  diameterMm,
  sizeSource: "mask",
  contrast: { lum, rg },
  contrastBasis: "surround",
});

describe("buildReceipt", () => {
  test("the verdict is the bound: visible exactly out to targetVisibility.distanceM", () => {
    const target = disk(3, -0.2);
    const bound = targetVisibility(target, scale, DEFAULT_VIEWING).distanceM;
    expect(bound).toBeGreaterThan(1);
    expect(buildReceipt(target, scale, DEFAULT_VIEWING, bound * 0.97)!.visible).toBe(true);
    expect(buildReceipt(target, scale, DEFAULT_VIEWING, bound * 1.03)!.visible).toBe(false);
    expect(buildReceipt(target, scale, DEFAULT_VIEWING, 0.5)!.boundM).toBeCloseTo(bound, 9);
  });

  test("for a luminance spot the threshold is the shape-table value over the luminance gain and the margin", () => {
    const target = disk(3, -0.2);
    const d = 2;
    const r = buildReceipt(target, scale, DEFAULT_VIEWING, d)!;
    const theta = angleDeg(3, d);
    const gain = Math.max(1, luminanceGain(DEFAULT_VIEWING.luminanceCdM2, 1 / (4 * (theta / 4))));
    const expected = blobThresholdLookup("disk", theta) / (gain * 10 ** ((DEFAULT_VIEWING.marginDb ?? 6) / 20));
    expect(r.driver).toBe("luminance");
    expect(r.direction).toBe("darker");
    expect(r.thresholdPct / 100).toBeCloseTo(expected, 6);
    expect(r.angleArcmin).toBeCloseTo(theta * 60, 9);
    expect(r.sizeMm).toBe(3);
    expect(r.contrastPct).toBeCloseTo(20, 9);
    // has >= needed exactly when it is visible
    expect(r.contrastPct >= r.thresholdPct).toBe(r.visible);
    // A typical observer needs at least as much contrast as perfect eyes do.
    expect(r.typicalThresholdPct).toBeGreaterThan(r.thresholdPct);
    expect(r.contrastPct >= r.typicalThresholdPct).toBe(r.typicalVisible);
  });

  test("the two observers part ways between the nominal and the bound distance", () => {
    const target = disk(3, -0.2);
    const seen = targetVisibility(target, scale, DEFAULT_VIEWING);
    const between = (seen.nominalM! + seen.distanceM) / 2;
    const mid = buildReceipt(target, scale, DEFAULT_VIEWING, between)!;
    expect(mid.typicalVisible).toBe(false);
    expect(mid.visible).toBe(true);
    expect(receiptSentences(mid).verdict).toMatch(/enough for perfect eyes, but a typical person would probably not/);
    expect(receiptSentences(buildReceipt(target, scale, DEFAULT_VIEWING, seen.nominalM! * 0.9)!).verdict).toMatch(/typical sharp-eyed person looking right at it could see it/);
    expect(receiptSentences(buildReceipt(target, scale, DEFAULT_VIEWING, seen.distanceM * 1.1)!).verdict).toMatch(/even perfect eyes couldn't pick it out/);
  });

  test("a redness-style target is judged on its colour contrast", () => {
    const region: RegionMeasure = {
      id: "redness:0",
      concern: "redness",
      bbox: { x: 0, y: 0, w: 200, h: 150 },
      areaPx: 20000,
      widthMm: 34,
      heightMm: 25,
      contrast: { lum: 0.3, rg: 0.03 },
      reference: "skin_outside_zones",
      contrastBasis: "surround",
    };
    const r = buildReceipt(region, scale, DEFAULT_VIEWING, 1.5)!;
    expect(r.driver).toBe("colour");
    expect(r.direction).toBe("redder");
    expect(r.kind).toBe("area");
    expect(r.contrastPct).toBeCloseTo(3, 9);
    expect(r.contrastPct >= r.thresholdPct).toBe(r.visible);
  });

  test("the sentences carry the numbers and stay inside the content rules", () => {
    const r = buildReceipt(disk(2.9, -0.18), scale, DEFAULT_VIEWING, 1)!;
    const s = receiptSentences(r);
    expect(s.size).toContain("2.9 mm");
    expect(s.contrast).toContain("18% darker");
    expect(s.angle).toMatch(/arcmin/);
    for (const text of Object.values(s)) expect(lintText(text)).toEqual([]);
    const far = receiptSentences(buildReceipt(disk(0.4, -0.05), scale, DEFAULT_VIEWING, 6)!);
    expect(far.verdict).toMatch(/even perfect eyes couldn't pick it out/);
  });
});

describe("receipts on a recorded face", () => {
  test("every target of p2b gets the same verdict as targetVisibility at the same distance", () => {
    const file = path.join(process.cwd(), "public", "demo", "p2b", "bundle.json");
    const bundle = JSON.parse(fs.readFileSync(file, "utf8")) as ReadingBundle;
    const targets = [...bundle.measurements.features, ...bundle.measurements.regions];
    expect(targets.length).toBeGreaterThan(500);
    for (const target of targets.filter((_, i) => i % 7 === 0)) {
      const bound = targetVisibility(target, bundle.scale, bundle.viewing).distanceM;
      for (const d of [0.4, 1, 1.5, 2.5, 4, 6]) {
        const r = buildReceipt(target, bundle.scale, bundle.viewing, d)!;
        expect(r.visible, `${target.id} at ${d} m`).toBe(d <= bound);
        expect(r.typicalVisible, `${target.id} typical at ${d} m`).toBe(d <= r.typicalM);
      }
    }
  });
});

describe("locationInPhoto", () => {
  test("names the part of the picture an outline sits in", () => {
    const frame = { width: 1000, height: 1000 };
    expect(locationInPhoto({ x: 100, y: 100, w: 50, h: 50 }, frame)).toBe("in the upper left of the photo");
    expect(locationInPhoto({ x: 800, y: 800, w: 50, h: 50 }, frame)).toBe("in the lower right of the photo");
    expect(locationInPhoto({ x: 475, y: 475, w: 50, h: 50 }, frame)).toBe("in the middle of the photo");
    expect(locationInPhoto({ x: 100, y: 475, w: 50, h: 50 }, frame)).toBe("on the left side of the photo");
  });
});
