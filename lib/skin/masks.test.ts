import { describe, expect, test } from "vitest";
import { connectedComponents, fillHoles, foregroundOf, modalAlpha, analyseSkeleton, skeletonise, insideDistance } from "./masks";
import { inDisk, makeMask } from "./synth";

describe("mask decoding", () => {
  test("the modal alpha is the background, whatever its value, and foreground is what differs from it", () => {
    // HD-style: dark layer at alpha 51 with a drawn contour (200) and a transparent interior (0).
    const hd = makeMask(60, 60, 51, (x, y) => (inDisk(x, y, 30, 30, 10) ? (inDisk(x, y, 30, 30, 8.5) ? 0 : 200) : null));
    expect(modalAlpha(hd)).toBe(51);
    const fg = foregroundOf(hd);
    expect(fg.background).toBe(51);
    expect(fg.binary[30 * 60 + 30]).toBe(1); // the transparent interior differs from 51
    expect(fg.binary[2 * 60 + 2]).toBe(0);
    // alpha > 0 would be the whole frame; the modal rule isolates the spot.
    expect(fg.count).toBeLessThan(400);
    expect(connectedComponents(fg.binary, 60, 60)).toHaveLength(1);

    // Region-style: transparent background, graded alpha.
    const region = makeMask(60, 60, 0, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 20 ? 90 : null));
    const rfg = foregroundOf(region);
    expect(rfg.background).toBe(0);
    expect(rfg.count).toBe(200);
    expect(rfg.diff[15 * 60 + 15]).toBe(90);

    // A mask with a single alpha value has no foreground (the empty redness mask).
    expect(foregroundOf(makeMask(20, 20, 51, () => null)).count).toBe(0);
  });

  test("hole filling turns an outline into a filled spot, but leaves oversized holes and border regions", () => {
    const w = 50;
    const ring = makeMask(w, w, 0, (x, y) => (inDisk(x, y, 25, 25, 10) && !inDisk(x, y, 25, 25, 8) ? 255 : null));
    const outline = foregroundOf(ring).binary;
    expect(outline[25 * w + 25]).toBe(0);
    const filled = fillHoles(outline, w, w);
    expect(filled[25 * w + 25]).toBe(1);
    const area = filled.reduce((a, v) => a + v, 0);
    expect(area).toBeGreaterThan(Math.PI * 9.5 ** 2 * 0.95);
    expect(area).toBeLessThan(Math.PI * 10.5 ** 2 * 1.05);
    expect(fillHoles(outline, w, w, 50)[25 * w + 25]).toBe(0); // hole of ~200 px exceeds the cap
    // background that reaches the border is not a hole
    const open = new Uint8Array(w * w);
    for (let x = 10; x < 30; x++) open[10 * w + x] = open[30 * w + x] = 1;
    expect(fillHoles(open, w, w).reduce((a, v) => a + v, 0)).toBe(40);
  });

  test("components use 8-connectivity and report area, bbox and centroid", () => {
    const w = 10;
    const bin = new Uint8Array(w * w);
    for (const [x, y] of [[1, 1], [2, 2], [3, 3]]) bin[y * w + x] = 1; // a diagonal: one 8-component
    bin[7 * w + 7] = 1;
    const comps = connectedComponents(bin, w, w);
    expect(comps.map((c) => c.area)).toEqual([3, 1]);
    expect(comps[0].bbox).toEqual({ x: 1, y: 1, w: 3, h: 3 });
    expect(comps[0].centroid).toEqual({ x: 2, y: 2 });
    expect(connectedComponents(bin, w, w, { connectivity: 4 })).toHaveLength(4);
  });

  test("skeleton length and distance-transform width of a plain stroke", () => {
    const w = 120;
    const h = 20;
    const bin = new Uint8Array(w * h);
    for (let y = 8; y < 11; y++) for (let x = 20; x < 100; x++) bin[y * w + x] = 1; // 80 x 3 px
    const skel = skeletonise(bin, w, h);
    const info = analyseSkeleton(skel, w, h);
    expect(info.longestPath).toBeGreaterThan(80 * 0.94);
    expect(info.longestPath).toBeLessThan(80 * 1.02);
    const inside = insideDistance(bin, w, h);
    const mid = info.pixels.find((p) => p % w === 60)!;
    expect(2 * inside[mid] - 1).toBeCloseTo(3, 5);
  });
});
