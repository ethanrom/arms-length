/** Minimal in-place radix-2 FFT, only for the reference detector in this folder. Sizes must be powers of two. */

export function fft1d(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** 2-D FFT of an n x n array stored row-major (in place). */
export function fft2d(re: Float64Array, im: Float64Array, n: number, inverse: boolean): void {
  const rr = new Float64Array(n);
  const ri = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    rr.set(re.subarray(r * n, r * n + n));
    ri.set(im.subarray(r * n, r * n + n));
    fft1d(rr, ri, inverse);
    re.set(rr, r * n);
    im.set(ri, r * n);
  }
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; r++) {
      rr[r] = re[r * n + c];
      ri[r] = im[r * n + c];
    }
    fft1d(rr, ri, inverse);
    for (let r = 0; r < n; r++) {
      re[r * n + c] = rr[r];
      im[r * n + c] = ri[r];
    }
  }
}
