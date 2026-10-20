/**
 * Analytic ModelFest stimuli (Watson & Ahumada 2005, J. Vision 5(9):6, Table 1; ModelFest consortium
 * StimuliTable). Each is generated at unit contrast (peak |c| = 1) from its published definition, so no
 * stimulus image has to be shipped (the images carry no stated licence).
 *
 * Conventions: 256 x 256 px, 120 px/deg (1 px = 0.5 arcmin), pixel (128,128) counting from 0 is the stimulus
 * centre, contrast c = (L - L0) / L0. Gabors are modulated vertically (90 deg) in cosine phase unless stated.
 *
 * Where Table 1 of the paper and the released images disagree, the images win (checked pixel by pixel with
 * scripts/eval/check-stimuli.ts, which needs a local copy of the images). Differences found:
 *  - "1 octave" Gabors have sd = 0.56 / f0 deg. The "0.5 octave" (by) of #15-17 and the "2 octave" entries of
 *    #18 and #20 are all sd = 1.12 / f0 deg in the images.
 *  - The disk (#40) is centred on pixel (126,126) and the Gabor strings (#33, #34) on (127,127), not (128,128).
 *    Offsets of 1-2 px (0.5-1 arcmin) against a 0.6 deg aperture are immaterial to the detector.
 *  - The checkerboard (#42) is a lattice of diamonds: sign(cos(2 pi 2 (x+y))) * sign(cos(2 pi 2 (x-y))), whose
 *    fundamental is 4 cpd along x and y.
 *
 * Not generated: #35 (binary noise, one random draw) and #43 (natural scene). Neither is a parametric shape.
 */
import type { ContrastPatch } from "@/lib/contracts";

export const MODELFEST_SIZE = 256;
export const MODELFEST_PX_PER_DEG = 120;
/** Pixel (128,128), counting from 0, is the stimulus centre in the ModelFest images. */
export const MODELFEST_CENTRE_PX = 128;
/** Any distance works as long as mm/px matches; 1 m is just a convenient value. */
export const MODELFEST_DISTANCE_M = 1;

/** Physical pixel size that makes one pixel subtend 1/120 deg at `distanceM`. */
export function modelfestMmPerPx(distanceM: number = MODELFEST_DISTANCE_M): number {
  return distanceM * 1000 * Math.tan((Math.PI / 180) / MODELFEST_PX_PER_DEG);
}

export type StimulusFamily =
  | "gabor" // fixed-size and fixed-cycles Gabors, oriented Gabors
  | "gabor-elongated" // elongated Gabors and baguettes
  | "gabor-compound" // compounds, collinear strings, plaids
  | "blob"
  | "disk"
  | "line"
  | "edge"
  | "pattern" // Bessel, checkerboard
  | "noise"
  | "natural";

export interface ModelFestStimulus {
  id: number;
  name: string;
  family: StimulusFamily;
  /** Same shapes as skin features: Gaussian blobs, disk, line, dipole, edge (#26-32, #40). */
  skinRelevant: boolean;
  /** Unit-contrast image on the 256 x 256 grid; null where no analytic definition exists. */
  build: (() => Float32Array) | null;
  excludedReason?: string;
}

const DEG = Math.PI / 180;

/** Envelope sd of a Gabor in degrees for carrier `f0` cpd: one-octave bandwidth, and the wider envelope of #15-21. */
const sd1Oct = (f0: number): number => 0.56 / f0;
const sd2x = (f0: number): number => 1.12 / f0;

