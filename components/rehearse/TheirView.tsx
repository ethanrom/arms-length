"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistance, spokenDistance } from "@/app/_lib/axis";
import { FrameCanvas } from "@/components/step-back/FrameCanvas";
import { useDistanceFrames } from "@/components/step-back/useDistanceFrames";
import type { RgbaImage, ScaleEstimate } from "@/lib/contracts";
import type { ObserveResult } from "@/lib/contracts/rehearse";
import { lightLabel } from "./labels";

/** Small on purpose: a card shows a glance, and the worker renders it in a fraction of the Step back hero's time. */
const MAX_SIDE = 360;
/** A slider drag or a run of key presses changes the scene many times a second; the render waits for it to settle. */
const SETTLE_MS = 220;

export interface RehearsePhoto {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
}

/** `value` once it has stopped changing for `ms` (immediately on the first render). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

interface Scene {
  luminanceCdM2: number;
  acuityScale: number;
  distanceM: number;
}

/** Renders one frame and hands it up; it draws nothing itself. Remounted (by key) when the light changes, which the hook's own key ignores. */
function FrameRenderer({ photo, scene, onFrame }: { photo: RehearsePhoto; scene: Scene; onFrame: (image: RgbaImage | null, status: "loading" | "ready" | "error") => void }) {
  const { src, scale } = photo;
  const stops = useMemo(() => [scene.distanceM], [scene.distanceM]);
  const viewing = useMemo(
    () => ({ luminanceCdM2: scene.luminanceCdM2, acuityScale: scene.acuityScale, label: "custom" as const, marginDb: 6 }),
    [scene.luminanceCdM2, scene.acuityScale],
  );
  const state = useDistanceFrames(src, scale, viewing, stops, MAX_SIDE);
  const image = state.frames[0] ?? null;
  useEffect(() => onFrame(image, state.status), [image, state.status, onFrame]);
  return null;
}

/**
 * Your face as the people at this moment would see it: the Step back renderer at the moment's distance, light and viewer.
 * It keeps the last picture while the next one is drawn, so editing a moment doesn't flash an empty frame.
 */
export function TheirView({ photo, observe }: { photo: RehearsePhoto; observe: ObserveResult }) {
  const wanted = useMemo<Scene>(
    () => ({ luminanceCdM2: observe.luminanceCdM2, acuityScale: observe.acuityScale, distanceM: observe.distanceM }),
    [observe.luminanceCdM2, observe.acuityScale, observe.distanceM],
  );
  const scene = useSettled(wanted, SETTLE_MS);
  const [shown, setShown] = useState<{ image: RgbaImage | null; status: "loading" | "ready" | "error" }>({ image: null, status: "loading" });
  const onFrame = useMemo(
    () => (image: RgbaImage | null, status: "loading" | "ready" | "error") => setShown((s) => ({ image: image ?? s.image, status })),
    [],
  );
  const settling = scene !== wanted;
  const { width, height } = photo.frame;
  const distance = spokenDistance(observe.distanceM);

  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={`Your face as it looks from ${distance}, in ${lightLabel(observe.input.light).toLowerCase()}. A softened copy of the photo.`}
        data-testid="their-view"
        data-state={settling || shown.status === "loading" ? "loading" : shown.status}
        className="stage on-stage relative overflow-hidden"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <FrameCanvas
          image={shown.image}
          className="absolute inset-0 h-full w-full transition-opacity duration-300"
          style={{ opacity: shown.image ? (settling || shown.status === "loading" ? 0.7 : 1) : 0 }}
        />
        {shown.status === "error" && !shown.image && (
          <p className="absolute inset-0 grid place-items-center bg-paper-deep p-2 text-center text-[0.875rem] leading-snug text-ink-soft">The picture couldn&rsquo;t be drawn here.</p>
        )}
        <FrameRenderer key={`${scene.luminanceCdM2}|${scene.acuityScale}|${scene.distanceM}`} photo={photo} scene={scene} onFrame={onFrame} />
      </div>
      <figcaption className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
        Their view, from <span className="num">{formatDistance(observe.distanceM)}</span>
      </figcaption>
    </figure>
  );
}
