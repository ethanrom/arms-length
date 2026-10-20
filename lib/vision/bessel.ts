/**
 * Bessel function of the first kind, order 1 (rational approximations of Abramowitz & Stegun 9.4.4 / 9.4.6 as
 * tabulated in Numerical Recipes, `bessj1`; absolute error below 1e-8). Needed for the Fourier transform of a
 * uniform disk, 2 J1(z) / z.
 */
export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const num =
      x *
      (72362614232.0 +
        y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const den =
      144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return num / den;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const p1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2);
  return x < 0 ? -ans : ans;
}

/** Fourier transform of a unit disk of radius R (unit height) divided by its area: 2 J1(z) / z, z = 2 pi f R. */
export function jinc(z: number): number {
  if (Math.abs(z) < 1e-6) return 1;
  return (2 * besselJ1(z)) / z;
}
