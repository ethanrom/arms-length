import { describe, expect, test } from "vitest";
import { orientationToApply, orientedDraw, readJpegInfo, type ExifOrientation } from "./exif";

/** Minimal JPEG header: SOI, APP1 Exif with one orientation entry, SOF0 with the stored size, then SOS. */
function jpeg(orientation: number | null, width: number, height: number, little: boolean): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (orientation !== null) {
    const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
    const u32 = (v: number) => (little ? [v & 255, (v >> 8) & 255, 0, 0] : [0, 0, (v >> 8) & 255, v & 255]);
    const tiff = [
      ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
      ...u16(0x002a),
      ...u32(8),
      ...u16(1), // one entry
      ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0,
      ...u32(0), // no next IFD
    ];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    parts.push(0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body);
  }
  parts.push(0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0);
  parts.push(0xff, 0xda, 0, 2);
  return new Uint8Array(parts);
}

describe("readJpegInfo", () => {
  test.each([true, false])("reads orientation and stored size (little-endian: %s)", (little) => {
    expect(readJpegInfo(jpeg(6, 4032, 3024, little))).toEqual({ orientation: 6, width: 4032, height: 3024 });
  });

  test("defaults to 1 for no EXIF, junk, a bad value, or not a JPEG", () => {
    expect(readJpegInfo(jpeg(null, 100, 50, true)).orientation).toBe(1);
    expect(readJpegInfo(jpeg(9, 100, 50, true)).orientation).toBe(1);
    expect(readJpegInfo(new Uint8Array([1, 2, 3, 4, 5, 6])).orientation).toBe(1);
    expect(readJpegInfo(new Uint8Array(0)).orientation).toBe(1);
    expect(readJpegInfo(jpeg(6, 100, 50, true).slice(0, 12)).orientation).toBe(1); // truncated
  });
});

describe("orientationToApply", () => {
  const info = readJpegInfo(jpeg(6, 4032, 3024, true));
  test("rotates when the decoded bitmap still has the stored (sideways) size", () => {
    expect(orientationToApply(info, { width: 4032, height: 3024 })).toBe(6);
  });
  test("does nothing when the browser already applied it", () => {
    expect(orientationToApply(info, { width: 3024, height: 4032 })).toBe(1);
  });
  test("does nothing for upright photos", () => {
    expect(orientationToApply(readJpegInfo(jpeg(1, 4032, 3024, true)), { width: 4032, height: 3024 })).toBe(1);
  });
});

describe("orientedDraw", () => {
  // A raw w x h bitmap; apply the transform to the raw top-left corner and bottom-right corner.
  const apply = (o: ExifOrientation, x: number, y: number) => {
    const { matrix: [a, b, c, d, e, f] } = orientedDraw(o, 40, 30);
    return [a * x + c * y + e, b * x + d * y + f];
  };

  test("rotating 90 degrees clockwise (6) swaps the canvas size and moves top-left to top-right", () => {
    const d = orientedDraw(6, 40, 30);
    expect([d.width, d.height]).toEqual([30, 40]);
    expect(apply(6, 0, 0)).toEqual([30, 0]);
    expect(apply(6, 40, 30)).toEqual([0, 40]);
  });

  test("8 moves top-left to bottom-left, 3 to bottom-right, 2 to top-right", () => {
    expect(apply(8, 0, 0)).toEqual([0, 40]);
    expect(apply(3, 0, 0)).toEqual([40, 30]);
    expect(apply(2, 0, 0)).toEqual([40, 0]);
    expect(apply(4, 0, 0)).toEqual([0, 30]);
  });

  test("every orientation keeps both corners inside the output canvas", () => {
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as ExifOrientation[]) {
      const { width, height } = orientedDraw(o, 40, 30);
      for (const [x, y] of [[0, 0], [40, 0], [0, 30], [40, 30]]) {
        const [px, py] = apply(o, x, y);
        expect(px).toBeGreaterThanOrEqual(0);
        expect(px).toBeLessThanOrEqual(width);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(py).toBeLessThanOrEqual(height);
      }
    }
  });
});
