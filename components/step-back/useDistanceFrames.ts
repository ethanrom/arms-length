"use client";

import { useEffect, useState } from "react";
import type { RgbaImage, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { loadPhoto, scaleForWorking } from "./photo";
import { renderFrames } from "./renderClient";

export interface FramesState {
  status: "loading" | "ready" | "error";
  /** One rendered frame per requested distance (null until it lands). */
  frames: (RgbaImage | null)[];
  /** Fraction of stops done, 0..1. */
  progress: number;
}

const IDLE: FramesState = { status: "loading", frames: [], progress: 0 };

/**
 * Renders a photo at several distances through the DistanceRenderer (in a worker) and reports progress.
 * `stops` and `scale` must be referentially stable between renders (module constants or memoised).
 */
export function useDistanceFrames(
  src: string,
  scale: ScaleEstimate,
  viewing: ViewingConditions,
  stops: readonly number[],
  maxSide = 1200,
): FramesState {
  const [state, setState] = useState<{ key: string; value: FramesState }>({ key: "", value: IDLE });
  const key = `${src}|${stops.join(",")}|${maxSide}|${scale.mmPerPx}|${viewing.label}|${viewing.acuityScale}`;

  useEffect(() => {
    const controller = new AbortController();
    const frames: (RgbaImage | null)[] = stops.map(() => null);
    let done = 0;

    loadPhoto(src, maxSide)
      .then(({ image, shrink }) =>
        renderFrames(
          { photo: image, scale: scaleForWorking(scale, shrink), viewing, distances: [...stops] },
          (frame) => {
            frames[frame.index] = frame.image;
            done++;
            setState({
              key,
              value: { status: done === stops.length ? "ready" : "loading", frames: [...frames], progress: done / stops.length },
            });
          },
          controller.signal,
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, value: { status: "error", frames: [], progress: 0 } });
      });

    return () => controller.abort();
  }, [key, src, scale, viewing, stops, maxSide]);

  return state.key === key ? state.value : IDLE;
}

/** A single render at one distance (used for before/after comparisons). Keeps the previous frame while the next renders. */
export function useRenderedFrame(
  src: string,
  scale: ScaleEstimate,
  viewing: ViewingConditions,
  distanceM: number,
  maxSide = 900,
): { frame: RgbaImage | null; busy: boolean; error: boolean } {
  const [state, setState] = useState<{ key: string; frame: RgbaImage | null; error: boolean }>({ key: "", frame: null, error: false });
  const key = `${src}|${distanceM}|${maxSide}|${scale.mmPerPx}|${viewing.label}|${viewing.acuityScale}`;

  useEffect(() => {
    const controller = new AbortController();
    loadPhoto(src, maxSide)
      .then(({ image, shrink }) =>
        renderFrames(
          { photo: image, scale: scaleForWorking(scale, shrink), viewing, distances: [distanceM] },
          (f) => setState({ key, frame: f.image, error: false }),
          controller.signal,
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState((s) => ({ ...s, key, error: true }));
      });
    return () => controller.abort();
  }, [key, src, scale, viewing, distanceM, maxSide]);

  return { frame: state.frame, busy: state.key !== key, error: state.error };
}
