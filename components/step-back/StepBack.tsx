"use client";

import Image from "next/image";
import { animate, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
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
import { faceScaleAt } from "@/lib/integration/faceScale";
import { ConcernMarks } from "@/components/concerns/AnnotatedFace";
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
  /** What is and is not drawn, said once under the face. */
  heroLabel: string;
  /** The "An estimate from one photo" line, under the face where the first number is. */
  estimate: string;
  /** "Synthetic (AI-generated) face. No real person's skin is shown." for a demo face; absent for a visitor's own photo. */
  synthetic?: string | null;
  /** The patch of cheek and nose the loupe magnifies, in frame px. */
  loupe: Box;
  /** The concern whose marks are drawn over the face, or none. */
  highlight?: ConcernView | null;
  /** Called with the viewing distance (metres) whenever it changes, including during the opening glide. */
  onDistanceChange?: (distanceM: number) => void;
  stops?: readonly number[];
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

/** `box` with its top-left corner at (x, y), kept inside the frame. */
function placed(box: Box, x: number, y: number, frame: { width: number; height: number }): Box {
  return { ...box, x: Math.max(0, Math.min(x, frame.width - box.w)), y: Math.max(0, Math.min(y, frame.height - box.h)) };
}

const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** How far the arrow keys move the patch, as a share of the frame width; Shift takes the bigger step. */
const NUDGE = 0.02;
const NUDGE_BIG = 0.08;

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
  heroLabel,
  estimate,
  synthetic,
  loupe,
  highlight = null,
  onDistanceChange,
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

  useEffect(() => {
    onDistanceChange?.(distance);
  }, [distance, onDistanceChange]);

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

  // The loupe's patch starts where the analysis put it and can be moved; another face (a new prop) puts it back.
  const [patch, setPatch] = useState(loupe);
  const [seenLoupe, setSeenLoupe] = useState(loupe);
  if (!sameBox(seenLoupe, loupe)) {
    setSeenLoupe(loupe);
    setPatch(loupe);
  }
  const overlayRef = useRef<SVGSVGElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const queued = useRef<{ x: number; y: number } | null>(null);
  const frameRequest = useRef(0);
  const [grabbing, setGrabbing] = useState(false);
  const [ringed, setRinged] = useState(false);

  // client px to frame px: the overlay is stretched (preserveAspectRatio="none") and scaled with the face, so x and y
  // each need their own factor, which the inverse screen matrix carries.
  const toFrame = (clientX: number, clientY: number) => {
    const matrix = overlayRef.current?.getScreenCTM();
    if (!matrix) return null;
    const at = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: at.x, y: at.y };
  };
  // Pointer events can outrun the screen, so a drag asks for one state update per frame.
  const flushMove = () => {
    window.cancelAnimationFrame(frameRequest.current);
    frameRequest.current = 0;
    const to = queued.current;
    queued.current = null;
    if (to) setPatch((p) => placed(p, to.x, to.y, frame));
  };
  const queueMove = (x: number, y: number) => {
    queued.current = { x, y };
    if (!frameRequest.current) frameRequest.current = window.requestAnimationFrame(flushMove);
  };
  useEffect(() => () => window.cancelAnimationFrame(frameRequest.current), []);

  const patchDown = (e: PointerEvent<SVGRectElement>) => {
    const at = toFrame(e.clientX, e.clientY);
    if (!at) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { dx: at.x - patch.x, dy: at.y - patch.y };
    setGrabbing(true);
  };
  const patchMove = (e: PointerEvent<SVGRectElement>) => {
    const held = grab.current;
    const at = held && toFrame(e.clientX, e.clientY);
    if (!held || !at) return;
    e.stopPropagation();
    queueMove(at.x - held.dx, at.y - held.dy);
  };
  const patchUp = (e: PointerEvent<SVGRectElement>) => {
    if (!grab.current) return;
    e.stopPropagation();
    grab.current = null;
    flushMove();
    setGrabbing(false);
  };
  const patchKeys = (e: KeyboardEvent<SVGRectElement>) => {
    const step = frame.width * (e.shiftKey ? NUDGE_BIG : NUDGE);
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    flushMove();
    setPatch((p) => placed(p, p.x + dx, p.y + dy, frame));
  };
  // A click on the photo puts the patch's centre there. The seam handle is a sibling of the photo, so it never gets here.
  const aimPatch = (e: MouseEvent<HTMLDivElement>) => {
    const at = showSeam ? toFrame(e.clientX, e.clientY) : null;
    if (at) setPatch((p) => placed(p, at.x - p.w / 2, at.y - p.h / 2, frame));
  };

  return (
    <div className="flex flex-col gap-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-start lg:gap-x-6 lg:gap-y-4 xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-x-8">
      {/* On a wide screen: the face beside the number and the loupe, with the named stops, the tape and the fine print across both. On a phone the parts simply run one after another. */}
      {/* the face */}
      <div
        data-testid="step-back-stage"
        className="stage on-stage relative order-1 flex items-center justify-center overflow-hidden [--stage-h:min(36svh,360px)] sm:[--stage-h:min(42svh,440px)] lg:col-start-1 lg:row-start-1 lg:[--stage-h:clamp(260px,calc(100svh-26rem),620px)] xl:[--stage-h:clamp(260px,calc(100svh-22.25rem),620px)]"
        style={{ height: "var(--stage-h)" }}
      >
        <div className="relative" style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100%, calc(var(--stage-h) * ${aspect}))` }}>
          {/* the face layer shrinks gently with distance; the seam, pins and labels stay at full size */}
          <div
            ref={faceRef}
            className="absolute inset-0 will-change-transform [-webkit-mask-composite:source-in] [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_5%,#000_95%,transparent),linear-gradient(to_bottom,transparent,#000_3%,#000_97%,transparent)]"
            style={{ transform: `scale(${s})` }}
            onClick={aimPatch}
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
            {/* the concern chosen in the list: its marks, drawn over the face (and softened with it) */}
            {highlight && (
              <svg
                data-testid="concern-marks"
                data-concern={highlight.id}
                aria-hidden="true"
                viewBox={`0 0 ${frame.width} ${frame.height}`}
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <ConcernMarks view={highlight} box={{ x: 0, y: 0, w: frame.width, h: frame.height }} />
              </svg>
            )}
            {/* where the loupe is looking; only the box takes the pointer, the rest of the overlay lets it through */}
            {showSeam && (
              <svg ref={overlayRef} viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                {/* the same ink and paper pair as the site's focus ring, drawn heavier while the keys have it */}
                <g aria-hidden="true">
                  <rect x={patch.x} y={patch.y} width={patch.w} height={patch.h} fill="none" stroke="#161513" strokeOpacity={ringed ? 1 : 0.6} strokeWidth={ringed ? 7 : 4} vectorEffect="non-scaling-stroke" />
                  <rect x={patch.x} y={patch.y} width={patch.w} height={patch.h} fill="none" stroke="#f5f3ef" strokeWidth={ringed ? 3.4 : 1.6} vectorEffect="non-scaling-stroke" />
                </g>
                <rect
                  role="button"
                  tabIndex={0}
                  aria-label="Move the magnified area. Use the arrow keys; hold Shift for bigger steps."
                  data-testid="loupe-patch"
                  x={patch.x}
                  y={patch.y}
                  width={patch.w}
                  height={patch.h}
                  fill="transparent"
                  pointerEvents="all"
                  style={{ cursor: grabbing ? "grabbing" : "grab", touchAction: "none" }}
                  onPointerDown={patchDown}
                  onPointerMove={patchMove}
                  onPointerUp={patchUp}
                  onPointerCancel={patchUp}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={patchKeys}
                  onFocus={(e) => setRinged(e.currentTarget.matches(":focus-visible"))}
                  onBlur={() => setRinged(false)}
                />
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
                  className="tag-in pointer-events-none absolute z-20"
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

      {/* named stops and the tape */}
      <div className="order-3 lg:col-span-2 lg:row-start-2">
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

      {/* the first number, and the loupe */}
      <div className="order-2 flex items-start justify-between gap-4 lg:col-start-2 lg:row-start-1 lg:min-w-0 lg:flex-col lg:justify-start lg:gap-0">
        <div className="min-w-0">
          <p className="eyebrow !text-[0.875rem]">Seen from</p>
          <p
            data-testid="readout"
            className="serif num mt-1 text-[clamp(3rem,2.2rem+3vw,4rem)] font-light leading-[0.95] tracking-[-0.03em] lg:mt-2 lg:text-[clamp(3.25rem,5.4vw,5rem)]"
            aria-hidden="true"
          >
            {num}
            <span className="ml-2 text-[0.38em] tracking-normal text-muted">{unit}</span>
          </p>
          <p className="serif mt-1 text-[1.25rem] leading-tight lg:mt-2 lg:text-[1.375rem]" style={{ fontWeight: 380 }}>
            {where}
          </p>
        </div>

        {!failed && (
          <figure className="w-[9.5rem] shrink-0 sm:w-[12rem] lg:mt-5 lg:w-full lg:max-w-[22rem]">
            <div className="stage on-stage overflow-hidden border border-ink">
              <Loupe src={src} frame={frame} patch={patch} frames={frames.frames} opacities={opacities} className="block h-auto w-full" />
            </div>
            <figcaption className="mt-1.5 text-[0.875rem] leading-snug text-ink-soft">
              {/* the phone keeps the controls near the top, so its hint is short */}
              <span className="sm:hidden">Magnified. Drag the box to move it.</span>
              <span className="hidden sm:inline">Magnified so you can see what fades. Drag the box on the face, or click the face, to look elsewhere.</span>
            </figcaption>
          </figure>
        )}
      </div>

      {/* what is and is not drawn */}
      <div className="order-4 lg:col-span-2 lg:row-start-3">
        <p className="max-w-[44rem] text-[0.875rem] leading-relaxed text-ink-soft">
          {heroLabel} {estimate}
        </p>
        {synthetic && <p className="mt-1.5 max-w-[44rem] text-[0.875rem] leading-relaxed text-ink-soft">{synthetic}</p>}
      </div>
    </div>
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
