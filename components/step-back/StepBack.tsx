"use client";

import Image from "next/image";
import { animate, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import {
  DEFAULT_AXIS,
  DEFAULT_STOPS,
  clampDistance,
  formatDistance,
  fromUnit,
  layerOpacities,
  locateAmongAnchors,
  percent,
  spokenDistance,
  thresholdLabelOpacity,
  toUnit,
} from "@/app/_lib/axis";
import type { Box, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { stepBackCounter } from "@/lib/copy";
import { faceScaleAt } from "@/lib/integration/faceScale";
import { statusAt, type ConcernView } from "@/components/results/derive";
import type { DistanceAnchor } from "@/components/results/types";
import { DistanceTape } from "./DistanceTape";
import { FrameCanvas } from "./FrameCanvas";
import { Loupe } from "./Loupe";
import { NamedDistances } from "./NamedDistances";
import { useDistanceFrames } from "./useDistanceFrames";

const EASE = [0.22, 1, 0.36, 1] as const;
const MIN_ANALYSING_MS = 1500;
const INTRO_DISTANCE_M = 1;
const STATUS_REST_MS = 700;

interface StepBackProps {
  src: string;
  alt: string;
  frame: { width: number; height: number };
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  concerns: ConcernView[];
  anchors: DistanceAnchor[];
  statusLines: string[];
  rendererNote: string;
  /** What is and is not drawn, said once under the face. */
  heroLabel: string;
  /** The "An estimate from one photo" line, under the face where the first number is. */
  estimate: string;
  /** The study the model was checked against, shown beside the first number. */
  validation: { text: string; href: string };
  /** The patch of cheek and nose the loupe magnifies, in frame px. */
  loupe: Box;
  stops?: readonly number[];
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (notify: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** The reduced-motion preference, false on the server and during hydration so the first client render equals the server's. */
function useCalm(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

/** "pores and fine lines are mostly out of sight; dark spots can still be picked out." */
function restingSentence(concerns: ConcernView[], distance: number): string {
  const groups: Record<"none" | "some" | "most", string[]> = { none: [], some: [], most: [] };
  for (const c of concerns) groups[statusAt(c, distance).state].push(c.copy.title.toLowerCase());
  const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  const parts = [
    groups.none.length ? `${list(groups.none)} out of sight` : "",
    groups.some.length ? `${list(groups.some)} mostly out of sight` : "",
    groups.most.length ? `${list(groups.most)} can still be picked out` : "",
  ].filter(Boolean);
  return `At ${spokenDistance(distance)}: ${parts.join("; ")}.`;
}

export function StepBack({
  src,
  alt,
  frame,
  scale,
  viewing,
  concerns,
  anchors,
  statusLines,
  rendererNote,
  heroLabel,
  estimate,
  validation,
  loupe,
  stops = DEFAULT_STOPS,
}: StepBackProps) {
  const reduce = useCalm();
  const frames = useDistanceFrames(src, scale, viewing, stops);

  // The focus pull lasts long enough to read, even when the renders are fast. The controls never wait for it.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), reduce ? 0 : MIN_ANALYSING_MS);
    return () => window.clearTimeout(t);
  }, [reduce]);
  const ready = frames.status === "ready" && waited;
  const failed = frames.status === "error";

  const [picked, setPicked] = useState<number | null>(null);
  const touched = useRef(false);
  const intro = useRef<{ stop: () => void } | null>(null);
  // Reduced motion starts at conversation distance; otherwise at the mirror, then glides there.
  const distance = picked ?? (reduce ? INTRO_DISTANCE_M : DEFAULT_AXIS.min);

  const stopIntro = useCallback(() => {
    touched.current = true;
    intro.current?.stop();
  }, []);

  // After the focus pull, glide from the mirror to conversation distance once, to show what the slider does.
  useEffect(() => {
    if (!ready || reduce || touched.current) return;
    const controls = animate(0, toUnit(INTRO_DISTANCE_M), {
      duration: 2.4,
      delay: 0.5,
      ease: EASE,
      onUpdate: (u) => {
        if (!touched.current) setPicked(fromUnit(u));
      },
    });
    intro.current = controls;
    return () => controls.stop();
  }, [ready, reduce]);

  const pick = useCallback(
    (d: number) => {
      stopIntro();
      setPicked(clampDistance(d));
    },
    [stopIntro],
  );

  const opacities = useMemo(() => layerOpacities(stops, distance), [stops, distance]);
  const { near, below, above } = locateAmongAnchors(anchors, distance);
  const where = near
    ? near.label
    : below && above
      ? `Between ${below.label.toLowerCase()} and ${above.label.toLowerCase()}`
      : (below ?? above)?.label ?? "";

  const visibleNow = concerns.filter((c) => statusAt(c, distance).state === "most");
  const valueText = `${spokenDistance(distance)}${near ? `, ${near.label.toLowerCase()}` : ""}. ${visibleNow.length} of ${concerns.length} concerns can still be picked out.`;
  const marked = concerns.filter((c) => !c.soft);

  // A polite summary once the slider rests, so a screen reader hears what changed without a sentence per step.
  const [spoken, setSpoken] = useState("");
  useEffect(() => {
    if (picked === null) return;
    const t = window.setTimeout(() => setSpoken(restingSentence(concerns, distance)), STATUS_REST_MS);
    return () => window.clearTimeout(t);
  }, [concerns, distance, picked]);

  const [num, unit] = formatDistance(distance).split(" ");
  const statusIndex = Math.min(statusLines.length - 1, Math.floor(frames.progress * statusLines.length));
  const aspect = frame.width / frame.height;
  const s = faceScaleAt(distance);
  const toScaled = (pct: number) => 50 + (pct - 50) * s;

  // the You | Them seam
  const [seam, setSeam] = useState(50);
  const faceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const seamFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = faceRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) setSeam(clampPct(((e.clientX - rect.left) / rect.width) * 100));
  };
  const seamKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "PageUp" || e.key === "PageDown" || e.shiftKey ? 10 : 2;
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown"
        ? seam - step
        : e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp"
          ? seam + step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 100
              : null;
    if (next === null) return;
    e.preventDefault();
    setSeam(clampPct(next));
  };
  const showSeam = ready && !failed;

  return (
    <div className="grid gap-x-12 gap-y-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-14 lg:gap-y-4">
      {/* the face */}
      <div
        data-testid="step-back-stage"
        className="stage on-stage relative order-1 flex items-center justify-center overflow-hidden [--stage-h:min(42svh,480px)] lg:col-start-1 lg:row-start-1 lg:[--stage-h:min(58svh,620px)]"
        style={{ height: "var(--stage-h)" }}
      >
        <div className="relative" style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100%, calc(var(--stage-h) * ${aspect}))` }}>
          {/* the face layer shrinks gently with distance; the seam, pins and labels stay at full size */}
          <div
            ref={faceRef}
            className="absolute inset-0 will-change-transform [-webkit-mask-composite:source-in] [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_5%,#000_95%,transparent),linear-gradient(to_bottom,transparent,#000_3%,#000_97%,transparent)]"
            style={{ transform: `scale(${s})` }}
          >
            <motion.div
              className="absolute inset-0 will-change-[filter]"
              initial={{ filter: "blur(30px)", scale: 1.04 }}
              animate={ready || failed ? { filter: "blur(0px)", scale: 1 } : { filter: "blur(30px)", scale: 1.04 }}
              transition={{ duration: reduce ? 0 : 1.5, ease: EASE }}
            >
              <Image src={src} alt={alt} width={frame.width} height={frame.height} unoptimized preload loading="eager" className="absolute inset-0 h-full w-full" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${seam}%)` }}>
                {stops.map((st, i) => (
                  <FrameCanvas
                    key={st}
                    image={frames.frames[i] ?? null}
                    className="absolute inset-0 h-full w-full"
                    style={{ opacity: ready ? opacities[i] : 0 }}
                  />
                ))}
              </div>
            </motion.div>
            {/* where the loupe is looking */}
            {showSeam && (
              <svg aria-hidden="true" viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                <rect x={loupe.x} y={loupe.y} width={loupe.w} height={loupe.h} fill="none" stroke="#161513" strokeOpacity="0.6" strokeWidth="4" vectorEffect="non-scaling-stroke" />
                <rect x={loupe.x} y={loupe.y} width={loupe.w} height={loupe.h} fill="none" stroke="#f5f3ef" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>

          <FocusBrackets locked={ready || failed} reduce={!!reduce} />

          {/* the seam: crisp on the left (what you see in the mirror), softened on the right (what they see from here) */}
          {showSeam && (
            <div
              role="slider"
              tabIndex={0}
              aria-label="Compare the mirror view with the view from here"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(seam)}
              aria-valuetext={`${Math.round(seam)} percent of the face shows the mirror view, the rest shows the view from ${formatDistance(distance)}`}
              data-testid="seam"
              onKeyDown={seamKeys}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragging.current = true;
                seamFromPointer(e);
              }}
              onPointerMove={(e) => dragging.current && seamFromPointer(e)}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
              className="group absolute z-10 w-11 cursor-ew-resize touch-none outline-none"
              style={{ left: `${toScaled(seam)}%`, top: `${50 - 50 * s}%`, height: `${100 * s}%`, transform: "translateX(-50%)" }}
            >
              <span className="absolute inset-y-0 left-1/2 block w-0.5 -translate-x-1/2 bg-paper shadow-[0_0_0_1px_var(--ink)]" />
              <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink bg-paper group-focus-visible:shadow-[0_0_0_3px_var(--paper),0_0_0_5px_var(--ink)]">
                <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
                  <path d="M5 1L1 5l4 4M11 1l4 4-4 4" stroke="#161513" strokeWidth="1.3" />
                </svg>
              </span>
            </div>
          )}

          {/* concern labels, strongest as the slider crosses each threshold */}
          {ready &&
            marked.map((c) => {
              const o = thresholdLabelOpacity(distance, c.keyDistanceM);
              if (o <= 0.25) return null; // the label stays at full contrast while it is shown
              const faded = distance > c.keyDistanceM;
              const toLeft = c.anchor.x / frame.width > 0.55;
              return (
                <div
                  key={c.id}
                  aria-hidden="true"
                  className="tag-in pointer-events-none absolute"
                  style={{ left: percent(toScaled((c.anchor.x / frame.width) * 100)), top: percent(toScaled((c.anchor.y / frame.height) * 100)) }}
                >
                  <span
                    className={`absolute block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper shadow-[0_0_0_1.5px_var(--ink)] ${faded ? "bg-transparent" : "bg-ink"}`}
                  />
                  <span
                    className={`absolute top-0 -translate-y-1/2 whitespace-nowrap border border-ink/15 bg-paper px-2 py-1 text-[0.875rem] leading-none text-ink ${toLeft ? "right-3 mr-1" : "left-3 ml-1"}`}
                  >
                    {c.copy.fadeLabel}
                  </span>
                </div>
              );
            })}
        </div>

        {/* You | Them */}
        {showSeam && (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-2 left-2 border border-ink/15 bg-paper px-2 py-1 text-[0.875rem] leading-none">
              You, at the mirror
            </span>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-2 right-2 border border-ink/15 bg-paper px-2 py-1 text-[0.875rem] leading-none">
              Them, from {formatDistance(distance)}
            </span>
          </>
        )}

        {/* status while the renders finish, then the reason when they cannot be drawn */}
        <p
          role="status"
          className="pointer-events-none absolute inset-x-2 top-2 mx-auto w-fit max-w-full border border-ink/15 bg-paper px-3 py-2 text-center text-[0.875rem] leading-snug transition-opacity duration-500"
          style={{ opacity: ready || failed ? 0 : 1 }}
        >
          {ready || failed ? "" : statusLines[statusIndex]}
        </p>
        {failed && (
          <p data-testid="render-failed" className="absolute inset-x-2 bottom-2 border border-ink bg-paper px-3 py-2 text-[0.875rem] leading-snug">
            The softened view couldn&rsquo;t be drawn in this browser, so this is the photo as it is. The distances and the list still work.
          </p>
        )}
      </div>

      {/* the first number, the study behind it, and the loupe */}
      <div className="order-2 flex items-start justify-between gap-4 lg:col-start-2 lg:row-start-1 lg:flex-col lg:justify-start lg:gap-0">
        <div className="min-w-0">
          <p className="eyebrow !text-[0.875rem]">Seen from</p>
          <p
            data-testid="readout"
            className="serif num mt-1 text-[clamp(3rem,2.2rem+3vw,4rem)] font-light leading-[0.95] tracking-[-0.03em] lg:mt-2 lg:text-[clamp(4.5rem,7vw,6.5rem)]"
            aria-hidden="true"
          >
            {num}
            <span className="ml-2 text-[0.38em] tracking-normal text-muted">{unit}</span>
          </p>
          <p className="serif mt-1 text-[1.25rem] leading-tight lg:mt-2 lg:text-[1.625rem]" style={{ fontWeight: 380 }}>
            {where}
          </p>
          <a
            href={validation.href}
            className="mt-3 hidden max-w-[24rem] items-start gap-2 text-[0.875rem] leading-snug text-ink-soft underline-offset-4 hover:text-ink hover:underline lg:inline-flex"
          >
            <CheckMark />
            {validation.text}
          </a>
        </div>

        {!failed && (
          <figure className="w-[9.5rem] shrink-0 sm:w-[12rem] lg:mt-5 lg:w-full lg:max-w-[22rem]">
            <div className="stage on-stage overflow-hidden border border-ink">
              <Loupe src={src} frame={frame} patch={loupe} frames={frames.frames} opacities={opacities} className="block h-auto w-full" />
            </div>
            <figcaption className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">Magnified so you can see what fades</figcaption>
          </figure>
        )}
      </div>

      {/* named stops and the tape */}
      <div className="order-3 lg:col-start-1 lg:row-start-2">
        <NamedDistances anchors={anchors} value={distance} onPick={pick} />
        <div className="mt-3">
          <DistanceTape
            compact
            value={distance}
            onChange={(d) => pick(d)}
            onUserInput={stopIntro}
            anchors={anchors}
            marks={marked.map((c) => ({ id: c.id, label: c.copy.title, distanceM: c.keyDistanceM }))}
            valueText={valueText}
            label="Step back: viewing distance"
          />
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {spoken}
        </p>
      </div>

      {/* what is and is not drawn */}
      <div className="order-4 lg:col-start-1 lg:row-start-3">
        <p className="max-w-[40rem] text-[0.875rem] leading-relaxed text-ink-soft">
          {heroLabel} {estimate}
        </p>
        <a href={validation.href} className="mt-2 inline-flex items-start gap-2 text-[0.875rem] leading-snug text-ink-soft underline-offset-4 hover:text-ink hover:underline lg:hidden">
          <CheckMark />
          {validation.text}
        </a>
      </div>

      {/* what is visible, in words */}
      <div className="order-5 lg:col-start-2 lg:row-span-2 lg:row-start-2">
        <p className="eyebrow !text-[0.875rem]">At this distance</p>
        <ul aria-label="What can be picked out at this distance" className="mt-3 divide-y divide-rule border-y border-rule">
          {concerns.map((c) => {
            const st = statusAt(c, distance);
            const on = st.state !== "none";
            return (
              <li key={c.id} className="py-3">
                <div className="flex items-center gap-3">
                  <StateDot state={st.state} />
                  <span className={`serif text-[1.125rem] leading-snug transition-colors duration-300 ${on ? "text-ink" : "text-muted"}`}>{c.copy.title}</span>
                  <span aria-hidden="true" className="ml-auto block h-1.5 w-16 border border-[#8a867c]">
                    <span className="block h-full bg-ink forced-colors:bg-[CanvasText]" style={{ width: percent(st.outOfSight * 100) }} />
                  </span>
                </div>
                <p data-counter={c.id} className="num mt-1 pl-[1.375rem] text-[0.875rem] leading-snug text-ink-soft">
                  {stepBackCounter(c.visibility, distance)}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 max-w-sm text-[0.875rem] leading-relaxed text-ink-soft">
          The bar fills as more of each concern drops out of sight for a typical sharp-eyed person looking right at it. {rendererNote}
        </p>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Solid when most of a concern is still detectable, half when some is, hollow when none: shape, never colour. */
function StateDot({ state }: { state: "most" | "some" | "none" }) {
  return (
    <span
      aria-hidden="true"
      className="block h-2.5 w-2.5 shrink-0 rounded-full border border-ink transition-colors duration-300"
      style={{ background: state === "most" ? "var(--ink)" : state === "some" ? "linear-gradient(90deg, var(--ink) 50%, transparent 50%)" : "transparent" }}
    />
  );
}

/** Autofocus-style corner marks that lock onto the face as the focus pull completes. */
function FocusBrackets({ locked, reduce }: { locked: boolean; reduce: boolean }) {
  return (
    <motion.svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-[16%] h-[68%] w-[68%]"
      initial={{ opacity: 0, scale: 1.25 }}
      animate={locked ? { opacity: 0, scale: 1 } : { opacity: 0.95, scale: 1 }}
      transition={{ duration: reduce ? 0 : locked ? 0.6 : 1.5, ease: EASE }}
    >
      {["M0 14V0H14", "M86 0H100V14", "M100 86V100H86", "M14 100H0V86"].map((d) => (
        <path key={d} d={d} fill="none" stroke="#f5f3ef" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
    </motion.svg>
  );
}
