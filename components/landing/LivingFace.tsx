"use client";

import Image from "next/image";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { clampDistance, formatDistance, fromUnit, locateAmongAnchors, spokenDistance, toUnit } from "@/app/_lib/axis";
import type { DistanceAnchor } from "@/components/results/types";
import { DistanceTape } from "@/components/step-back/DistanceTape";

const EASE = [0.45, 0, 0.2, 1] as const;

interface LivingFaceProps {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  anchors: DistanceAnchor[];
}

/**
 * Landing visual: one face that steps back from the mirror to across a room, once, then hands the slider over.
 * Uses a CSS blur as an illustration; the results page draws the real thing through the DistanceRenderer.
 */
export function LivingFace({ src, alt, frame, anchors }: LivingFaceProps) {
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null);
  const [auto, setAuto] = useState(0.25);
  const [playing, setPlaying] = useState(false);
  const controls = useRef<{ stop: () => void } | null>(null);

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

  // Matches the mock renderer: sigma grows with distance; the photo is already "seen" from the mirror.
  const sigma = 0.62 * 3.37 * Math.sqrt(Math.max(0, distance * distance - 0.0625));
  const { near, below, above } = locateAmongAnchors(anchors, distance);
  const where = near ? near.label : below && above ? `Between ${below.label.toLowerCase()} and ${above.label.toLowerCase()}` : "";

  return (
    <div>
      <div className="stage on-stage relative h-[min(66svh,600px)] min-h-[24rem] overflow-hidden">
        <Image
          src={src}
          alt={alt}
          width={frame.width}
          height={frame.height}
          sizes="(min-width: 1024px) 40vw, 100vw"
          preload
          className="h-full w-full scale-[1.04] object-cover"
          style={{ filter: `blur(${sigma.toFixed(2)}px)`, objectPosition: "50% 30%" }}
        />
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
