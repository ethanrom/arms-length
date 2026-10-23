"use client";

/**
 * Video call: the viewer's laptop on a desk, seen from the chair, with the wall and a few quiet things around it. The
 * display is about 0.45 of the stage height; your tile (stage grey, so a photo's own surround melts into it) is the height
 * pov.ts gives, large in speaker view and one of four in gallery view, the other three plain placeholders with a
 * featureless head-and-shoulders. Geometry comes from layout.ts so the tile is the one the face is drawn into.
 */
import type { CallGeometry } from "@/lib/contracts/rehearse";
import { C, Ink, Layer, W, Wash } from "./ink";
import { LAPTOP, callTilesPx, type PxRect } from "./layout";
import { Mug, Plant } from "./props";
import { arc, ellipse, line, rect, smooth } from "./shapes";

const TILE_R = 8;
const DESK_BACK = 640;
const DESK_FRONT = 948;

/** A head and shoulders with no features, scaled to the tile. `kind` varies the hair a little. */
function Silhouette({ box, kind }: { box: PxRect; kind: 0 | 1 | 2 }) {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const hr = h * 0.14;
  const hy = y + h * 0.4;
  const neck = hr * 0.42;
  const sy = hy + hr * 1.5;
  const half = w * 0.25;
  const body =
    `M${cx - half} ${y + h}C${cx - half} ${sy + h * 0.3} ${cx - half * 0.8} ${sy + h * 0.02} ${cx - neck * 2.4} ${sy}` +
    `Q${cx - neck * 1.2} ${sy - h * 0.02} ${cx - neck} ${sy - h * 0.1}H${cx + neck}` +
    `Q${cx + neck * 1.2} ${sy - h * 0.02} ${cx + neck * 2.4} ${sy}C${cx + half * 0.8} ${sy + h * 0.02} ${cx + half} ${sy + h * 0.3} ${cx + half} ${y + h}Z`;
  const fill = { fill: C.ink, fo: 0.14, stroke: C.ink, w: W.hair, o: 0.3 };
  return (
    <g>
      <Ink d={body} {...fill} />
      {kind === 2 && <Ink d={ellipse(cx, hy + hr * 0.25, hr * 1.12, hr * 1.32)} {...fill} />}
      {kind === 1 && <Ink d={ellipse(cx + hr * 0.2, hy - hr * 1.12, hr * 0.42, hr * 0.38)} {...fill} />}
      <Ink d={ellipse(cx, hy, hr * 0.88, hr * 1.05)} {...fill} />
    </g>
  );
}

/** The bar's glyphs, drawn at 1:1 around the origin (the bar is scaled down to fit under the tiles). */
function ControlBar({ bar }: { bar: PxRect }) {
  const k = bar.h / 52;
  const gw = 2.4;
  return (
    <g transform={`translate(${bar.x + bar.w / 2} ${bar.y + bar.h / 2}) scale(${k})`}>
      <Ink d={rect(-240, -26, 480, 52, 26)} fill={C.paper} stroke={C.ruleStrong} w={gw} />
      <g transform="translate(-170 0)">
        <Ink d={rect(-5, -13, 10, 18, 5)} w={gw} />
        <Ink d={arc(0, -2, 11, 12, 20, 160)} w={gw} />
        <Ink d={line(0, 10, 0, 15)} w={gw} />
      </g>
      <g transform="translate(-100 0)">
        <Ink d={rect(-14, -8, 17, 16, 4)} w={gw} />
        <Ink d="M3 -2L14 -8V8L3 2" w={gw} />
      </g>
      <g transform="translate(-30 0)">
        <Ink d={rect(-14, -10, 28, 20, 4)} w={gw} />
        <Ink d="M0 4V-5M-5 -1L0 -6L5 -1" w={gw} />
      </g>
      <g transform="translate(40 0)">
        <Ink d={ellipse(-6, -5, 5, 5)} w={gw} />
        <Ink d={arc(-6, 12, 11, 9, 200, 340)} w={gw} />
        <Ink d={ellipse(8, -4, 4, 4)} w={gw} />
      </g>
      <g transform="translate(100 0)">
        {[-10, 0, 10].map((dx) => (
          <Ink key={dx} d={ellipse(dx, 0, 2.4, 2.4)} fill={C.ink} w={0} />
        ))}
      </g>
      <Ink d={rect(140, -18, 86, 36, 18)} fill={C.ink} stroke={C.ink} w={gw} />
      <Ink d="M170 4Q183 -8 196 4" stroke={C.paper} w={3} />
    </g>
  );
}

function Frame() {
  return (
    <g>
      <Ink d={rect(1300, 120, 190, 250, 3)} fill={C.paperDeep} fo={0.55} w={W.near} />
      <Ink d={rect(1316, 136, 158, 218)} fill={C.paper} fo={0.7} w={W.line} />
      <Ink d={smooth([[1316, 300], [1352, 262], [1388, 292], [1424, 240], [1474, 296]])} stroke={C.ink} w={W.line} o={0.8} />
      <Ink d={ellipse(1428, 188, 18, 18)} stroke={C.ink} w={W.line} o={0.8} />
      <Ink d={smooth([[1316, 328], [1380, 312], [1474, 324]])} stroke={C.muted} w={W.hair} o={0.8} />
    </g>
  );
}

