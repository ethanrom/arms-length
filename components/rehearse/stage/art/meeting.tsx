"use client";

/**
 * Across a meeting room. Behind: a window with blinds, a whiteboard and empty chairs. In front: the far edge of a long
 * table in perspective with a notebook, a glass and a speaker puck.
 */
import { C, Ink, Layer, W } from "./ink";
import { eyeLineY } from "./layout";
import { ellipse, line, rect, smooth } from "./shapes";

const EDGE = 486;
/** A darker, glossier top than the dinner table's. */
const TOP = "color-mix(in srgb, var(--rule-strong) 70%, var(--stage))";
const VX = 800;

function nearX(xf: number, yTop: number, yHorizon: number): number {
  return VX + (xf - VX) * ((1000 - yHorizon) / (yTop - yHorizon));
}

function Blinds() {
  const slats: string[] = [];
  for (let y = 98; y < 208; y += 14) slats.push(`M120 ${y}H530`);
  return (
    <g>
      <Ink d={rect(96, 62, 458, 272, 3)} fill={C.paperDeep} fo={0.5} w={W.near} />
      <Ink d={rect(112, 78, 426, 240)} fill={C.paper} fo={0.62} w={W.line} />
      <Ink d="M325 78V318M112 218H538" w={W.line} />
      <Ink d={slats.join("")} stroke={C.inkSoft} w={W.line} o={0.5} />
      <Ink d={rect(112, 78, 426, 8)} fill={C.inkSoft} fo={0.7} w={W.hair} />
      <Ink d="M520 86V216" stroke={C.ink} w={W.hair} o={0.6} />
      <Ink d={rect(514, 214, 12, 8, 2)} fill={C.paper} w={W.hair} />
      <Ink d="M170 318V282H236V250H298V318M345 318V268H420V240H482V318" stroke={C.muted} w={W.hair} o={0.55} />
    </g>
  );
}

function Whiteboard() {
  return (
    <g>
      <Ink d={rect(1040, 84, 440, 246, 3)} fill={C.paper} w={W.near} />
      <Ink d={rect(1050, 94, 420, 226)} stroke={C.ruleStrong} w={W.hair} />
      <Ink d={rect(1084, 128, 96, 56, 6)} stroke={C.ink} w={W.line} o={0.85} />
      <Ink d={rect(1250, 128, 96, 56, 6)} stroke={C.ink} w={W.line} o={0.85} />
      <Ink d={rect(1166, 232, 96, 56, 6)} stroke={C.ink} w={W.line} o={0.85} />
      <Ink d="M1180 156H1250M1242 148L1250 156L1242 164M1132 184V204Q1132 260 1166 260M1298 184V204Q1298 260 1262 260" stroke={C.ink} w={W.line} o={0.85} />
      <Ink d={rect(1376, 124, 66, 66, 3)} fill={C.paperDeep} stroke={C.ruleStrong} w={W.line} />
      <Ink d="M1390 148H1428M1390 162H1418" stroke={C.ruleStrong} w={W.line} />
      <Ink d="M1040 330H1480V342H1040Z" fill={C.paperDeep} w={W.line} />
      <Ink d={rect(1074, 324, 40, 6, 2)} fill={C.ink} fo={0.8} w={W.hair} />
      <Ink d={rect(1124, 324, 40, 6, 2)} fill={C.ruleStrong} w={W.hair} />
    </g>
  );
}

/** An empty office chair seen from the front, its seat hidden by the table. Origin at the base of the backrest. */
function Chair({ s = 1 }: { s?: number }) {
  return (
    <g transform={`scale(${s})`}>
      <Ink d="M-34 -150Q-34 -168 -18 -168H18Q34 -168 34 -150Z" fill={C.paperDeep} w={W.line} />
      <Ink d="M-54 0C-60 -50 -58 -100 -50 -138Q-46 -150 -30 -150H30Q46 -150 50 -138C58 -100 60 -50 54 0Z" fill={C.paperDeep} w={W.near} />
      <Ink d="M-38 -12C-42 -56 -40 -96 -34 -128H34C40 -96 42 -56 38 -12" stroke={C.ruleStrong} w={W.hair} />
      <Ink d="M-56 -30H-94Q-102 -30 -102 -22V30M56 -30H94Q102 -30 102 -22V30" w={W.line} />
    </g>
  );
}

