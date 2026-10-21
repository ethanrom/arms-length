import { describe, expect, test } from "vitest";
import type { Feature, RegionMeasure, TargetVisibility } from "@/lib/contracts";
import { concernCrop, loupePatch, paddedBox } from "./crops";

const frame = { width: 1000, height: 1250 };

const pore = (i: number, x: number, y: number): Feature => ({
  id: `pore:${i}`,
  concern: "pore",
  shape: "spot",
  region: "whole",
  centroid: { x, y },
  bbox: { x: x - 2, y: y - 2, w: 4, h: 4 },
  areaPx: 12,
  diameterMm: 0.5,
  sizeSource: "photo",
  contrast: { lum: -0.1, rg: 0 },
});

const visibility = (f: Feature, nominalM: number): TargetVisibility => ({
  targetId: f.id,
  concern: f.concern,
  distanceM: nominalM * 1.5,
  nominalM,
  intervalM: [nominalM, nominalM * 2],
});

const inside = (f: Feature, p: { x: number; y: number; w: number; h: number }) =>
  f.centroid.x >= p.x && f.centroid.x <= p.x + p.w && f.centroid.y >= p.y && f.centroid.y <= p.y + p.h;

describe("loupePatch", () => {
  test("picks the cheek patch with the most marks that fade, inside the frame", () => {
    // a scatter over the face, and a dense cluster on the lower left cheek
    const scatter = Array.from({ length: 120 }, (_, i) => pore(i, 250 + ((i * 37) % 500), 350 + ((i * 53) % 650)));
    const cluster = Array.from({ length: 60 }, (_, i) => pore(1000 + i, 330 + (i % 10) * 6, 640 + Math.floor(i / 10) * 6));
    const features = [...scatter, ...cluster];
    const patch = loupePatch(
      features,
      features.map((f) => visibility(f, 1.2)),
      frame,
    );
    expect(patch.x).toBeGreaterThanOrEqual(0);
    expect(patch.y).toBeGreaterThanOrEqual(0);
    expect(patch.x + patch.w).toBeLessThanOrEqual(frame.width);
    expect(patch.y + patch.h).toBeLessThanOrEqual(frame.height);
    expect(patch.w / patch.h).toBeCloseTo(4 / 3, 6);
    expect(cluster.filter((f) => inside(f, patch)).length).toBeGreaterThan(40);
  });

  test("marks that stay visible however far you step back count for less", () => {
    const steady = Array.from({ length: 30 }, (_, i) => pore(i, 300 + (i % 6) * 8, 600 + Math.floor(i / 6) * 8));
    const fading = Array.from({ length: 12 }, (_, i) => pore(100 + i, 650 + (i % 4) * 8, 800 + Math.floor(i / 4) * 8));
    const features = [...steady, ...fading];
    const targets = features.map((f) => visibility(f, Number(f.id.split(":")[1]) < 30 ? 9 : 1.2));
    const patch = loupePatch(features, targets, frame);
    expect(fading.every((f) => inside(f, patch))).toBe(true);
  });

  test("falls back to the middle of the face when nothing was found", () => {
    const patch = loupePatch([], [], frame);
    expect(patch.x + patch.w / 2).toBeCloseTo(frame.width / 2, 6);
  });
});

describe("concernCrop", () => {
  test("an area concern gets a box round all its areas", () => {
    const region = (id: string, x: number): RegionMeasure => ({
      id,
      concern: "dark_circle",
      bbox: { x, y: 500, w: 160, h: 70 },
      areaPx: 8000,
      widthMm: 27,
      heightMm: 12,
      contrast: { lum: -0.2, rg: 0 },
      reference: "simulation",
    });
    const crop = concernCrop("dark_circle", [region("dark_circle:0", 250), region("dark_circle:1", 600)], frame);
    expect(crop.x).toBeLessThanOrEqual(250);
    expect(crop.x + crop.w).toBeGreaterThanOrEqual(760);
    expect(crop.w / crop.h).toBeLessThanOrEqual(2.4 + 1e-9);
  });

  test("paddedBox stays inside the frame", () => {
    const box = paddedBox({ x: 950, y: 1200, w: 40, h: 40 }, frame, 1, 1, 2);
    expect(box.x + box.w).toBeLessThanOrEqual(frame.width);
    expect(box.y + box.h).toBeLessThanOrEqual(frame.height);
  });
});