/** Bessel J0 (Abramowitz & Stegun 9.4.1 and 9.4.3, |error| < 1e-7). */
export function besselJ0(x: number): number {
  const ax = Math.abs(x);
  if (ax <= 3) {
    const t = (ax / 3) ** 2;
    return (
      1 +
      t * (-2.2499997 + t * (1.2656208 + t * (-0.3163866 + t * (0.0444479 + t * (-0.0039444 + t * 0.00021)))))
    );
  }
  const t = 3 / ax;
  const f0 =
    0.79788456 +
    t * (-0.00000077 + t * (-0.0055274 + t * (-0.00009512 + t * (0.00137237 + t * (-0.00072805 + t * 0.00014476)))));
  const th =
    ax -
    0.78539816 +
    t * (-0.04166397 + t * (-0.00003954 + t * (0.00262573 + t * (-0.00054125 + t * (-0.00029333 + t * 0.00013558)))));
  return (f0 * Math.cos(th)) / Math.sqrt(ax);
}

type XY = (xDeg: number, yDeg: number, col: number, row: number) => number;

/** Samples `fn` at pixel centres; x to the right, y downward, both in degrees from pixel `centrePx`. */
function sample(fn: XY, centrePx: number = MODELFEST_CENTRE_PX): Float32Array {
  const out = new Float32Array(MODELFEST_SIZE * MODELFEST_SIZE);
  for (let row = 0; row < MODELFEST_SIZE; row++) {
    for (let col = 0; col < MODELFEST_SIZE; col++) {
      out[row * MODELFEST_SIZE + col] = fn(
        (col - centrePx) / MODELFEST_PX_PER_DEG,
        (row - centrePx) / MODELFEST_PX_PER_DEG,
        col,
        row,
      );
    }
  }
  return out;
}

const gauss2 = (x: number, y: number, sx: number, sy: number): number =>
  Math.exp(-(x * x) / (2 * sx * sx) - (y * y) / (2 * sy * sy));

function add(a: Float32Array, b: Float32Array, wb = 1): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + wb * b[i];
  return out;
}

interface GaborOpts {
  f: number;
  sx: number;
  sy: number;
  /** Direction of carrier modulation, deg from +x; 90 = modulated vertically (the ModelFest default). */
  orientationDeg?: number;
  phase?: number;
  amp?: number;
  /** Envelope centre offset along x in degrees. */
  dx?: number;
  /** Stimulus centre pixel; 128 unless the original image differs. */
  centrePx?: number;
}

function gabor(o: GaborOpts): Float32Array {
  const th = (o.orientationDeg ?? 90) * DEG;
  const [cs, sn] = [Math.cos(th), Math.sin(th)];
  const amp = o.amp ?? 1;
  const dx = o.dx ?? 0;
  return sample((x0, y) => {
    const x = x0 - dx;
    return amp * gauss2(x, y, o.sx, o.sy) * Math.cos(2 * Math.PI * o.f * (x * cs + y * sn) + (o.phase ?? 0));
  }, o.centrePx);
}

const S05 = 0.5; // sx = sy = 0.5 deg for the fixed-size stimuli

function fixedSize(f: number): () => Float32Array {
  return () => gabor({ f, sx: S05, sy: S05 });
}
function fixedCycles(f: number): () => Float32Array {
  const s = sd1Oct(f);
  return () => gabor({ f, sx: s, sy: s });
}
function compound(f1: number, f2: number): () => Float32Array {
  // Two equal components, each at half amplitude, so the peak of the sum is 1.
  return () => add(gabor({ f: f1, sx: S05, sy: S05, amp: 0.5 }), gabor({ f: f2, sx: S05, sy: S05, amp: 0.5 }));
}
function gaussianBlob(sdArcmin: number): () => Float32Array {
  const s = sdArcmin / 60;
  return () => sample((x, y) => gauss2(x, y, s, s));
}
function gaborString(alternate: boolean): () => Float32Array {
  const s = sd1Oct(8);
  return () => {
    let acc: Float32Array = new Float32Array(MODELFEST_SIZE * MODELFEST_SIZE);
    for (let k = -2; k <= 2; k++) {
      const phase = alternate && Math.abs(k) % 2 === 1 ? Math.PI : 0;
      acc = add(acc, gabor({ f: 8, sx: s, sy: s, dx: 5 * s * k, centrePx: 127, phase }));
    }
    return acc;
  };
}

