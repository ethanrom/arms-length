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

type Playback = "idle" | "playing" | "paused";

/**
 * Landing visual: one face that steps back from the mirror to across a room, once, then hands the slider over.
 * The stops are drawn by the same renderer as the results page (in a worker); until they are ready a CSS blur stands in.
 * The 12 s sweep starts on its own, so it has a visible Pause/Play button (WCAG 2.2.2); touching the tape stops it for good.
 */
export function LivingFace({ src, alt, frame, anchors, scale = FALLBACK_SCALE, viewing = DEFAULT_VIEWING }: LivingFaceProps) {
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null);
  const [auto, setAuto] = useState(0.25);
  const [playback, setPlayback] = useState<Playback>("idle");
  const [played, setPlayed] = useState(false);
  const controls = useRef<ReturnType<typeof animate> | null>(null);
  const frames = useDistanceFrames(src, scale, viewing, DEFAULT_STOPS, 900);
  const real = frames.status === "ready";

  const play = () => {
    controls.current?.stop();
    setPicked(null);
    setPlayback("playing");
    setPlayed(true);
    const u = (d: number) => toUnit(d);
    controls.current = animate(0, [0, 0, u(1), u(1), u(4), u(4), u(1)], {
      duration: 12,
      times: [0, 0.07, 0.27, 0.4, 0.66, 0.78, 1],
      ease: ["linear", EASE, "linear", EASE, "linear", EASE],
      onUpdate: (v) => setAuto(fromUnit(v)),
      onComplete: () => setPlayback("idle"),
    });
  };

  const toggle = () => {
    if (playback === "playing") {
      controls.current?.pause();
      setPlayback("paused");
    } else if (playback === "paused") {
      controls.current?.play();
      setPlayback("playing");
    } else play();
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
    setPlayback("idle");
  };
  const toggleLabel = playback === "playing" ? "Pause" : playback === "paused" ? "Play" : played ? "Replay" : "Play the step back";

  const opacities = useMemo(() => layerOpacities(DEFAULT_STOPS, distance), [distance]);
  // The stand-in blur: sigma grows with distance; the photo is already "seen" from the mirror.
  const sigma = real ? 0 : 0.62 * 3.37 * Math.sqrt(Math.max(0, distance * distance - 0.0625));
  const { near, below, above } = locateAmongAnchors(anchors, distance);
  const where = near ? near.label : below && above ? `Between ${below.label.toLowerCase()} and ${above.label.toLowerCase()}` : "";

  return (
    <div>
      <div className="stage on-stage relative h-[clamp(15rem,37svh,26rem)] overflow-hidden lg:h-[min(66svh,600px)] lg:min-h-[24rem]">
        <div className="absolute inset-0 scale-[1.04]">
          <Image
            src={src}
            alt={alt}
            width={frame.width}
            height={frame.height}
            sizes="(min-width: 1024px) 40vw, 100vw"
            preload
            className="h-full w-full object-cover"
            style={{ filter: sigma > 0 ? `blur(${sigma.toFixed(2)}px)` : undefined, objectPosition: "50% 34%" }}
          />
          {DEFAULT_STOPS.map((s, i) => (
            <FrameCanvas
              key={s}
              image={frames.frames[i] ?? null}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: real ? opacities[i] : 0, objectPosition: "50% 34%" }}
            />
          ))}
        </div>
        <div className="absolute left-3 top-3 border border-ink/15 bg-paper px-3 py-2 sm:left-4 sm:top-4 sm:px-4 sm:py-2.5" aria-hidden="true">
          <span className="eyebrow block !text-[0.75rem]">Seen from</span>
          <span className="serif num mt-0.5 block text-[1.75rem] leading-none sm:text-[2.25rem]">{formatDistance(distance)}</span>
          <span className="mt-1 block min-h-[1.1em] text-[0.875rem] leading-none text-muted">{where}</span>
        </div>
      </div>

      <div className="mt-4 sm:mt-6">
        <DistanceTape
          value={clampDistance(distance)}
          onChange={(d) => setPicked(d)}
          onUserInput={stop}
          anchors={anchors}
          valueText={`${spokenDistance(distance)}${near ? `, ${near.label.toLowerCase()}` : ""}`}
          label="Step back from the mirror"
        />
        <div className="mt-1 flex items-center justify-between gap-4 text-[0.875rem] text-muted">
          <span>Drag the tape to step back.</span>
          {/* With reduced motion there is no sweep to pause: the face rests at 1 m and the tape does the rest. */}
          {!reduce && (
            <button type="button" onClick={toggle} className="link inline-flex min-h-11 items-center px-1 text-ink">
              {toggleLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
