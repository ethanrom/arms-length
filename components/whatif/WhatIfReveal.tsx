"use client";

import Image from "next/image";
import { useState } from "react";
import { formatDistance } from "@/app/_lib/axis";
import { DistanceAxisHeader, DistanceBar } from "@/components/concerns/DistanceBar";
import type { ConcernView } from "@/components/results/derive";
import type { DistanceAnchor, WhatIfView } from "@/components/results/types";

interface WhatIfRevealProps {
  whatIf: WhatIfView;
  view: ConcernView | undefined;
  src: string;
  alt: string;
  frame: { width: number; height: number };
  anchors: DistanceAnchor[];
}

export function WhatIfReveal({ whatIf, view, src, alt, frame, anchors }: WhatIfRevealProps) {
  const [pos, setPos] = useState(50);
  const { beforeDistanceM, afterDistanceM } = whatIf.whatIf;
  const aspect = frame.width / frame.height;
  const interval = view?.visibility.intervalM ?? [beforeDistanceM * 0.92, beforeDistanceM * 1.08];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <div className="order-2 lg:order-1">
        <p className="eyebrow">What would change what others see</p>
        <p className="serif mt-3 text-[clamp(1.875rem,1.3rem+2vw,3rem)] leading-[1.08]" style={{ fontWeight: 340 }} aria-live="polite">
          {whatIf.headline}
        </p>
        <p className="mt-5 max-w-[32rem] text-[0.9375rem] leading-relaxed text-ink-soft">{whatIf.detail}</p>

        <div className="mt-10 border-t border-rule pt-5">
          <div className="hidden sm:block">
            <DistanceAxisHeader anchors={anchors} />
          </div>
          <dl className="mt-1">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="eyebrow">{whatIf.beforeLabel}</dt>
              <dd className="num font-mono text-[0.75rem]">visible to {formatDistance(beforeDistanceM)}</dd>
            </div>
            <DistanceBar maxM={beforeDistanceM} intervalM={[interval[0], interval[1]]} relief={false} tickM={anchors.map((a) => a.distanceM)} ghostM={afterDistanceM} />
            <div className="flex items-baseline justify-between gap-4">
              <dt className="eyebrow">{whatIf.afterLabel}</dt>
              <dd className="num font-mono text-[0.75rem]">visible to {formatDistance(afterDistanceM)} (dashed)</dd>
            </div>
          </dl>
        </div>
      </div>

      <figure className="order-1 lg:order-2">
        <div className="stage on-stage relative flex items-center justify-center overflow-hidden [--stage-h:min(72svh,720px)]">
          <div className="relative" style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100%, calc(var(--stage-h) * ${aspect}))` }}>
            <Image src={src} alt={alt} width={frame.width} height={frame.height} sizes="(min-width: 1024px) 45vw, 100vw" className="absolute inset-0 h-full w-full" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <Image
                src={whatIf.afterImage}
                alt=""
                width={frame.width}
                height={frame.height}
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="absolute inset-0 h-full w-full"
              />
            </div>

            <span className="pointer-events-none absolute left-3 top-3 border border-ink/15 bg-paper px-2.5 py-1.5 text-[0.75rem] leading-none">{whatIf.afterLabel}</span>
            <span className="pointer-events-none absolute right-3 top-3 border border-ink/15 bg-paper px-2.5 py-1.5 text-[0.75rem] leading-none">{whatIf.beforeLabel}</span>

            {/* divider */}
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-paper shadow-[0_0_0_1px_var(--ink)]" style={{ left: `${pos}%`, transform: "translateX(-50%)" }}>
              <span className="reveal-knob absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink bg-paper">
                <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
                  <path d="M5 1L1 5l4 4M11 1l4 4-4 4" stroke="#161513" strokeWidth="1.3" />
                </svg>
              </span>
            </div>
            <input
              type="range"
              className="tape-range peer"
              min={0}
              max={100}
              step={1}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              aria-label={`Compare: ${whatIf.afterLabel.toLowerCase()} on the left, ${whatIf.beforeLabel.toLowerCase()} on the right`}
              aria-valuetext={`${pos} percent ${whatIf.afterLabel.toLowerCase()}`}
            />
            <span className="pointer-events-none absolute inset-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-4px] peer-focus-visible:outline-paper" />
          </div>
        </div>
        <figcaption className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          Drag to compare.
          {whatIf.afterIsPreview ? " The faded version is an illustrative preview until the matching simulation is recorded." : " The faded version is a recorded skin simulation."}
        </figcaption>
      </figure>
    </div>
  );
}
