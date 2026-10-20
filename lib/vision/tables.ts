/**
 * Runtime lookup of the precomputed unit-contrast thresholds (tables/*.json, built by scripts/vision/build-tables.ts
 * from the standard model, Standard A at the ModelFest luminance of 30 cd/m^2). Interpolation is linear in
 * log(size) - log(threshold). Beyond the small end the exact small-feature asymptote is used (threshold
 * proportional to 1/area: slope -2 for blobs, -1 for line width); beyond the large end the table's last value
 * (the response saturates once the feature fills the aperture).
 */
import disk from "./tables/disk.json";
import gaussian from "./tables/gaussian.json";
import line from "./tables/line.json";
import lineLength from "./tables/lineLength.json";
import patch from "./tables/patch.json";
import softDisk from "./tables/softDisk.json";
import type { BlobShape } from "./shapes";

interface Table1D {
  sizeMin: number;
  sizeMax: number;
  n: number;
  log10T: number[];
}

interface TableLine2D {
  widthMin: number;
  widthMax: number;
  nWidth: number;
  lengthMin: number;
  lengthMax: number;
  nLength: number;
  log10T: number[];
}

interface TablePatch {
  f0Min: number;
  f0Max: number;
  n: number;
  log10T: number[];
}

const BLOB_TABLES: Record<BlobShape, Table1D> = { gaussian, disk, softDisk };
const LINE_TABLE: Table1D = line;
const LINE_2D: TableLine2D = lineLength;
const PATCH_TABLE: TablePatch = patch;

/** Position of x on a log grid of n points between min and max, as a real index. */
function logIndex(x: number, min: number, max: number, n: number): number {
  return ((Math.log(x / min) / Math.log(max / min)) * (n - 1));
}

function interp1(values: number[], idx: number): number {
  const i = Math.min(values.length - 2, Math.max(0, Math.floor(idx)));
  const t = idx - i;
  return values[i] * (1 - t) + values[i + 1] * t;
}

function lookup1D(table: Table1D, sizeArcmin: number, smallSlope: number): number {
  const idx = logIndex(sizeArcmin, table.sizeMin, table.sizeMax, table.n);
  if (idx <= 0) return table.log10T[0] + smallSlope * Math.log10(sizeArcmin / table.sizeMin);
  if (idx >= table.n - 1) return table.log10T[table.n - 1];
  return interp1(table.log10T, idx);
}

/** Contrast threshold of a unit-peak Gaussian blob (sd), uniform disk or soft disk (equal-area diameter), degrees. */
export function blobThresholdLookup(shape: BlobShape, sizeDeg: number): number {
  return Math.pow(10, lookup1D(BLOB_TABLES[shape], sizeDeg * 60, -2));
}

/** Contrast threshold of an infinitely long line of width `widthDeg`. */
export function lineThresholdInfiniteLookup(widthDeg: number): number {
  return Math.pow(10, lookup1D(LINE_TABLE, widthDeg * 60, -1));
}

/**
 * Contrast threshold of a line of width `widthDeg` and length `lengthDeg`. Length below the width is treated as a
 * square; lengths beyond the table (6 degrees, past the aperture) use the infinite-line table. For widths below the
 * table the width asymptote (threshold proportional to 1/width) applies.
 */
export function lineThresholdLookup(widthDeg: number, lengthDeg: number): number {
  const t = LINE_2D;
  const length = Math.max(lengthDeg, widthDeg) * 60;
  if (length >= t.lengthMax) return lineThresholdInfiniteLookup(widthDeg);
  let width = widthDeg * 60;
  let extra = 0; // log10 correction for widths below the table
  if (width < t.widthMin) {
    extra = -Math.log10(width / t.widthMin);
    width = t.widthMin;
  }
  width = Math.min(width, t.widthMax);
  const l = Math.max(length, width);
  const iw = Math.min(t.nWidth - 2, Math.max(0, Math.floor(logIndex(width, t.widthMin, t.widthMax, t.nWidth))));
  const il = Math.min(t.nLength - 2, Math.max(0, Math.floor(logIndex(l, t.lengthMin, t.lengthMax, t.nLength))));
  const fw = logIndex(width, t.widthMin, t.widthMax, t.nWidth) - iw;
  const fl = logIndex(l, t.lengthMin, t.lengthMax, t.nLength) - il;
  const at = (a: number, b: number) => t.log10T[a * t.nLength + b];
  const v =
    at(iw, il) * (1 - fw) * (1 - fl) +
    at(iw + 1, il) * fw * (1 - fl) +
    at(iw, il + 1) * (1 - fw) * fl +
    at(iw + 1, il + 1) * fw * fl;
  return Math.pow(10, v + extra);
}

/** Contrast threshold of a 1-octave Gabor patch at carrier frequency f0 (cpd); "patch CSF" thresholds for Peli. */
export function patchThresholdLookup(f0: number): number {
  const t = PATCH_TABLE;
  const idx = logIndex(f0, t.f0Min, t.f0Max, t.n);
  if (idx <= 0) return Math.pow(10, t.log10T[0]);
  if (idx >= t.n - 1) {
    // Continue the steep high-frequency rise with the slope of the last segment.
    const slope = (t.log10T[t.n - 1] - t.log10T[t.n - 2]) / (Math.log10(t.f0Max / t.f0Min) / (t.n - 1));
    return Math.pow(10, t.log10T[t.n - 1] + slope * Math.log10(f0 / t.f0Max));
  }
  return Math.pow(10, interp1(t.log10T, idx));
}
