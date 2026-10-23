"use client";

/**
 * Across a dinner or meeting table. Behind: a framed picture and a pendant lamp. In front: the far edge of a long table
 * (its grain runs to the vanishing point on the eye line), plates, a glass and a candle.
 */
import { C, Fade, Ink, Layer, W, Wash } from "./ink";
import { eyeLineY } from "./layout";
import { Glass, Plate } from "./props";
import { arc, ellipse, line, rect, smooth } from "./shapes";

const EDGE = 538;
const VX = 800;

/** x at the stage bottom of a table line that leaves the far edge at x. */
function nearX(xf: number, yTop: number, yHorizon: number): number {
  return VX + (xf - VX) * ((1000 - yHorizon) / (yTop - yHorizon));
}

function Picture() {
  return (
    <g>
      <Ink d={rect(150, 150, 290, 230, 3)} fill={C.paperDeep} fo={0.55} w={W.near} />
      <Ink d={rect(166, 166, 258, 198)} fill={C.paper} fo={0.7} w={W.line} />
      <Ink d={smooth([[166, 300], [230, 250], [290, 296], [350, 240], [424, 290]])} stroke={C.ink} w={W.line} o={0.8} />
      <Ink d={ellipse(342, 224, 22, 22)} stroke={C.ink} w={W.line} o={0.8} />
      <Ink d={smooth([[166, 332], [240, 308], [312, 336], [424, 316]])} stroke={C.muted} w={W.hair} o={0.8} />
    </g>
  );
}

function Pendant({ uid }: { uid: string }) {
  const x = 1190;
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.36" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0" />
        </radialGradient>
      </defs>
      <Wash d={ellipse(x, 270, 230, 220)} fill={`url(#${uid}glow)`} />
      <Ink d={line(x, 0, x, 120)} w={W.line} />
      <Ink d={rect(x - 9, 112, 18, 18, 3)} fill={C.inkSoft} w={W.line} />
      <Ink d={`M${x - 10} 130C${x - 34} 134 ${x - 70} 160 ${x - 84} 214H${x + 84}C${x + 70} 160 ${x + 34} 134 ${x + 10} 130Z`} fill={C.paper} w={W.near} />
      <Ink d={ellipse(x, 214, 84, 11)} fill={C.paperDeep} w={W.line} />
      <Ink d={ellipse(x, 224, 16, 12)} fill={C.paper} w={W.line} />
    </g>
  );
}

export function DinnerBack({ uid }: { uid: string }) {
  return (
    <>
      <Layer at={0} to={0.45}>
        <Picture />
      </Layer>
      <Layer at={0.25} to={0.7}>
        <Pendant uid={uid} />
      </Layer>
    </>
  );
}

function Candle({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}flame`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.34" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0" />
        </radialGradient>
      </defs>
      <Wash d={ellipse(0, -176, 96, 96)} fill={`url(#${uid}flame)`} />
      <Ink d={ellipse(0, 0, 46, 10)} fill={C.paperDeep} w={W.near} />
      <Ink d="M-30 -2C-26 -14-12 -14-10 -26H10C12 -14 26 -14 30 -2" fill={C.paper} w={W.line} />
      <Ink d="M-12 -26L-14 -34H14L12 -26" fill={C.paper} w={W.line} />
      <Ink d={ellipse(0, -34, 14, 3.4)} fill={C.paperDeep} w={W.hair} />
      <Ink d="M-8 -34V-128Q0 -123 8 -128V-34" fill={C.paper} w={W.line} />
      <Ink d={ellipse(0, -128, 8, 2.2)} fill={C.paperDeep} w={W.hair} />
      <Ink d="M0 -130V-137" w={W.line} />
      <Ink d="M0 -138C-10 -150-9 -162 0 -180C9 -162 10 -150 0 -138Z" fill={C.paper} w={W.line} />
    </g>
  );
}

function Cutlery({ side }: { side: -1 | 1 }) {
  const x = side * 226;
  return side === -1 ? (
    <g>
      <Ink d={`M${x} 32V-8M${x - 8} -34V-6Q${x - 8} 2 ${x} 2Q${x + 8} 2 ${x + 8} -6V-34M${x - 3} -34V-4M${x + 3} -34V-4`} w={W.line} />
    </g>
  ) : (
    <g>
      <Ink d={`M${x} 32V-4C${x - 8} -14 ${x - 8} -34 ${x + 1} -44C${x + 8} -30 ${x + 8} -14 ${x} -4`} fill={C.paper} w={W.line} />
    </g>
  );
}

export function DinnerFront({ uid }: { uid: string }) {
  const horizon = eyeLineY("dinner_table");
  const planks = [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1].map((k) => k * 640 + VX);
  const runnerL = 690;
  const runnerR = 910;
  return (
    <Layer at={0.4} to={1}>
      <Ink d={`M-20 ${EDGE}H1620V1010H-20Z`} fill={C.rule} w={W.near} />
      <Ink d={line(-20, EDGE + 11, 1620, EDGE + 11)} stroke={C.ruleStrong} w={W.hair} o={0.8} />
      {planks.map((xf) => (
        <Ink key={xf} d={line(xf, EDGE + 11, nearX(xf, EDGE, horizon), 1000)} stroke={C.ruleStrong} w={W.hair} o={0.6} />
      ))}
      <Ink
        d={`M${runnerL} ${EDGE + 11}L${runnerR} ${EDGE + 11}L${nearX(runnerR, EDGE, horizon)} 1000L${nearX(runnerL, EDGE, horizon)} 1000Z`}
        fill={C.paperDeep}
        fo={0.9}
        w={W.line}
      />
      <g transform="translate(440 770)">
        <Plate />
        <Cutlery side={-1} />
        <Cutlery side={1} />
      </g>
      <g transform="translate(1160 770)">
        <Plate />
        <Cutlery side={-1} />
        <Cutlery side={1} />
      </g>
      <g transform="translate(1004 712)">
        <Glass />
      </g>
      <g transform="translate(596 716)">
        <Candle uid={uid} />
      </g>
      <Fade o={0.5}>
        <path d={arc(800, 1500, 1000, 700, 250, 290)} style={{ fill: "none", stroke: "#fff", strokeWidth: 2, strokeOpacity: 0.4 }} />
      </Fade>
    </Layer>
  );
}