const NOT_PARAMETRIC = "random or photographic pixel content, not defined by parameters";

export const MODELFEST_STIMULI: readonly ModelFestStimulus[] = (() => {
  const s: ModelFestStimulus[] = [];
  const push = (
    id: number,
    name: string,
    family: StimulusFamily,
    build: (() => Float32Array) | null,
    skinRelevant = false,
    excludedReason?: string,
  ) => s.push({ id, name, family, skinRelevant, build, excludedReason });

  // Frequencies as listed (rounded) in the table: the images use these values, not exact powers of sqrt 2.
  [1.12, 2, 2.83, 4, 5.66, 8, 11.3, 16, 22.6, 30].forEach((f, i) =>
    push(i + 1, `Gabor fixed size ${f} cpd`, "gabor", fixedSize(f)),
  );
  [2, 4, 8, 16].forEach((f, i) => push(11 + i, `Gabor 1-octave ${f} cpd`, "gabor", fixedCycles(f)));

  [4, 8, 16].forEach((f, i) =>
    push(15 + i, `Elongated Gabor ${f} cpd`, "gabor-elongated", () =>
      gabor({ f, sx: S05, sy: sd2x(f) }),
    ),
  );
  push(18, "Baguette 4 cpd (bx 2 oct, by 1 oct)", "gabor-elongated", () =>
    gabor({ f: 4, sx: sd2x(4), sy: sd1Oct(4) }),
  );
  push(19, "Baguette 4 cpd (sx 0.5 deg, by 1 oct)", "gabor-elongated", () =>
    gabor({ f: 4, sx: S05, sy: sd1Oct(4) }),
  );
  push(20, "Baguette 4 cpd (bx 1 oct, by 2 oct)", "gabor-elongated", () =>
    gabor({ f: 4, sx: sd1Oct(4), sy: sd2x(4) }),
  );
  push(21, "Baguette 4 cpd (bx 1 oct, sy 0.5 deg)", "gabor-elongated", () =>
    gabor({ f: 4, sx: sd1Oct(4), sy: S05 }),
  );

  push(22, "Compound Gabor 2 + 2.83 cpd", "gabor-compound", compound(2, 2 * Math.SQRT2));
  push(23, "Compound Gabor 2 + 4 cpd", "gabor-compound", compound(2, 4));
  push(24, "Compound Gabor 4 + 5.66 cpd", "gabor-compound", compound(4, 4 * Math.SQRT2));
  push(25, "Compound Gabor 4 + 8 cpd", "gabor-compound", compound(4, 8));

  push(26, "Gaussian sd 30 arcmin", "blob", gaussianBlob(30), true);
  push(27, "Gaussian sd 8.43 arcmin", "blob", gaussianBlob(8.43), true);
  push(28, "Gaussian sd 2.106 arcmin", "blob", gaussianBlob(2.106), true);
  push(29, "Gaussian sd 1.05 arcmin", "blob", gaussianBlob(1.05), true);

  // Step edge from -1 to +1 across the centre row, windowed by a 0.5 deg Gaussian.
  push(
    30,
    "Edge x Gaussian",
    "edge",
    () => sample((x, y, _c, row) => (row < MODELFEST_CENTRE_PX ? -1 : 1) * gauss2(x, y, S05, S05)),
    true,
  );
  // One-pixel (0.5 arcmin) horizontal line, increment.
  push(
    31,
    "Line 0.5 arcmin x Gaussian",
    "line",
    () => sample((x, y, _c, row) => (row === MODELFEST_CENTRE_PX ? 1 : 0) * gauss2(x, y, S05, S05)),
    true,
  );
  // Three pixels wide: +1 two rows above the centre, -1 on the centre row (as in the original image).
  push(
    32,
    "Dipole 3 px x Gaussian",
    "line",
    () =>
      sample(
        (x, y, _c, row) =>
          (row === MODELFEST_CENTRE_PX - 2 ? 1 : row === MODELFEST_CENTRE_PX ? -1 : 0) * gauss2(x, y, S05, S05),
      ),
    true,
  );

  push(33, "5 collinear Gabors 8 cpd, in phase", "gabor-compound", gaborString(false));
  push(34, "5 collinear Gabors 8 cpd, out of phase", "gabor-compound", gaborString(true));
  push(35, "Binary noise 1 arcmin x Gaussian", "noise", null, false, NOT_PARAMETRIC);

  const s4 = sd1Oct(4);
  push(36, "Gabor 4 cpd, 45 deg", "gabor", () => gabor({ f: 4, sx: s4, sy: s4, orientationDeg: 45 }));
  push(37, "Gabor 4 cpd, 0 deg", "gabor", () => gabor({ f: 4, sx: s4, sy: s4, orientationDeg: 0 }));
  push(38, "Gabor plaid 4 cpd, 0 + 90 deg", "gabor-compound", () =>
    add(
      gabor({ f: 4, sx: s4, sy: s4, orientationDeg: 0, amp: 0.5 }),
      gabor({ f: 4, sx: s4, sy: s4, orientationDeg: 90, amp: 0.5 }),
    ),
  );
  push(39, "Gabor plaid 4 cpd, 45 + 90 deg", "gabor-compound", () =>
    add(
      gabor({ f: 4, sx: s4, sy: s4, orientationDeg: 45, amp: 0.5 }),
      gabor({ f: 4, sx: s4, sy: s4, orientationDeg: 90, amp: 0.5 }),
    ),
  );

  // Uniform increment disk of diameter 0.25 deg (radius 15 px); a pixel is in if its centre is inside.
  push(
    40,
    "Disk 0.25 deg diameter",
    "disk",
    () => {
      const r = 0.125 * MODELFEST_PX_PER_DEG;
      return sample((_x, _y, col, row) => ((col - 126) ** 2 + (row - 126) ** 2 < r * r ? 1 : 0));
    },
    true,
  );
  push(41, "Bessel x Gaussian 4 cpd", "pattern", () =>
    sample((x, y) => besselJ0(2 * Math.PI * 4 * Math.hypot(x, y)) * gauss2(x, y, S05, S05)),
  );
  push(42, "Checkerboard x Gaussian 4 cpd", "pattern", () => {
    // Square wave of period 60 px in x+y and in x-y; integer arithmetic keeps the zero crossings exact.
    const sq = (n: number): number => {
      const t = ((n % 60) + 60) % 60;
      return t === 15 || t === 45 ? 0 : t < 15 || t > 45 ? 1 : -1;
    };
    return sample((x, y, col, row) => {
      const p = sq(col + row - 2 * MODELFEST_CENTRE_PX) * sq(col - row);
      return (p > 0 ? 1 : -1) * gauss2(x, y, S05, S05);
    });
  });
  push(43, "Natural scene (San Francisco) x Gaussian", "natural", null, false, NOT_PARAMETRIC);
  return s;
})();

export const ANALYTIC_STIMULI = MODELFEST_STIMULI.filter((s) => s.build !== null);
export const EXCLUDED_STIMULI = MODELFEST_STIMULI.filter((s) => s.build === null);

export function getStimulus(id: number): ModelFestStimulus {
  const s = MODELFEST_STIMULI.find((x) => x.id === id);
  if (!s) throw new Error(`No ModelFest stimulus #${id}`);
  return s;
}

/** The stimulus as a ContrastPatch at unit contrast, at the ModelFest geometry for `distanceM`. */
export function generateStimulus(id: number, distanceM: number = MODELFEST_DISTANCE_M): ContrastPatch {
  const s = getStimulus(id);
  if (!s.build) throw new Error(`ModelFest #${id} is not analytic: ${s.excludedReason}`);
  return {
    width: MODELFEST_SIZE,
    height: MODELFEST_SIZE,
    mmPerPx: modelfestMmPerPx(distanceM),
    lum: s.build(),
  };
}
