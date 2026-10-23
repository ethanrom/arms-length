"use client";

/**
 * One face on the stage: a soft placeholder (the photo, heavily blurred) until the model's frame lands, then the frame
 * fading in over it. In a video call the frame is first pushed through the stream's resolution. Decorative: the Stage
 * labels the whole picture.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { streamSize } from "../pov";
import type { TheirFrame } from "./frames";
import { resampleThroughStream } from "./stream";

export const FADE_MS = 300;
/** Only if the end of the fade is never reported (a hidden tab pauses transitions): long, so a fade in progress is not cut short. */
const SETTLE_FALLBACK_MS = 2500;
/** The largest side a drawn canvas gets, in device pixels. */
const CANVAS_CAP = 2048;

export interface FacePictureProps {
  /** The photo, for the placeholder. */
  src: string;
  frame: TheirFrame | null;
  /** The frame was rendered just now (so it fades in) rather than found in the cache. */
  fresh: boolean;
  /** Position and size, as percentages of the parent. */
  box: { left: number; top: number; width: number; height: number };
  /** CSS mask-image: the feather. */
  mask: string;
  blurPx: number;
  reduced: boolean;
  /** Video calls: the stream's rows for the whole photo, and the size to draw at in device pixels (null until measured). */
  stream?: { rows: number; display: { w: number; h: number } | null };
}

type Phase = "idle" | "armed" | "settled";

export function FacePicture({ src, frame, fresh, box, mask, blurPx, reduced, stream }: FacePictureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const fade = fresh && !reduced;
  const rows = stream?.rows;
  const displayW = stream?.display?.w;
  const displayH = stream?.display?.h;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    if (rows !== undefined && displayW && displayH) {
      const k = Math.min(1, CANVAS_CAP / Math.max(displayW, displayH));
      const display = { w: Math.max(2, Math.round(displayW * k)), h: Math.max(2, Math.round(displayH * k)) };
      resampleThroughStream(frame.canvas, streamSize(rows, frame), canvas, display);
    } else {
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvas.getContext("2d")?.drawImage(frame.canvas, 0, 0);
    }
  }, [frame, rows, displayW, displayH]);

  // Painted. Resolve the hidden style first, so that changing it next is a transition and not a first paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!frame || !canvas || phase !== "idle") return;
    void getComputedStyle(canvas).opacity;
    const arm = setTimeout(() => setPhase(fade ? "armed" : "settled"), 16);
    return () => clearTimeout(arm);
  }, [frame, phase, fade]);

  // The transition's end settles the picture; this covers a transition that never reports back.
  useEffect(() => {
    if (phase !== "armed") return;
    const settle = setTimeout(() => setPhase("settled"), SETTLE_FALLBACK_MS);
    return () => clearTimeout(settle);
  }, [phase]);

  const shown = frame !== null && (phase !== "idle" || !fade);
  const placeholder = !frame || (fade && phase !== "settled");
  const wrapper: CSSProperties = {
    position: "absolute",
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
  const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

  return (
    <div style={wrapper}>
      {placeholder && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" aria-hidden="true" draggable={false} style={{ ...fill, objectFit: "fill", filter: `blur(${blurPx}px)`, opacity: 0.55 }} />
      )}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        onTransitionEnd={() => setPhase("settled")}
        style={{ ...fill, opacity: shown ? 1 : 0, transition: fade ? `opacity ${FADE_MS}ms ease-out` : "none" }}
      />
    </div>
  );
}
