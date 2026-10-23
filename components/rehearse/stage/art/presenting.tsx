"use client";

/**
 * Presenting to a room. Behind: a projection screen and a raised platform. In front: the lectern the speaker stands
 * behind, and rows of audience heads seen from behind. The speaker's face is small and up front.
 */
import { C, Ink, Layer, W, Wash } from "./ink";
import { ellipse, line, rect, smooth } from "./shapes";

const FACE_X = 960;
const PLATFORM = 610;

const tone = (pct: number) => `color-mix(in srgb, var(--ink) ${pct}%, var(--stage))`;

function Screen() {
  return (
    <g>
      <Ink d={rect(120, 96, 640, 380, 2)} fill={C.paper} w={W.near} />
      <Ink d={rect(104, 82, 672, 16, 8)} fill={C.inkSoft} w={W.line} />
      <Ink d="M118 98V480M762 98V480" stroke={C.ruleStrong} w={W.hair} />
      {/* a slide: a title bar, three bars and a trend line, no words */}
      <Ink d={rect(160, 132, 230, 20, 4)} fill={C.ink} fo={0.8} w={0} />
      <Ink d={rect(160, 166, 150, 10, 4)} fill={C.ruleStrong} w={0} />
      <Ink d="M180 440H720" stroke={C.ink} w={W.line} o={0.8} />
      <Ink d={rect(210, 330, 70, 110, 3)} fill={C.rule} w={W.line} />
      <Ink d={rect(330, 290, 70, 150, 3)} fill={C.rule} w={W.line} />
      <Ink d={rect(450, 340, 70, 100, 3)} fill={C.rule} w={W.line} />
      <Ink d={rect(570, 250, 70, 190, 3)} fill={C.ink} fo={0.8} w={W.line} />
      <Ink d={smooth([[190, 360], [300, 320], [420, 330], [540, 270], [660, 214]])} stroke={C.ink} w={W.near} />
      <Ink d={ellipse(660, 214, 6, 6)} fill={C.paper} w={W.near} />
    </g>
  );
}

export function PresentingBack({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.14" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.ink} stopOpacity="0.16" />
          <stop offset="1" stopColor={C.ink} stopOpacity="0.34" />
        </linearGradient>
      </defs>
      <Layer at={0} to={0.4}>
        <Screen />
      </Layer>
      <Layer at={0.2} to={0.55}>
        <Wash d={`M0 ${PLATFORM + 56}H1600V1000H0Z`} fill={`url(#${uid}floor)`} />
        <Wash d={`M0 ${PLATFORM - 62}H1600V${PLATFORM}H0Z`} fill={C.ink} fo={0.06} />
        <Ink d={line(-20, PLATFORM - 62, 1620, PLATFORM - 62)} stroke={C.ink} w={W.hair} o={0.45} />
        <Ink d={`M-20 ${PLATFORM}H1620V${PLATFORM + 56}H-20Z`} fill={C.ink} fo={0.1} w={W.line} />
        <Ink d={line(-20, PLATFORM + 56, 1620, PLATFORM + 56)} stroke={C.ink} w={W.near} />
      </Layer>
      <Layer at={0.3} to={0.6}>
        <Ink d={line(820, 36, 1520, 36)} w={W.near} />
        {[930, 1170, 1410].map((x) => (
          <g key={x}>
            <Ink d={`M${x - 10} 36V50L${x - 24} 78H${x + 24}L${x + 10} 50V36`} fill={C.inkSoft} w={W.line} />
            <Wash d={`M${x - 24} 78L${x - 150} 380H${x + 150}L${x + 24} 78Z`} fill={`url(#${uid}beam)`} />
          </g>
        ))}
      </Layer>
      <Layer at={0.35} to={0.6}>
        {/* a small side table with a bottle and a glass */}
        <g transform="translate(1340 610)">
          <Ink d="M-48 -132H48M-40 -132V0M40 -132V0" w={W.line} />
          <Ink d={ellipse(0, -132, 54, 8)} fill={C.paper} w={W.line} />
          <Ink d="M-24 -134V-190Q-24 -204 -16 -210V-232H-6V-210Q2 -204 2 -190V-134" fill={C.paper} fo={0.9} w={W.line} />
          <Ink d="M20 -134L16 -176H46L42 -134" fill={C.paper} fo={0.55} w={W.line} />
        </g>
      </Layer>
    </>
  );
}

type Kind = 0 | 1 | 2;

