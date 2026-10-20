/**
 * Small radix-2 FFT (1-D and 2-D), no dependencies. Forward uses exp(-i...), inverse uses exp(+i...) and divides by
 * the transform length, so `ifft(fft(x)) = x` and the convention matches numpy (research scripts).
 * Arrays are split real / imaginary Float64Array, 2-D data is row-major (index = y * width + x).
 */

interface Plan {
  cos: Float64Array; // cos(2 pi t / n), t < n/2
  sin: Float64Array; // sin(2 pi t / n)
  rev: Uint32Array;
}

const plans = new Map<number, Plan>();

export function isPow2(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function getPlan(n: number): Plan {
  let plan = plans.get(n);
  if (plan) return plan;
  if (!isPow2(n)) throw new RangeError(`FFT length must be a power of two, got ${n}`);
  const half = n >> 1;
  const cos = new Float64Array(Math.max(half, 1));
  const sin = new Float64Array(Math.max(half, 1));
  for (let t = 0; t < half; t++) {
    cos[t] = Math.cos((2 * Math.PI * t) / n);
    sin[t] = Math.sin((2 * Math.PI * t) / n);
  }
  const rev = new Uint32Array(n);
  let bits = 0;
  while (1 << bits < n) bits++;
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  plan = { cos, sin, rev };
  plans.set(n, plan);
  return plan;
}

/** In-place 1-D transform of length `re.length` (a power of two). */
export function fft1d(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n === 1) return;
  const { cos, sin, rev } = getPlan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  const sgn = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const wr = cos[t];
        const wi = sgn * sin[t];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  if (inverse) {
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= s;
      im[i] *= s;
    }
  }
}

/** In-place 2-D transform of a width x height array (both powers of two). */
export function fft2d(re: Float64Array, im: Float64Array, width: number, height: number, inverse: boolean): void {
  for (let y = 0; y < height; y++) {
    const o = y * width;
    fft1d(re.subarray(o, o + width), im.subarray(o, o + width), inverse);
  }
  const colRe = new Float64Array(height);
  const colIm = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      colRe[y] = re[y * width + x];
      colIm[y] = im[y * width + x];
    }
    fft1d(colRe, colIm, inverse);
    for (let y = 0; y < height; y++) {
      re[y * width + x] = colRe[y];
      im[y * width + x] = colIm[y];
    }
  }
}
