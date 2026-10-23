"use client";

/**
 * Coffee at a small table. Behind: a window with a quiet street and a plant on the sill, a shelf and a pendant lamp.
 * In front: the near half of a round table (its far edge sits just under the shoulders), two cups and a bud vase.
 */
import { C, Fade, Ink, Layer, W, Wash } from "./ink";
import { BudVase, Cup, Plant } from "./props";
import { arc, ellipse, line, rect, smooth } from "./shapes";

const WIN = { x: 96, y: 120, w: 440, h: 520 };

function Window({ uid }: { uid: string }) {
  const { x, y, w, h } = WIN;
  const ix = x + 16;
  const iy = y + 16;
  const iw = w - 32;
  const ih = h - 32;
  const mx = ix + iw / 2;
  const my = iy + ih * 0.4;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.88" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0.4" />
        </linearGradient>
        <clipPath id={`${uid}win`}>
          <rect x={ix} y={iy} width={iw} height={ih} />
        </clipPath>
      </defs>
      <Ink d={rect(x, y, w, h, 4)} fill={C.paperDeep} fo={0.5} w={W.near} />
      <Ink d={rect(ix, iy, iw, ih)} fill={`url(#${uid}sky)`} w={W.line} />
      <g clipPath={`url(#${uid}win)`}>
        <Ink d={`M${ix} ${iy + ih - 64}H${ix + 70}V${iy + ih - 92}H${ix + 150}V${iy + ih - 70}H${ix + 214}V${iy + ih - 108}H${ix + 300}V${iy + ih - 80}H${ix + iw}`} stroke={C.muted} w={W.hair} o={0.65} />
        <Ink d={ellipse(ix + 332, iy + ih - 138, 30, 30)} stroke={C.muted} w={W.hair} o={0.65} />
        <Ink d={line(ix + 332, iy + ih - 108, ix + 332, iy + ih - 80)} stroke={C.muted} w={W.hair} o={0.65} />
        <Ink d={`M${ix + 40} ${iy + 20}L${ix + 140} ${iy + 120}M${ix + 74} ${iy + 20}L${ix + 174} ${iy + 120}`} stroke={C.paper} w={W.line} o={0.55} />
      </g>
      <Ink d={line(mx, iy, mx, iy + ih)} w={W.line} />
      <Ink d={line(ix, my, ix + iw, my)} w={W.line} />
      <Ink d={line(ix - 14, y + h + 2, ix + iw + 14, y + h + 2)} w={W.hair} o={0.0} />
      <Ink d={rect(x - 20, y + h, w + 40, 14, 2)} fill={C.paper} w={W.near} />
      <Ink d={`M${x - 8} ${y + h + 14}H${x + w + 8}V${y + h + 26}H${x - 8}Z`} fill={C.paperDeep} fo={0.7} w={W.line} />
    </g>
  );
}

function Pendant({ uid }: { uid: string }) {
  const x = 1296;
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.34" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0" />
        </radialGradient>
      </defs>
      <Wash d={ellipse(x, 330, 250, 230)} fill={`url(#${uid}glow)`} />
      <Ink d={line(x, 0, x, 178)} w={W.line} />
      <Ink d={rect(x - 11, 170, 22, 22, 3)} fill={C.inkSoft} w={W.line} />
      <Ink d={`M${x - 14} 192C${x - 44} 196 ${x - 82} 224 ${x - 100} 278H${x + 100}C${x + 82} 224 ${x + 44} 196 ${x + 14} 192Z`} fill={C.paper} w={W.near} />
      <Ink d={ellipse(x, 278, 100, 13)} fill={C.paperDeep} w={W.line} />
      <Ink d={arc(x, 282, 94, 14, 20, 160)} stroke={C.paper} w={W.line} />
      <Ink d={`M${x - 52} 214C${x - 70} 232 ${x - 78} 250 ${x - 82} 266`} stroke={C.ruleStrong} w={W.hair} />
    </g>
  );
}

function Shelf() {
  const y = 520;
  return (
    <g>
      <Ink d={rect(1140, y, 360, 14, 2)} fill={C.paper} w={W.near} />
      <Ink d={`M1176 ${y + 14}V${y + 52}L1206 ${y + 14}M1464 ${y + 14}V${y + 52}L1434 ${y + 14}`} w={W.line} />
      <Ink d={smooth([[1210, y], [1200, y - 22], [1216, y - 56], [1214, y - 84], [1226, y - 100], [1240, y - 86], [1238, y - 52], [1252, y - 22], [1248, y]], true)} fill={C.paper} fo={0.95} w={W.line} />
      <Ink d={`M1222 ${y - 98}C1214 ${y - 150} 1196 ${y - 176} 1176 ${y - 196}M1226 ${y - 98}C1232 ${y - 154} 1250 ${y - 180} 1262 ${y - 206}M1224 ${y - 98}C1226 ${y - 130} 1218 ${y - 156} 1222 ${y - 190}`} stroke={C.paper} w={W.line} />
      <Ink d={`M1300 ${y}H1366M1304 ${y - 9}H1362M1308 ${y - 18}H1358`} w={W.line} />
      <Ink d={ellipse(1333, y - 18, 25, 4)} fill={C.paperDeep} w={W.hair} />
      <Ink d={`M1398 ${y - 12}Q1400 ${y} 1426 ${y}Q1452 ${y} 1454 ${y - 12}Z`} fill={C.paper} w={W.line} />
      <Ink d={ellipse(1426, y - 12, 28, 5)} fill={C.paperDeep} w={W.hair} />
    </g>
  );
}

export function CafeBack({ uid }: { uid: string }) {
  return (
    <>
      <Layer at={0} to={0.5}>
        <Window uid={uid} />
      </Layer>
      <Layer at={0.25} to={0.7}>
        <g transform="translate(232 640)">
          <Plant size={0.72} />
        </g>
      </Layer>
      <Layer at={0.3} to={0.8}>
        <Pendant uid={uid} />
        <Shelf />
      </Layer>
    </>
  );
}

export function CafeFront() {
  return (
    <Layer at={0.45} to={1}>
      <Ink d={ellipse(800, 919, 700, 255)} fill={C.rule} w={W.near} />
      <Ink d={ellipse(800, 895, 700, 255)} fill={C.paperDeep} w={W.near} />
      <Ink d={ellipse(800, 895, 668, 240)} stroke={C.ruleStrong} w={W.hair} o={0.7} />
      <Ink d={arc(800, 895, 560, 196, 196, 250)} stroke={C.ruleStrong} w={W.hair} o={0.5} />
      <Ink d={arc(800, 895, 470, 164, 300, 342)} stroke={C.ruleStrong} w={W.hair} o={0.5} />
      <Ink d={arc(800, 895, 610, 214, 118, 150)} stroke={C.ruleStrong} w={W.hair} o={0.5} />
      <Fade o={0.5}>
        <path d={arc(800, 895, 600, 205, 205, 262)} style={{ fill: "none", stroke: "#fff", strokeWidth: 3, strokeLinecap: "round", strokeOpacity: 0.6 }} />
      </Fade>
      <g transform="translate(1046 748) scale(0.68)">
        <Cup />
      </g>
      <g transform="translate(1214 826)">
        <BudVase />
      </g>
      <g transform="translate(500 858)">
        <Cup />
      </g>
    </Layer>
  );
}
