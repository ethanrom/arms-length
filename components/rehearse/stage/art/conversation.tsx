"use client";

/**
 * A standing conversation. Behind: a wall meeting the floor at a skirting board, a doorway into a lit hall on the right,
 * and a floor lamp and a plant on the left. Nothing in front: nobody stands between the two of you.
 */
import { C, Ink, Layer, W, Wash } from "./ink";
import { Garment } from "./garment";
import { Plant } from "./props";
import { arc, ellipse, line, smooth } from "./shapes";

const FLOOR = 790;

function Doorway({ uid }: { uid: string }) {
  const [x0, x1, top] = [1090, 1420, 130];
  const cx = (x0 + x1) / 2 - 20;
  const base = FLOOR - 64;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}hall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.5" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <Ink d={`M${x0 - 22} ${FLOOR}V${top - 22}H${x1 + 22}V${FLOOR}`} fill={C.paperDeep} fo={0.5} w={W.near} />
      <Ink d={`M${x0} ${FLOOR}V${top}H${x1}V${FLOOR}Z`} fill={`url(#${uid}hall)`} w={W.line} />
      <Ink d={line(x0, base, x1, base)} stroke={C.ink} w={W.hair} o={0.45} />
      {/* an arched mirror on the far wall of the hall */}
      <Ink d={`M${cx - 62} ${base - 30}V${top + 150}A62 62 0 0 1 ${cx + 62} ${top + 150}V${base - 30}Z`} fill={C.paper} fo={0.6} w={W.near} />
      <Ink d={`M${cx - 50} ${base - 42}V${top + 152}A50 50 0 0 1 ${cx + 50} ${top + 152}V${base - 42}Z`} stroke={C.ruleStrong} w={W.hair} />
      <Ink d={smooth([[cx - 30, top + 240], [cx - 10, top + 200], [cx + 14, top + 180]])} stroke={C.paper} w={W.near} o={0.9} />
      {/* an open door leaf seen edge-on */}
      <Ink d={`M${x1} ${top}L${x1 - 52} ${top + 20}V${FLOOR - 14}L${x1} ${FLOOR}`} fill={C.paperDeep} w={W.line} />
      <Ink d={ellipse(x1 - 40, 460, 5, 5)} stroke={C.ink} w={W.line} />
    </g>
  );
}

function FloorLamp() {
  return (
    <g transform={`translate(240 ${FLOOR})`}>
      <Ink d={ellipse(0, -2, 62, 11)} fill={C.paperDeep} w={W.line} />
      <Ink d="M0 -12V-470" w={W.near} />
      <Ink d="M-64 -500L-34 -566H34L64 -500Z" fill={C.paper} w={W.near} />
      <Ink d={ellipse(0, -500, 64, 10)} fill={C.paperDeep} w={W.line} />
      <Ink d={arc(0, -504, 52, 7, 20, 160)} stroke={C.paper} w={W.line} />
    </g>
  );
}

export function ConversationBack({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.ink} stopOpacity="0.14" />
          <stop offset="1" stopColor={C.ink} stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id={`${uid}glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.3" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0" />
        </radialGradient>
      </defs>
      <Layer at={0} to={0.35}>
        <Wash d={`M0 ${FLOOR}H1600V1000H0Z`} fill={`url(#${uid}floor)`} />
        <Ink d={line(-20, FLOOR, 1620, FLOOR)} w={W.near} />
        <Ink d={`M-20 ${FLOOR - 34}H1620`} stroke={C.ink} w={W.hair} o={0.5} />
      </Layer>
      <Layer at={0.2} to={0.65}>
        <Doorway uid={uid} />
      </Layer>
      <Layer at={0.45} to={0.9}>
        <Wash d={ellipse(240, 220, 200, 200)} fill={`url(#${uid}glow)`} />
        <FloorLamp />
        <g transform={`translate(430 ${FLOOR - 4}) scale(1.3)`}>
          <Plant />
        </g>
      </Layer>
    </>
  );
}

export function ConversationFront({ photoHeight }: { photoHeight?: number }) {
  return (
    <Layer at={0.6} to={1}>
      <Garment scene="conversation" photoHeight={photoHeight} />
    </Layer>
  );
}
