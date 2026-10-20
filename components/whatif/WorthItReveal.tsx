"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { DistanceAxisHeader, DistanceBar } from "@/components/concerns/DistanceBar";
import type { DistanceAnchor, WorthItView } from "@/components/results/types";

interface WorthItRevealProps {
  worthIt: WorthItView;
  src: string;
  alt: string;
  frame: { width: number; height: number };
  anchors: DistanceAnchor[];
  /** DISCLAIMERS.simulation, from lib/copy. */
  disclaimer: string;
}

/**
 * "Worth it?": for each concern, how far away someone could still tell the difference a half-strength improvement
 * makes (lib/vision/worthIt.ts), with the YouCam Skin Simulation it came from as a before/after.
 */
export function WorthItReveal({ worthIt, src, alt, frame, anchors, disclaimer }: WorthItRevealProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [pos, setPos] = useState(50);
  const groupId = useId();
  const items = worthIt.items;
  const selected = items.find((i) => i.concern === picked) ?? items[0];
  const aspect = frame.width / frame.height;
  const tickM = anchors.map((a) => a.distanceM);

  if (worthIt.state !== "ready" || !selected) {
    return (
      <div role="status" aria-live="polite" className="max-w-[36rem]">
        <p className="serif text-[clamp(1.5rem,1.2rem+1.2vw,2.25rem)] leading-snug" style={{ fontWeight: 360 }}>
          {worthIt.state === "error" ? "The improvement views could not be drawn." : "Working out what a half-strength change would show."}
        </p>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
          {worthIt.message ??
            (worthIt.state === "error"
              ? "The numbers above are unaffected."
              : "YouCam Skin Simulation draws two improved versions of this face (4 units each). It takes about ten seconds and the results above stay as they are.")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
      <div className="order-2 lg:order-1">
        <p className="max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">{worthIt.lede}</p>

        <div className="mt-8 hidden border-t border-rule pt-5 sm:block">
          <DistanceAxisHeader anchors={anchors} />
        </div>
        <div role="radiogroup" aria-label="Concern to compare" className="mt-1 sm:mt-0">
          {items.map((item) => {
            const active = item.concern === selected.concern;
            const d = item.typicalM;
            return (
              <label key={item.concern} className="relative block cursor-pointer border-t border-rule first:border-t-0 sm:first:border-t">
                <input type="radio" name={groupId} className="peer sr-only" checked={active} onChange={() => setPicked(item.concern)} />
                <span className="block py-5 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-ink">
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className={`block h-2.5 w-2.5 shrink-0 rounded-full border border-ink ${active ? "bg-ink" : "bg-transparent"}`} />
                    <span className="eyebrow !text-ink-soft">{item.title}</span>
                    <span className="eyebrow ml-auto">{active ? "Comparing" : "Compare"}</span>
                  </span>
                  <span className="serif mt-3 block text-[clamp(1.25rem,1.05rem+0.8vw,1.625rem)] leading-[1.2]" style={{ fontWeight: 380 }}>
                    {item.headline}
                  </span>
                  {/* A large soft area states no distance. */}
                  {!item.soft && (
                    <span className="mt-1 block">
                      <DistanceBar
                        maxM={d}
                        intervalM={[d, d]}
                        relief={d <= 1.5}
                        tickM={tickM}
                        description={`${item.title}: a typical sharp-eyed person could tell the difference up to ${Math.round(d * 10) / 10} metres.`}
                      />
                    </span>
                  )}
                  {active && <span className="mt-2 block max-w-[34rem] text-[0.9375rem] leading-relaxed text-muted">{item.detail}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <figure className="order-1 lg:order-2">
        <div className="stage on-stage relative flex items-center justify-center overflow-hidden [--stage-h:min(72svh,720px)]">
          <div className="relative" style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100%, calc(var(--stage-h) * ${aspect}))` }}>
            <Image src={src} alt={alt} width={frame.width} height={frame.height} unoptimized sizes="(min-width: 1024px) 45vw, 100vw" className="absolute inset-0 h-full w-full" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <Image src={selected.afterImage} alt="" width={frame.width} height={frame.height} unoptimized sizes="(min-width: 1024px) 45vw, 100vw" className="absolute inset-0 h-full w-full" />
            </div>

            <span className="pointer-events-none absolute left-3 top-3 border border-ink/15 bg-paper px-2.5 py-1.5 text-[0.75rem] leading-none">{worthIt.afterLabel}</span>
            <span className="pointer-events-none absolute right-3 top-3 border border-ink/15 bg-paper px-2.5 py-1.5 text-[0.75rem] leading-none">{worthIt.beforeLabel}</span>

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
              aria-label={`Compare: ${worthIt.afterLabel.toLowerCase()} on the left, ${worthIt.beforeLabel.toLowerCase()} on the right`}
              aria-valuetext={`${pos} percent ${worthIt.afterLabel.toLowerCase()}`}
            />
            <span className="pointer-events-none absolute inset-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-4px] peer-focus-visible:outline-paper" />
          </div>
        </div>
        <figcaption className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          Drag to compare. {disclaimer}
        </figcaption>
      </figure>
    </div>
  );
}
