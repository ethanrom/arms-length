import { describe, expect, it } from "vitest";
import {
  channelSensitivities,
  coneSensitivity,
  discConeSensitivity,
  discSensitivity,
  luminanceGain,
  type Vec3,
} from "./castle";

/**
 * Rows of data/data_aggregated_merged.csv in gfxdisp/castleCSF (MIT; static, foveal). `python` is log10 cone
 * sensitivity from the research agent's numpy port of the same MATLAB model (D:/tmp/vs_research/scripts/castle_port.py),
 * which reproduces the paper's per-dataset errors; `measured` is the dataset's own value (log10).
 */
const gaborRows: { name: string; f: number; area: number; bg: Vec3; delta: Vec3; python: number; measured: number }[] = [
  {
    name: "modelfest 4 cpd (achromatic)",
    f: 4,
    area: 0.0490873852123405,
    bg: [22.042358911094, 9.48847419092029, 0.624601155209565],
    delta: [0.530531524006579, 0.228375497074065, 0.0150333548285897],
    python: 1.430673,
    measured: 1.6185,
  },
  {
    name: "kim2013 0.25 cpd (red-green)",
    f: 0.25,
    area: 28.2743338823081,
    bg: [27.9629261171483, 12.0370738828517, 0.792368730872086],
    delta: [0.0337394644882822, -0.0289958585731608, -0.00040503941010097],
    python: 2.746801,
    measured: 2.8005,
  },
  {
    name: "colorfest 1.2 cpd",
    f: 1.2,
    area: 0.785398163397448,
    bg: [27.4744764134073, 12.5255235865927, 0.955148484552597],
    delta: [0.380453040629148, 0.176561584915993, 0.0298661184975204],
    python: 1.610464,
    measured: 1.6705,
  },
];

const discRows = [
  {
    name: "hdr_csf_disc radius 0.083 deg",
    radius: 0.0833333333333333,
    bg: [13.7372382067036, 6.26276179329636, 0.477574242276299] as Vec3,
    delta: [0.136536878906227, 0.0633643713276697, 0.0107183441035233] as Vec3,
    python: 1.897719,
    measured: 1.8145,
  },
  {
    name: "hdr_csf_disc radius 0.25 deg",
    radius: 0.25,
    bg: [13.7372382067036, 6.26276179329636, 0.477574242276299] as Vec3,
    delta: [0.109704675036382, 0.0509120160140825, 0.00861197697079867] as Vec3,
    python: 2.056156,
    measured: 1.9095,
  },
];

describe("castleCSF static foveal port", () => {
  it.each(gaborRows)("Gabor row $name equals the reference port and is within 4 dB of the data", (row) => {
    const log = Math.log10(coneSensitivity(row.f, row.area, row.bg, row.delta));
    expect(Math.abs(log - row.python)).toBeLessThan(1e-4);
    expect(Math.abs(20 * (log - row.measured))).toBeLessThan(4);
  });

  it.each(discRows)("disc row $name equals the reference port (k_r = 2 pi) and is within 3.5 dB of the data", (row) => {
    const log = Math.log10(discConeSensitivity(row.radius, row.bg, row.delta));
    expect(Math.abs(log - row.python)).toBeLessThan(1e-4);
    expect(Math.abs(20 * (log - row.measured))).toBeLessThan(3.5);
  });

  it("channel sensitivities at 100 cd/m2, area 1 deg2, 4 cpd match the reference port", () => {
    const s = channelSensitivities(4, 1, 100);
    expect(s.ach).toBeCloseTo(134.278, 2);
    expect(s.rg).toBeCloseTo(148.895, 2);
    expect(s.yv).toBeCloseTo(14.759, 2);
  });

  it("luminance factor at 4 cpd follows research 9.2 (0.45, 0.73, 1.00, 1.22, 1.33, 1.38)", () => {
    const expected = [0.4476, 0.7318, 1, 1.2226, 1.3326, 1.376];
    [3, 10, 30, 100, 300, 1000].forEach((L, i) => expect(luminanceGain(L, 4)).toBeCloseTo(expected[i], 3));
  });

  it("disc sensitivity is continuous at 0.083 deg and falls as r^2 below it", () => {
    const edge = 0.083;
    const above = discSensitivity("rg", edge * 1.0001, 45);
    const below = discSensitivity("rg", edge * 0.9999, 45);
    expect(below / above).toBeCloseTo(1, 3);
    expect(discSensitivity("rg", edge / 4, 45) / discSensitivity("rg", edge / 2, 45)).toBeCloseTo(0.25, 6);
  });
});
