/**
 * A contrast sensitivity curve of Mannos & Sakrison's (1974) shape, scaled to a peak near 200.
 * The model itself uses Barten (1999); this figure shows the idea. Text is sized so that it stays near 13 px when the
 * chart scrolls sideways on a phone (see min-w below).
 */
const W = 680;
const H = 380;
const M = { l: 58, r: 20, t: 20, b: 52 };
const F_MIN = 0.3;
const F_MAX = 80;
const S_MIN = 0.5;
const S_MAX = 500;
const PEAK = 200;

const sensitivity = (f: number) => PEAK * 2.6 * (0.0192 + 0.114 * f) * Math.exp(-Math.pow(0.114 * f, 1.1));
const x = (f: number) => M.l + ((Math.log(f) - Math.log(F_MIN)) / (Math.log(F_MAX) - Math.log(F_MIN))) * (W - M.l - M.r);
const y = (s: number) => H - M.b - ((Math.log(s) - Math.log(S_MIN)) / (Math.log(S_MAX) - Math.log(S_MIN))) * (H - M.t - M.b);

const points = Array.from({ length: 140 }, (_, i) => {
  const f = Math.exp(Math.log(F_MIN) + (i / 139) * (Math.log(F_MAX) - Math.log(F_MIN)));
  return [x(f), y(Math.max(S_MIN, sensitivity(f)))] as const;
});
const line = points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
const area = `${line} L${x(F_MAX).toFixed(1)} ${y(S_MIN)} L${x(F_MIN).toFixed(1)} ${y(S_MIN)} Z`;

// A feature with 12% contrast needs sensitivity 1 / 0.12. Find where the falling side of the curve crosses it.
const NEED = 1 / 0.12;
let cross = F_MAX;
for (let f = 8; f < F_MAX; f *= 1.002) {
  if (sensitivity(f) < NEED) {
    cross = f;
    break;
  }
}

const F_TICKS = [0.5, 1, 2, 5, 10, 20, 50];
const S_TICKS = [1, 10, 100];

export function CsfChart() {
  return (
    <figure>
      <div className="overflow-x-auto" tabIndex={0} aria-label="Contrast sensitivity chart, scrolls sideways on small screens">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby="csf-title csf-desc"
        className="h-auto w-full min-w-[34rem]"
        style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
      >
        <title id="csf-title">Contrast sensitivity against spatial frequency</title>
        <desc id="csf-desc">
          A hump-shaped curve: sensitivity rises to a peak near 8 cycles per degree and falls to nothing by about 60. A dashed line marks the sensitivity a
          12 percent contrast feature needs. The feature is visible wherever the curve is above the line.
        </desc>

        {S_TICKS.map((s) => (
          <g key={s}>
            <line x1={M.l} x2={W - M.r} y1={y(s)} y2={y(s)} stroke="#d8d4cb" strokeWidth="1" />
            <text x={M.l - 10} y={y(s) + 4} textAnchor="end" fontSize="17" fill="#5f5c56" style={{ fontVariantNumeric: "tabular-nums" }}>
              {s}
            </text>
          </g>
        ))}
        {F_TICKS.map((f) => (
          <g key={f}>
            <line x1={x(f)} x2={x(f)} y1={H - M.b} y2={H - M.b + 6} stroke="#161513" strokeWidth="1" />
            <text x={x(f)} y={H - M.b + 22} textAnchor="middle" fontSize="17" fill="#5f5c56" style={{ fontVariantNumeric: "tabular-nums" }}>
              {f}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="#161513" strokeWidth="1" />
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontSize="17" fill="#161513" letterSpacing="0.3">
          DETAIL SIZE: CYCLES PER DEGREE (FINER TO THE RIGHT)
        </text>
        <text transform={`translate(16 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="17" fill="#161513" letterSpacing="0.3">
          SENSITIVITY
        </text>

        <path d={area} fill="#ebe8e1" />
        <path d={line} fill="none" stroke="#161513" strokeWidth="2" />

        {/* the threshold a 12% contrast spot needs */}
        <line x1={M.l} x2={W - M.r} y1={y(NEED)} y2={y(NEED)} stroke="#161513" strokeWidth="1" strokeDasharray="5 4" />
        <text x={M.l + 8} y={y(NEED) - 8} fontSize="17" fill="#161513">
          A spot with 12% contrast needs sensitivity of about 8
        </text>
        <line x1={x(cross)} x2={x(cross)} y1={y(NEED)} y2={H - M.b} stroke="#161513" strokeWidth="1" />
        <circle cx={x(cross)} cy={y(NEED)} r="5" fill="#f5f3ef" stroke="#161513" strokeWidth="1.8" />
        <text x={x(cross) - 10} y={H - M.b - 12} textAnchor="end" fontSize="17" fill="#161513">
          Finer than this, it vanishes
        </text>

        {/* the peak */}
        <text x={x(6)} y={y(sensitivity(8)) - 12} textAnchor="middle" fontSize="17" fill="#5f5c56">
          most sensitive: medium detail
        </text>
      </svg>
      </div>
      <figcaption className="mt-3 max-w-[40rem] text-[0.875rem] leading-relaxed text-muted">
        A curve of this shape (Mannos and Sakrison, 1974, scaled to a peak near 200); our model uses Barten (1999). Stepping back makes every feature
        subtend a smaller angle, which slides it to the right along this axis until the curve can no longer reach the dashed line.
      </figcaption>
    </figure>
  );
}
