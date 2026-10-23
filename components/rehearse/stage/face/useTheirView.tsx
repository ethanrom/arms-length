"use client";

/**
 * The model's their-view render of the photo at one distance, light and eyesight: cached by what it depends on, so moving
 * between moments and back is instant, and started after the visible moment's when the priority is "later".
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RgbaImage, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { useDistanceFrames } from "@/components/step-back/useDistanceFrames";
import { frameBase, frameKey, frameStore, povStats, toCanvas, type TheirFrame } from "./frames";
import { laterQueue, type Ticket } from "./queue";

export interface TheirViewArgs {
  src: string;
  scale: ScaleEstimate;
  distanceM: number;
  luminanceCdM2: number;
  acuityScale: number;
  maxSide: number;
  priority: "now" | "later";
  /** False until the size to render at is known: nothing is rendered (or counted) meanwhile. */
  enabled: boolean;
}

export interface TheirView {
  /** Null until the render lands (or fails). */
  frame: TheirFrame | null;
  /** The frame was rendered while this view was on screen (so it should fade in) rather than found in the cache. */
  fresh: boolean;
  failed: boolean;
  /** Include in the tree: it does the rendering. */
  renderer: ReactNode;
}

export function useTheirView({ src, scale, distanceM, luminanceCdM2, acuityScale, maxSide, priority, enabled }: TheirViewArgs): TheirView {
  const key = frameKey(src, distanceM, luminanceCdM2, acuityScale, maxSide);
  const [startedKey, setStartedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const ticket = useRef<Ticket | null>(null);

  // While a resize moves to the next size step, the frame at the old step stays up rather than falling back to the placeholder.
  const exact = frameStore.get(key) ?? null;
  const cached = exact ?? (enabled ? (frameStore.findByPrefix(frameBase(src, distanceM, luminanceCdM2, acuityScale)) ?? null) : null);
  const failed = failedKey === key;
  const wanted = enabled && exact === null && !failed;
  // Once a render has started it carries on, even if the moment stops being the visible one.
  if (wanted && priority === "now" && startedKey !== key) setStartedKey(key);
  const started = wanted && startedKey === key;

  useEffect(() => {
    if (!enabled) return;
    if (frameStore.has(key)) povStats.hits++;
    else povStats.misses++;
  }, [key, enabled]);

  useEffect(() => {
    if (!wanted || priority === "now") return;
    const t = laterQueue.enqueue(() => setStartedKey(key));
    ticket.current = t;
    return () => {
      t.release();
      if (ticket.current === t) ticket.current = null;
    };
  }, [wanted, priority, key]);

  // Stable inputs for useDistanceFrames, which restarts whenever they change identity.
  const stableScale = useMemo(() => scale, [scale.mmPerPx, scale.relSd, scale.source, scale.irisPx]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewing = useMemo<ViewingConditions>(() => ({ luminanceCdM2, acuityScale, label: "custom", marginDb: 6 }), [luminanceCdM2, acuityScale]);
  const stops = useMemo(() => [distanceM], [distanceM]);

  const renderer = started ? (
    <Renderer
      src={src}
      scale={stableScale}
      viewing={viewing}
      stops={stops}
      maxSide={maxSide}
      onFrame={(image, ms) => {
        frameStore.set(key, { canvas: toCanvas(image), width: image.width, height: image.height });
        povStats.renders.push({ key, ms, at: performance.now() });
        setFreshKey(key);
      }}
      onError={() => setFailedKey(key)}
      onSettled={() => ticket.current?.release()}
    />
  ) : null;

  return { frame: cached, fresh: exact !== null && freshKey === key, failed, renderer };
}

interface RendererProps {
  src: string;
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  stops: readonly number[];
  maxSide: number;
  onFrame: (image: RgbaImage, ms: number) => void;
  onError: () => void;
  onSettled: () => void;
}

/** Runs the render through the existing worker-backed hook and hands the frame up. Renders nothing. */
function Renderer({ src, scale, viewing, stops, maxSide, onFrame, onError, onSettled }: RendererProps) {
  const state = useDistanceFrames(src, scale, viewing, stops, maxSide);
  const startedAt = useRef(0);
  const handlers = useRef({ onFrame, onError, onSettled });
  useEffect(() => {
    handlers.current = { onFrame, onError, onSettled };
  });
  useEffect(() => {
    startedAt.current = performance.now();
    return () => handlers.current.onSettled();
  }, []);

  const image = state.frames[0];
  useEffect(() => {
    if (state.status === "ready" && image) handlers.current.onFrame(image, performance.now() - startedAt.current);
    else if (state.status === "error") handlers.current.onError();
  }, [state.status, image]);

  return null;
}
