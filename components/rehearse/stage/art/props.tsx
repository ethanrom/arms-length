"use client";

/** Small objects shared by the scenes. Each is drawn around the origin so a scene places it with a transform. */
import { C, Ink, W } from "./ink";
import { ellipse, leaf, line, smooth } from "./shapes";

/** Cup on a saucer; origin at the saucer's centre. Steam optional. */
export function Cup({ steam = true }: { steam?: boolean }) {
  return (
    <g>
      <Ink d={ellipse(8, 8, 128, 30)} fill={C.ink} fo={0.1} w={0} />
      <Ink d={ellipse(0, 0, 118, 28)} fill={C.paper} w={W.near} />
      <Ink d={ellipse(0, -2, 72, 16)} stroke={C.ruleStrong} w={W.hair} />
      <Ink d="M-58 -66C-58 -22-34 -3 0 -3C34 -3 58 -22 58 -66" fill={C.paper} w={W.near} />
      <Ink d="M56 -55C100 -60 98 -18 46 -25" w={W.near} />
      <Ink d={ellipse(0, -66, 58, 13)} fill={C.paper} w={W.near} />
      <Ink d={ellipse(0, -65, 49, 9.5)} fill={C.inkSoft} fo={0.82} w={0} />
      <Ink d="M-30 -66Q-8 -72 14 -68" stroke={C.paper} w={W.hair} o={0.5} />
      <Ink d="M-46 -40C-44 -26-36 -14-26 -9" stroke={C.ruleStrong} w={W.hair} o={0.8} />
      {steam && (
        <>
          <Ink d={smooth([[-14, -86], [-24, -108], [-8, -128], [-18, -152]])} stroke={C.ruleStrong} w={W.line} o={0.95} />
          <Ink d={smooth([[16, -90], [6, -114], [22, -134], [12, -160]])} stroke={C.ruleStrong} w={W.line} o={0.8} />
        </>
      )}
    </g>
  );
}

/** A pot with a few leaves; origin at the middle of the pot's base. */
export function Plant({ size = 1 }: { size?: number }) {
  const set: [number, number, number][] = [
    [-90, 86, 17],
    [-64, 72, 16],
    [-116, 72, 16],
    [-38, 52, 13],
    [-142, 54, 13],
    [-78, 104, 18],
    [-102, 98, 17],
  ];
  return (
    <g transform={`scale(${size})`}>
      {set.map(([deg, len, wd], i) => {
        const l = leaf(0, -62, len, deg, wd);
        return (
          <g key={i}>
            <Ink d={l.outline} fill={C.paper} fo={0.92} w={W.line} />
            <Ink d={l.vein} stroke={C.ruleStrong} w={W.hair} />
          </g>
        );
      })}
      <Ink d="M-34 -62H34L26 0H-26Z" fill={C.paperDeep} w={W.near} />
      <Ink d={line(-31, -50, 31, -50)} stroke={C.ruleStrong} w={W.hair} />
    </g>
  );
}

/** A bud vase with one flower; origin at the base's middle. */
export function BudVase() {
  const petals = Array.from({ length: 8 }, (_, i) => leaf(0, -150, 22, i * 45, 7));
  return (
    <g>
      <Ink d={ellipse(6, 4, 40, 8)} fill={C.ink} fo={0.1} w={0} />
      <Ink d={smooth([[-26, 0], [-31, -20], [-24, -42], [-9, -60], [-6, -90], [6, -90], [9, -60], [24, -42], [31, -20], [26, 0]]) + "Z"} fill={C.paper} w={W.near} />
      <Ink d="M-21 -12C-21 -24-15 -34-9 -42" stroke={C.ruleStrong} w={W.hair} />
      <Ink d="M0 -88C-3 -112 4 -130 0 -150" w={W.line} />
      <Ink d="M0 -108Q22 -116 30 -104Q12 -98 0 -108Z" fill={C.paper} w={W.line} />
      {petals.map((p, i) => (
        <Ink key={i} d={p.outline} fill={C.paper} w={W.line} />
      ))}
      <Ink d={ellipse(0, -150, 7, 7)} fill={C.ink} fo={0.8} w={0} />
    </g>
  );
}

