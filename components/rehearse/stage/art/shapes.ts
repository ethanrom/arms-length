/**
 * Path builders for the scene line art, in the 1600 x 1000 stage space. Pure functions that return SVG path data, so
 * every shape can be drawn in (dash offset) and tested without a DOM.
 */
export type Pt = readonly [number, number];

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const pt = ([x, y]: Pt) => `${n(x)} ${n(y)}`;

export function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
}

/** Straight segments through the points. */
export function poly(pts: readonly Pt[], close = false): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${pt(p)}`).join("") + (close ? "Z" : "");
}

/** Rectangle with uniform rounded corners (clockwise from the top left). */
export function rect(x: number, y: number, w: number, h: number, r = 0): string {
  const k = Math.min(r, w / 2, h / 2);
  if (k <= 0) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  return (
    `M${n(x + k)} ${n(y)}H${n(x + w - k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + w)} ${n(y + k)}V${n(y + h - k)}` +
    `A${n(k)} ${n(k)} 0 0 1 ${n(x + w - k)} ${n(y + h)}H${n(x + k)}A${n(k)} ${n(k)} 0 0 1 ${n(x)} ${n(y + h - k)}` +
    `V${n(y + k)}A${n(k)} ${n(k)} 0 0 1 ${n(x + k)} ${n(y)}Z`
  );
}

export function ellipse(cx: number, cy: number, rxr: number, ryr: number): string {
  return `M${n(cx - rxr)} ${n(cy)}A${n(rxr)} ${n(ryr)} 0 1 1 ${n(cx + rxr)} ${n(cy)}A${n(rxr)} ${n(ryr)} 0 1 1 ${n(cx - rxr)} ${n(cy)}Z`;
}

/** Elliptical arc between two angles (degrees, 0 = right, 90 = down), going clockwise on screen. */
export function arc(cx: number, cy: number, rxr: number, ryr: number, a0: number, a1: number): string {
  const p = (a: number): Pt => [cx + rxr * Math.cos((a * Math.PI) / 180), cy + ryr * Math.sin((a * Math.PI) / 180)];
  const [s, e] = [p(a0), p(a1)];
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${pt(s)}A${n(rxr)} ${n(ryr)} 0 ${large} ${a1 > a0 ? 1 : 0} ${pt(e)}`;
}

/** A smooth curve through the points (Catmull-Rom as cubic Beziers). */
export function smooth(pts: readonly Pt[], close = false, tension = 0.5): string {
  const k = pts.length;
  if (k < 3) return poly(pts, close);
  const at = (i: number): Pt => (close ? pts[(i + k) % k] : pts[Math.max(0, Math.min(k - 1, i))]);
  const last = close ? k : k - 1;
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const t = tension / 3;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return close ? d + "Z" : d;
}

/** Quadratic bezier. */
export function quad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): string {
  return `M${n(x1)} ${n(y1)}Q${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}`;
}

/** Evenly spaced parallel strokes leaning right by `slant` px over the box height: hatching for shade. */
export function hatch(x: number, y: number, w: number, h: number, step: number, slant: number): string {
  const s = slant / h;
  let d = "";
  for (let c = -slant; c < w; c += step) {
    // The stroke runs from (c, h) at the bottom to (c + slant, 0) at the top; clip it to the box.
    let yTop = 0;
    let yBot = h;
    if (c < 0) yBot = h + c / s;
    if (c + slant > w) yTop = h - (w - c) / s;
    if (yBot - yTop < 0.5) continue;
    d += `M${n(x + c + (h - yBot) * s)} ${n(y + yBot)}L${n(x + c + (h - yTop) * s)} ${n(y + yTop)}`;
  }
  return d;
}

/** The same y at every x: a gentle wave, for steam and grain. */
export function wave(x: number, y: number, len: number, amp: number, cycles: number, steps = 24): string {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([x + t * len, y + Math.sin(t * cycles * Math.PI * 2) * amp]);
  }
  return smooth(pts);
}

/** A leaf from (x, y) of length `len` pointing along `deg` (0 = right, -90 = up), `wd` wide at the belly. */
export function leaf(x: number, y: number, len: number, deg: number, wd: number): { outline: string; vein: string } {
  const a = (deg * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [px, py] = [-uy, ux];
  const tip: Pt = [x + ux * len, y + uy * len];
  const mid: Pt = [x + ux * len * 0.5, y + uy * len * 0.5];
  const c1: Pt = [mid[0] + px * wd, mid[1] + py * wd];
  const c2: Pt = [mid[0] - px * wd, mid[1] - py * wd];
  return {
    outline: `M${n(x)} ${n(y)}Q${pt(c1)} ${pt(tip)}Q${pt(c2)} ${n(x)} ${n(y)}Z`,
    vein: `M${n(x)} ${n(y)}L${pt([x + ux * len * 0.82, y + uy * len * 0.82])}`,
  };
}