function DeskLamp() {
  return (
    <g>
      <Ink d={ellipse(170, 776, 64, 15)} fill={C.paperDeep} w={W.near} />
      <Ink d="M170 764L214 552L286 424" w={W.near} />
      <Ink d={ellipse(214, 552, 8, 8)} fill={C.paper} w={W.line} />
      <g transform="translate(286 424) rotate(-22)">
        <Ink d="M-52 46L-24 -12Q0 -22 24 -12L52 46Z" fill={C.paper} w={W.near} />
        <Ink d={ellipse(0, 46, 52, 8)} fill={C.paperDeep} w={W.line} />
      </g>
    </g>
  );
}

export function CallBack({ uid, call }: { uid: string; call?: CallGeometry }) {
  const { lid, screen, camera } = LAPTOP;
  const { tile, others, bar } = callTilesPx(call?.layout);
  return (
    <>
      <defs>
        <radialGradient id={`${uid}lamp`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={C.paper} stopOpacity="0.28" />
          <stop offset="1" stopColor={C.paper} stopOpacity="0" />
        </radialGradient>
      </defs>
      <Layer at={0} to={0.3}>
        <Frame />
        <Wash d={ellipse(330, 520, 250, 230)} fill={`url(#${uid}lamp)`} />
        <DeskLamp />
      </Layer>
      <Layer at={0.15} to={0.55}>
        {/* the desk: its back edge against the wall, then the top and the front edge */}
        <Ink d={`M-20 ${DESK_BACK}H1620V1020H-20Z`} fill={C.rule} w={W.near} />
        <Ink d={line(-20, DESK_BACK + 9, 1620, DESK_BACK + 9)} stroke={C.ruleStrong} w={W.hair} o={0.8} />
        <Ink d={`M-20 ${DESK_FRONT}H1620`} stroke={C.ruleStrong} w={W.hair} o={0.9} />
        <Ink d={`M-20 ${DESK_FRONT}H1620V1020H-20Z`} fill={C.ink} fo={0.14} w={0} />
        <Ink d={`M-20 ${DESK_FRONT}H1620`} w={W.near} />
        {[-0.9, -0.6, -0.3, 0.3, 0.6, 0.9].map((k) => (
          <Ink key={k} d={line(800 + k * 360, DESK_BACK + 9, 800 + k * 1040, DESK_FRONT)} stroke={C.ruleStrong} w={W.hair} o={0.45} />
        ))}
      </Layer>
      <Layer at={0.3} to={0.75}>
        {/* the laptop: base, lid, bezel and camera */}
        <Ink d="M404 606H1196L1262 650H338Z" fill={C.paperDeep} w={W.near} />
        <Ink d={rect(338, 650, 924, 12, 6)} fill={C.paper} w={W.near} />
        <Ink d="M740 650Q800 664 860 650" w={W.line} o={0.7} />
        <Ink d={rect(lid.x, lid.y, lid.w, lid.h, 20)} fill={C.inkSoft} w={W.near} />
        <Ink d={rect(screen.x, screen.y, screen.w, screen.h, 5)} fill={C.paperDeep} stroke={C.ink} w={W.line} />
        <Ink d={ellipse(camera.x, camera.y, 3.6, 3.6)} fill={C.ink} stroke={C.rule} w={W.hair} o={0.7} />
      </Layer>
      <Layer at={0.55} to={0.9}>
        {others.map((t, i) => (
          <g key={i}>
            <Ink d={rect(t.x, t.y, t.w, t.h, TILE_R)} fill={C.stage} stroke={C.ink} w={W.line} />
            <Silhouette box={t} kind={(i % 3) as 0 | 1 | 2} />
          </g>
        ))}
        <Ink d={rect(tile.x, tile.y, tile.w, tile.h, TILE_R)} fill={C.stage} w={0} />
      </Layer>
      <Layer at={0.8} to={1}>
        <ControlBar bar={bar} />
      </Layer>
    </>
  );
}

export function CallFront({ call }: { call?: CallGeometry }) {
  const { tile } = callTilesPx(call?.layout);
  return (
    <>
      <Layer at={0.55} to={0.9}>
        <Ink d={rect(tile.x, tile.y, tile.w, tile.h, TILE_R)} stroke={C.ink} w={W.near} />
      </Layer>
      <Layer at={0.6} to={1}>
        {/* things on the desk in front of the laptop */}
        <g transform="translate(1330 816)">
          <Mug />
        </g>
        <g transform="translate(1458 646) scale(1.1)">
          <Plant />
        </g>
        <g transform="translate(330 868)">
          <Ink d="M-150 56L-110 -62H110L150 56Z" fill={C.paper} w={W.near} />
          <Ink d="M0 -62V56" stroke={C.ruleStrong} w={W.line} />
          <Ink d="M-128 30L-100 -34M-100 34L-74 -30M128 30L100 -34M100 34L74 -30" stroke={C.ruleStrong} w={W.hair} o={0.8} />
          <Ink d="M176 44L232 -34L240 -28L184 50Z" fill={C.paper} w={W.line} />
          <Ink d="M232 -34L246 -52L240 -28Z" fill={C.ink} w={W.hair} />
        </g>
      </Layer>
    </>
  );
}
