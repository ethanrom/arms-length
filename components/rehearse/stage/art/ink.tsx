"use client";

/**
 * Drawing primitives for the scene line art. Everything is a path with pathLength 1, so one dash offset draws any shape
 * in; `drawn` 0 renders nothing and 1 renders the finished picture (no dashes left behind).
 */
import { createContext, useContext, useId, type ReactNode } from "react";
import { STAGE_VIEWBOX } from "../types";

/** Site tokens (app/globals.css). The wall is the stage grey so a photo's own grey surround melts into it. */
export const C = {
  ink: "var(--ink)",
  inkSoft: "var(--ink-soft)",
  paper: "var(--paper)",
  paperDeep: "var(--paper-deep)",
  rule: "var(--rule)",
  ruleStrong: "var(--rule-strong)",
  muted: "var(--muted)",
  stage: "var(--stage)",
  stageEdge: "var(--stage-edge)",
} as const;

/** Stroke weights at 1600 wide: far things thin, near things heavier. */
export const W = { hair: 1, line: 1.35, near: 1.9 } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => t * t * (3 - 2 * t);

const Progress = createContext(1);

/** The SVG for one layer of a scene. `drawn` is the whole picture's progress. */
export function Canvas({ drawn, children }: { drawn: number; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${STAGE_VIEWBOX.width} ${STAGE_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <Progress.Provider value={clamp01(drawn)}>{children}</Progress.Provider>
    </svg>
  );
}

/** A group that draws between `at` and `to` of the whole progress (both 0..1), so a scene builds up in order. */
export function Layer({ at = 0, to = 1, children }: { at?: number; to?: number; children: ReactNode }) {
  const whole = useContext(Progress);
  const p = to > at ? clamp01((whole - at) / (to - at)) : whole >= to ? 1 : 0;
  return <Progress.Provider value={p}>{children}</Progress.Provider>;
}

/** Ids that are safe in url(#...) and unique per mounted scene, so two stages on a page never share a gradient. */
export function useUid(): string {
  return `s${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

export interface InkProps {
  d: string;
  /** Fill colour or a gradient reference. Default none. */
  fill?: string;
  /** Fill opacity at full progress. */
  fo?: number;
  stroke?: string;
  w?: number;
  /** Stroke opacity. */
  o?: number;
}

/** One stroke (and optional fill) that draws in with the layer's progress. Set w to 0 for a fill with no outline. */
export function Ink({ d, fill = "none", fo = 1, stroke = C.ink, w = W.line, o = 1 }: InkProps) {
  const p = useContext(Progress);
  if (p <= 0) return null;
  const done = p >= 1;
  return (
    <path
      d={d}
      pathLength={1}
      style={{
        fill,
        fillOpacity: fill === "none" ? undefined : fo * (done ? 1 : ease(clamp01((p - 0.35) / 0.65))),
        stroke: w > 0 ? stroke : "none",
        strokeWidth: w,
        strokeOpacity: o,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeDasharray: done ? undefined : 1,
        strokeDashoffset: done ? undefined : 1 - ease(p),
      }}
    />
  );
}

/** A soft wash (no outline) that fades in with the layer. */
export function Wash({ d, fill, fo = 1 }: { d: string; fill: string; fo?: number }) {
  const p = useContext(Progress);
  if (p <= 0) return null;
  return <path d={d} style={{ fill, fillOpacity: fo * ease(p), stroke: "none" }} />;
}

/** Wraps children so they fade in with the layer instead of drawing (for gradient washes made of a few shapes). */
export function Fade({ children, o = 1 }: { children: ReactNode; o?: number }) {
  const p = useContext(Progress);
  if (p <= 0) return null;
  return <g style={{ opacity: o * ease(p) }}>{children}</g>;
}
