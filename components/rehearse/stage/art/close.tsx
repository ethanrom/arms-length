"use client";

/**
 * Close talk: no props. A soft vignette closes in around a large face, three faint rings (the distances people keep from
 * each other, drawn without words) sit behind it, and a plain top gives the portrait a body.
 */
import { C, Ink, Layer, W, Wash } from "./ink";
import { Garment } from "./garment";
import { inPersonFace } from "./layout";
import { ellipse } from "./shapes";

export function CloseBack({ uid }: { uid: string }) {
  const { cx, cy } = inPersonFace("close_talk");
  return (
    <>
      <defs>
        <radialGradient id={`${uid}v`} cx="50%" cy="44%" r="78%">
          <stop offset="0.45" stopColor={C.ink} stopOpacity="0" />
          <stop offset="1" stopColor={C.ink} stopOpacity="0.34" />
        </radialGradient>
      </defs>
      <Layer at={0} to={0.7}>
        {[470, 700, 940].map((r, i) => (
          <Ink key={r} d={ellipse(cx * 1600, cy * 1000, r, r)} stroke={C.paper} w={W.line} o={0.34 - i * 0.08} />
        ))}
      </Layer>
      <Layer at={0.3} to={1}>
        <Wash d="M0 0H1600V1000H0Z" fill={`url(#${uid}v)`} />
      </Layer>
    </>
  );
}

export function CloseFront() {
  return (
    <Layer at={0.5} to={1}>
      <Garment scene="close_talk" shade={34} />
    </Layer>
  );
}