/** A dinner plate seen from a low angle; origin at its centre. */
export function Plate({ rxr = 190, ryr = 50 }: { rxr?: number; ryr?: number }) {
  return (
    <g>
      <Ink d={ellipse(6, 14, rxr * 1.02, ryr * 1.05)} fill={C.ink} fo={0.1} w={0} />
      <Ink d={ellipse(0, 8, rxr, ryr)} fill={C.rule} w={W.line} />
      <Ink d={ellipse(0, 0, rxr, ryr)} fill={C.paper} w={W.near} />
      <Ink d={ellipse(0, 3, rxr * 0.72, ryr * 0.7)} stroke={C.ruleStrong} w={W.hair} o={0.9} />
    </g>
  );
}

/** A stemmed glass with a little in it; origin at the foot's centre. `h` is its height. */
export function Glass({ h = 190, fill = 0.38 }: { h?: number; fill?: number }) {
  const bowlH = h * 0.55;
  const top = -h;
  const rim = 46;
  const wineTop = top + bowlH * (1 - fill);
  const wr = rim * (1 - 0.5 * ((wineTop - top) / bowlH) ** 2);
  return (
    <g>
      <Ink d={ellipse(8, 3, 46, 9)} fill={C.ink} fo={0.1} w={0} />
      <Ink d={ellipse(0, 0, 40, 8)} fill={C.paper} fo={0.9} w={W.line} />
      <Ink d={`M-3 -4L-2.5 ${top + bowlH}M3 -4L2.5 ${top + bowlH}`} w={W.line} />
      <Ink d={`M${-rim} ${top}C${-rim} ${top + bowlH * 0.8} -18 ${top + bowlH} 0 ${top + bowlH}C18 ${top + bowlH} ${rim} ${top + bowlH * 0.8} ${rim} ${top}`} fill={C.paper} fo={0.35} w={W.line} />
      <Ink d={`M${-wr} ${wineTop}C${-wr + 2} ${top + bowlH * 0.86} -16 ${top + bowlH - 2} 0 ${top + bowlH - 1}C16 ${top + bowlH - 2} ${wr - 2} ${top + bowlH * 0.86} ${wr} ${wineTop}Z`} fill={C.inkSoft} fo={0.55} w={0} />
      <Ink d={ellipse(0, top, rim, 10)} stroke={C.ink} w={W.line} />
      <Ink d={`M${-rim + 9} ${top + 14}C${-rim + 9} ${top + bowlH * 0.5} ${-rim + 18} ${top + bowlH * 0.7} ${-rim + 28} ${top + bowlH * 0.84}`} stroke={C.paper} w={W.line} o={0.9} />
    </g>
  );
}

/** A plain mug; origin at the middle of its base. */
export function Mug() {
  return (
    <g>
      <Ink d={ellipse(0, 6, 62, 14)} fill={C.ink} fo={0.1} w={0} />
      <Ink d="M-48 -92V-12Q-48 6 -30 9Q0 14 30 9Q48 6 48 -12V-92" fill={C.paper} w={W.near} />
      <Ink d="M46 -76C94 -82 94 -22 44 -28" w={W.near} />
      <Ink d={ellipse(0, -92, 48, 11)} fill={C.paper} w={W.near} />
      <Ink d={ellipse(0, -91, 40, 8)} fill={C.inkSoft} fo={0.82} w={0} />
      <Ink d="M-34 -50C-34 -34-30 -22-22 -14" stroke={C.ruleStrong} w={W.hair} />
      <Ink d={smooth([[-12, -110], [-22, -132], [-8, -152], [-18, -176]])} stroke={C.ruleStrong} w={W.line} o={0.9} />
      <Ink d={smooth([[14, -114], [4, -138], [20, -158], [10, -184]])} stroke={C.ruleStrong} w={W.line} o={0.75} />
    </g>
  );
}
