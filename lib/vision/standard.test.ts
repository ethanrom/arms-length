import { describe, expect, it } from "vitest";
import { standardDetector, synthesizePatch } from "./detector";
import { STANDARD_A, STANDARD_B } from "./params";
import { blobThreshold, gaborPatchThreshold, lineThreshold, lineThresholdInfinite } from "./shapes";
import { csf, modelResponse } from "./standard";
import { blobThresholdLookup, lineThresholdLookup } from "./tables";

const db = (x: number) => 20 * Math.log10(x);

function peak(P: typeof STANDARD_A) {
  let best = 0;
  let at = 0;
  for (let f = 0.05; f <= 30; f += 0.001) {
    const s = csf(f, P);
    if (s > best) {
      best = s;
      at = f;
    }
  }
  return { best, at };
}

describe("Watson & Ahumada standard model", () => {
  it("CSF peaks match the paper (A 217.3 at 3.45 cpd, B 289.0 at 3.62 cpd)", () => {
    const a = peak(STANDARD_A);
    expect(a.best).toBeCloseTo(217.29, 1);
    expect(a.at).toBeCloseTo(3.45, 1);
    const b = peak(STANDARD_B);
    expect(b.best).toBeCloseTo(288.98, 1);
    expect(b.at).toBeCloseTo(3.62, 1);
  });

  // Research 9.5 item 2 / 1.6: analytic predictions of Standard A for ModelFest #26-29 and #40 (dB, Weber contrast),
  // reproduced by the research agent's numpy scripts (wa_proto.py); observed means in brackets are -16.61, -24.17,
  // -30.52, -32.73 and -32.53.
  const modelFest: [string, "gaussian" | "disk", number, number][] = [
    ["#29 Gaussian sd 1.05'", "gaussian", 1.05 / 60, -16.302],
    ["#28 Gaussian sd 2.106'", "gaussian", 2.106 / 60, -24.146],
    ["#27 Gaussian sd 8.43'", "gaussian", 8.43 / 60, -30.63],
    ["#26 Gaussian sd 30'", "gaussian", 0.5, -32.865],
    ["#40 disk 0.25 deg", "disk", 0.25, -33.007],
  ];
  it.each(modelFest)("%s is within 0.1 dB of the research prediction", (_name, shape, size, expected) => {
    expect(Math.abs(db(blobThreshold(shape, size)) - expected)).toBeLessThan(0.1);
    // and the runtime lookup tables agree with the direct computation
    expect(Math.abs(db(blobThresholdLookup(shape, size)) - expected)).toBeLessThan(0.1);
  });

  it("the image-domain pipeline (FFT of a sampled 256 x 256 image) agrees with the analytic one", () => {
    const n = 256;
    const s = 2.106 / 60;
    const img = new Float64Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const r2 = ((x - n / 2) ** 2 + (y - n / 2) ** 2) / 120 ** 2;
        img[y * n + x] = Math.exp(-r2 / (2 * s * s));
      }
    expect(Math.abs(db(1 / modelResponse(img, n, 120)) - -24.146)).toBeLessThan(0.1);
  });

  it("tables reproduce direct computation off the grid points (0.05 dB blobs, 0.1 dB lines)", () => {
    const blobs: ["gaussian" | "disk" | "softDisk", number][] = [
      ["gaussian", 0.37 / 60],
      ["gaussian", 17 / 60],
      ["gaussian", 2.3],
      ["disk", 1.3 / 60],
      ["disk", 0.25],
      ["disk", 1.5],
      ["softDisk", 0.6],
    ];
    for (const [shape, size] of blobs) {
      expect(Math.abs(db(blobThresholdLookup(shape, size)) - db(blobThreshold(shape, size)))).toBeLessThan(0.05);
    }
    const lines: [number, number][] = [
      [0.7 / 60, 10 / 60],
      [2.5 / 60, 1],
      [0.15 / 60, 5],
      [0.01 / 60, 0.2],
    ];
    for (const [w, l] of lines) {
      expect(Math.abs(db(lineThresholdLookup(w, l)) - db(lineThreshold(w, l)))).toBeLessThan(0.1);
    }
  });

  it("thresholds never decrease as angular size decreases (blobs to 0.5 deg, disks to 1 deg)", () => {
    for (const [shape, top] of [["gaussian", 0.5], ["disk", 1], ["softDisk", 1]] as const) {
      let previous = 0;
      for (let size = top; size > 0.01 / 60; size /= 1.07) {
        const t = blobThresholdLookup(shape, size);
        expect(t).toBeGreaterThanOrEqual(previous * (1 - 1e-9));
        previous = t;
      }
    }
  });

  it("finite lines converge to the infinite line; the long-line recipe predicts ModelFest #31 (-16.73 dB)", () => {
    const w = 0.5 / 60;
    const inf = lineThresholdInfinite(w);
    expect(Math.abs(db(lineThreshold(w, 4)) - db(inf))).toBeLessThan(0.05);
    expect(lineThreshold(w, 0.25)).toBeGreaterThan(lineThreshold(w, 1));
    // #31 is a 0.5' line under a Gaussian window of sd 0.5 deg along its length: scale the pooled length analytically.
    const { beta, sigma } = STANDARD_A;
    const pInf = sigma * Math.sqrt((2 * Math.PI) / beta);
    const pWin = Math.sqrt((2 * Math.PI) / (beta * (1 / 0.25 + 1 / (sigma * sigma))));
    expect(Math.abs(db(inf * Math.pow(pInf / pWin, 1 / beta)) - -16.73)).toBeLessThan(0.3);
  });

  it("patch CSF (1-octave Gabor) matches the Standard A predictions for ModelFest #11-14", () => {
    const expected: [number, number][] = [
      [2, -36.01],
      [4, -32.62],
      [8, -23.82],
      [16, -9.67],
    ];
    for (const [f0, dB] of expected) expect(Math.abs(db(gaborPatchThreshold(f0)) - dB)).toBeLessThan(0.1);
  });

  it("Detector.response is 1 at the nominal and bound distances of a 3 mm, 12% disk and falls with distance", () => {
    const patch = synthesizePatch("disk", 3, 0.12, 0.05);
    const nominal = { luminanceCdM2: 30, acuityScale: 1, label: "custom" as const, marginDb: 0 };
    const bound = { ...nominal, marginDb: 6 };
    expect(standardDetector.response(patch, nominal, 3.234)).toBeCloseTo(1, 1);
    expect(Math.abs(standardDetector.response(patch, bound, 4.845) - 1)).toBeLessThan(0.05);
    let previous = Infinity;
    for (const d of [0.5, 1, 2, 3, 4, 6, 10]) {
      const r = standardDetector.response(patch, nominal, d);
      expect(r).toBeLessThan(previous);
      previous = r;
    }
  });
});