export function MeetingBack() {
  return (
    <>
      <Layer at={0} to={0.4}>
        <Blinds />
      </Layer>
      <Layer at={0.15} to={0.55}>
        <Whiteboard />
      </Layer>
      <Layer at={0.35} to={0.7}>
        <g transform="translate(350 520)">
          <Chair s={1.05} />
        </g>
        <g transform="translate(1230 520)">
          <Chair s={1.05} />
        </g>
        <g transform="translate(1500 512)">
          <Chair s={0.9} />
        </g>
      </Layer>
    </>
  );
}

export function MeetingFront() {
  const horizon = eyeLineY("meeting_room");
  const grain = [-1.2, -0.9, -0.6, -0.3, 0.3, 0.6, 0.9, 1.2].map((k) => VX + k * 560);
  return (
    <Layer at={0.45} to={1}>
      <Ink d={`M-20 ${EDGE}H1620V1010H-20Z`} fill={TOP} w={W.near} />
      <Ink d={line(-20, EDGE + 12, 1620, EDGE + 12)} stroke={C.paper} w={W.hair} o={0.4} />
      {grain.map((xf) => (
        <Ink key={xf} d={line(xf, EDGE + 12, nearX(xf, EDGE, horizon), 1000)} stroke={C.paper} w={W.hair} o={0.22} />
      ))}
      {/* a speaker puck in the middle of the table */}
      <g transform="translate(800 592)">
        <Ink d={ellipse(0, 5, 76, 17)} fill={C.inkSoft} w={W.line} />
        <Ink d={ellipse(0, 0, 76, 17)} fill={C.paperDeep} w={W.near} />
        <Ink d={ellipse(0, 0, 52, 11)} stroke={C.ruleStrong} w={W.hair} />
        <Ink d={ellipse(0, 0, 12, 3)} fill={C.ink} fo={0.6} w={0} />
      </g>
      {/* the other side's laptop, its back to us */}
      <g transform="translate(1086 574)">
        <Ink d="M-112 0L-96 -66H96L112 0Z" fill={C.paperDeep} w={W.near} />
        <Ink d={ellipse(0, -33, 10, 10)} stroke={C.ruleStrong} w={W.line} />
        <Ink d="M-120 0H120L128 10H-128Z" fill={C.paper} w={W.near} />
      </g>
      {/* notebook and pen */}
      <g transform="translate(420 780)">
        <Ink d="M-150 40L-110 -60H110L150 40Z" fill={C.paper} w={W.near} />
        <Ink d="M0 -60V40" stroke={C.ruleStrong} w={W.line} />
        <Ink d="M-130 20L-100 -42M-100 22L-72 -40M130 20L100 -42M100 22L72 -40" stroke={C.ruleStrong} w={W.hair} o={0.8} />
        <Ink d="M176 44L232 -34L240 -28L184 50Z" fill={C.paper} w={W.line} />
        <Ink d="M232 -34L246 -52L240 -28Z" fill={C.ink} w={W.hair} />
      </g>
      {/* a glass of water */}
      <g transform="translate(1180 800)">
        <Ink d={ellipse(0, 0, 42, 11)} fill={C.paperDeep} w={W.near} />
        <Ink d="M-42 0L-36 -128H36L42 0" fill={C.paper} fo={0.5} w={W.near} />
        <Ink d={ellipse(0, -128, 36, 9)} stroke={C.ink} w={W.line} />
        <Ink d="M-39 -50H39" stroke={C.ruleStrong} w={W.line} />
        <Ink d={smooth([[-24, -100], [-22, -70], [-24, -26]])} stroke={C.paper} w={W.line} o={0.9} />
      </g>
    </Layer>
  );
}