/** A head and shoulders from behind; (x, y) is the head's centre and `s` its half-height. */
function Back({ x, y, s, kind, shade }: { x: number; y: number; s: number; kind: Kind; shade: number }) {
  const hw = s * 0.82;
  const neckY = y + s * 0.92;
  const yb = y + s * 9;
  const sh =
    `M${x - s * 2.1} ${yb}V${y + s * 2.3}C${x - s * 2.1} ${y + s * 1.55} ${x - s * 1.5} ${y + s * 1.32} ${x - s * 0.95} ${y + s * 1.22}` +
    `Q${x - s * 0.5} ${y + s * 1.12} ${x - hw * 0.42} ${y + s * 1.04}H${x + hw * 0.42}Q${x + s * 0.5} ${y + s * 1.12} ${x + s * 0.95} ${y + s * 1.22}` +
    `C${x + s * 1.5} ${y + s * 1.32} ${x + s * 2.1} ${y + s * 1.55} ${x + s * 2.1} ${y + s * 2.3}V${yb}`;
  const fill = tone(shade);
  return (
    <g>
      <Ink d={`${sh}Z`} fill={fill} w={W.line} />
      <Ink d={`M${x - hw * 0.34} ${neckY - s * 0.1}V${y + s * 1.12}M${x + hw * 0.34} ${neckY - s * 0.1}V${y + s * 1.12}`} stroke={C.paper} w={W.hair} o={0.18} />
      {kind === 1 && <Ink d={ellipse(x + hw * 0.1, y - s * 1.0, s * 0.42, s * 0.38)} fill={fill} w={W.line} />}
      {kind === 2 && (
        <Ink d={smooth([[x - hw * 1.02, y - s * 0.2], [x - hw * 1.1, y + s * 0.9], [x - hw * 0.9, y + s * 1.55], [x, y + s * 1.7], [x + hw * 0.9, y + s * 1.55], [x + hw * 1.1, y + s * 0.9], [x + hw * 1.02, y - s * 0.2]])} fill={fill} w={W.line} />
      )}
      <Ink d={ellipse(x, y, hw, s)} fill={fill} w={W.near} />
      <Ink d={`M${x - hw * 0.5} ${y - s * 0.55}Q${x} ${y - s * 0.8} ${x + hw * 0.5} ${y - s * 0.55}`} stroke={C.paper} w={W.hair} o={0.18} />
      <Ink
        d={`M${x - hw * 0.92} ${y + s * 0.1}Q${x - hw * 1.12} ${y + s * 0.3} ${x - hw * 0.9} ${y + s * 0.5}M${x + hw * 0.92} ${y + s * 0.1}Q${x + hw * 1.12} ${y + s * 0.3} ${x + hw * 0.9} ${y + s * 0.5}`}
        stroke={C.paper}
        w={W.hair}
        o={0.16}
      />
    </g>
  );
}

const ROWS: { y: number; s: number; shade: number; xs: [number, Kind][] }[] = [
  { y: 770, s: 34, shade: 42, xs: [[240, 0], [470, 1], [710, 2], [930, 0], [1150, 1], [1390, 0]] },
  { y: 846, s: 48, shade: 56, xs: [[110, 1], [350, 0], [590, 2], [820, 0], [1050, 1], [1290, 2], [1520, 0]] },
  { y: 944, s: 70, shade: 70, xs: [[30, 2], [280, 0], [540, 1], [800, 0], [1060, 2], [1330, 0], [1590, 1]] },
];

export function PresentingFront() {
  return (
    <>
      <Layer at={0.3} to={0.6}>
        {/* the lectern: a slanted top, a body and a gooseneck microphone */}
        <g transform={`translate(${FACE_X} ${PLATFORM - 24})`}>
          <Ink d="M-74 -160L74 -160L86 -132H-86Z" fill={C.paper} w={W.near} />
          <Ink d="M-86 -132H86V0H-86Z" fill={C.paperDeep} w={W.near} />
          <Ink d="M-70 -116H70V-12H-70Z" stroke={C.ruleStrong} w={W.hair} />
          <Ink d="M-30 -164C-34 -194 -52 -204 -64 -196" stroke={C.ink} w={W.line} />
          <Ink d={ellipse(-66, -194, 4, 6)} fill={C.ink} w={W.hair} />
        </g>
      </Layer>
      <Layer at={0.5} to={1}>
        {ROWS.map((row, r) => (
          <g key={r}>
            {row.xs.map(([x, kind]) => (
              <Back key={x} x={x} y={row.y} s={row.s} kind={kind} shade={row.shade} />
            ))}
          </g>
        ))}
      </Layer>
    </>
  );
}
