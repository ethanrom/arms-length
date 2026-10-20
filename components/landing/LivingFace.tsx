"use client";

import Image from "next/image";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STOPS,
  clampDistance,
  formatDistance,
  fromUnit,
  layerOpacities,
  locateAmongAnchors,
  spokenDistance,
  toUnit,
} from "@/app/_lib/axis";
import type { DistanceAnchor } from "@/components/results/types";
import { DistanceTape } from "@/components/step-back/DistanceTape";
import { FrameCanvas } from "@/components/step-back/FrameCanvas";
import { useDistanceFrames } from "@/components/step-back/useDistanceFrames";
import { DEFAULT_VIEWING, type ScaleEstimate, type ViewingConditions } from "@/lib/contracts";

const EASE = [0.45, 0, 0.2, 1] as const;

// Used only if the page is rendered without a recorded reading; the real call site always passes both.
const FALLBACK_SCALE: ScaleEstimate = { mmPerPx: 0.17, relSd: 0.04, source: "iris" };

interface LivingFaceProps {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  anchors: DistanceAnchor[];
  /** The photo's scale and viewing conditions, so the stops are drawn by the real distance renderer. */
  scale?: ScaleEstimate;
  viewing?: ViewingConditions;
}

/**
 * Landing visual: one face that steps back from the mirror to across a room, once, then hands the slider over.
 * The stops are drawn by the same renderer as the results page (in a worker); until they are ready a CSS blur stands in.
 */
export function LivingFace({ src, alt, frame, anchors, scale = FALLBACK_SCALE, viewing = DEFAULT_VIEWING }: LivingFaceProps) {
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null);
  const [auto, setAuto] = useState(0.25);
  const [playing, setPlaying] = useState(false);
  const controls = useRef<{ stop: () => void } | null>(null);
  const frames = useDistanceFrames(src, scale, viewing, DEFAULT_STOPS, 900);
  const real = frames.status === "ready";

  const play = () => {
    controls.current?.stop();
    setPicked(null);
    setPlaying(true);
    const u = (d: number) => toUnit(d);
    controls.current = animate(0, [0, 0, u(1), u(1), u(4), u(4), u(1)], {
      duration: 12,
      times: [0, 0.07, 0.27, 0.4, 0.66, 0.78, 1],
      ease: ["linear", EASE, "linear", EASE, "linear", EASE],
      onUpdate: (v) => setAuto(fromUnit(v)),
      onComplete: () => setPlaying(false),
    });
  };

  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(play, 900);
    return () => {
      window.clearTimeout(t);
      controls.current?.stop();
    };
  }, [reduce]);

  const distance = picked ?? (reduce ? 1 : auto);
  const stop = () => {
    controls.current?.stop();
    setPlaying(false);
  };

  const opacities = useMemo(() => layerOpacities(DEFAULT_STOPS, distance), [distance]);
  // The stand-in blur: sigma grows with distance; the photo is already "seen" from the mirror.
  const sigma = real ? 0 : 0.62 * 3.37 * Math.sqrt(Math.max(0, distance * distance - 0.0625));
  const { near, below, above } = locateAmongAnchors(anchors, distance);
  const where = near ? near.label : below && above ? `Between ${below.label.toLowerCase()} and ${above.label.toLowerCase()}` : "";

  return (
    <div>
      <div className="stage on-stage relative h-[min(66svh,600px)] min-h-[24rem] overflow-hidden">
        <div className="absolute inset-0 scale-[1.04]">
          <Image
            src={src}
            alt={alt}
            width={frame.width}
            height={frame.height}
            sizes="(min-width: 1024px) 40vw, 100vw"
            preload
            className="h-full w-full object-cover"
            style={{ filter: sigma > 0 ? `blur(${sigma.toFixed(2)}px)` : undefined, objectPosition: "50% 30%" }}
          />
          {DEFAULT_STOPS.map((s, i) => (
            <FrameCanvas
              key={s}
              image={frames.frames[i] ?? null}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: real ? opacities[i] : 0, objectPosition: "50% 30%" }}
            />
          ))}
        </div>
        <div className="absolute left-3 top-3 border border-ink/15 bg-paper px-3 py-2 sm:left-4 sm:top-4 sm:px-4 sm:py-2.5" aria-hidden="true">
          <span className="eyebrow block !text-[0.625rem]">Seen from</span>
          <span className="serif num mt-0.5 block text-[1.875rem] leading-none sm:text-[2.25rem]">{formatDistance(distance)}</span>
          <span className="mt-1 block min-h-[1.1em] text-[0.75rem] leading-none text-muted">{where}</span>
        </div>
      </div>

      <div className="mt-6">
        <DistanceTape
          value={clampDistance(distance)}
          onChange={(d) => setPicked(d)}
          onUserInput={stop}
          anchors={anchors}
          valueText={`${spokenDistance(distance)}${near ? `, ${near.label.toLowerCase()}` : ""}`}
          label="Step back from the mirror"
        />
        <div className="mt-1 flex items-center justify-between gap-4 text-[0.8125rem] text-muted">
          <span>Drag to step back.</span>
          <button type="button" onClick={play} disabled={playing} className="link min-h-9 disabled:opacity-40" aria-label="Replay the step back animation">
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}
