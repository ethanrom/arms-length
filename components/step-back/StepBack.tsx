"use client";

import Image from "next/image";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { stepBackCounter } from "@/lib/copy";
import { statusAt, type ConcernView } from "@/components/results/derive";
import type { DistanceAnchor } from "@/components/results/types";
import { DistanceTape } from "./DistanceTape";
import { FrameCanvas } from "./FrameCanvas";
import { useDistanceFrames } from "./useDistanceFrames";

const EASE = [0.22, 1, 0.36, 1] as const;
const MIN_ANALYSING_MS = 1900;
const INTRO_DISTANCE_M = 1;

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
  /** What is and is not drawn: "Your photo, nothing redrawn. Filtered by a model of human vision at this distance." */
  heroLabel: string;
  stops?: readonly number[];
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
  stops = DEFAULT_STOPS,
}: StepBackProps) {
  const reduce = useReducedMotion();
  const frames = useDistanceFrames(src, scale, viewing, stops);

  // The focus pull lasts long enough to read, even when the renders are fast.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), reduce ? 0 : MIN_ANALYSING_MS);
    return () => window.clearTimeout(t);
  }, [reduce]);
  const ready = frames.status === "ready" && waited;
  const failed = frames.status === "error";

  const [picked, setDistance] = useState<number | null>(null);
  const intro = useRef<{ stop: () => void } | null>(null);
  // Reduced motion starts at conversation distance; otherwise at the mirror, then glides there.
  const distance = picked ?? (reduce ? INTRO_DISTANCE_M : DEFAULT_AXIS.min);

  // After the focus pull, glide from the mirror to conversation distance once, to show what the slider does.
  useEffect(() => {
    if (!ready || reduce) return;
    const controls = animate(0, toUnit(INTRO_DISTANCE_M), {
      duration: 2.4,
      delay: 0.5,
      ease: EASE,
      onUpdate: (u) => setDistance(fromUnit(u)),
    });
    intro.current = controls;
    return () => controls.stop();
  }, [ready, reduce]);

  const stopIntro = () => intro.current?.stop();

  const opacities = useMemo(() => layerOpacities(stops, distance), [stops, distance]);
  const { near, below, above } = locateAmongAnchors(anchors, distance);
  const where = near
    ? near.label
    : below && above
      ? `Between ${below.label.toLowerCase()} and ${above.label.toLowerCase()}`
      : (below ?? above)?.label ?? "";

  const visibleNow = concerns.filter((c) => statusAt(c, distance).state === "most");
  const valueText = `${spokenDistance(distance)}${near ? `, ${near.label.toLowerCase()}` : ""}. ${visibleNow.length} of ${concerns.length} concerns still visible.`;

  const [num, unit] = formatDistance(distance).split(" ");
  const statusIndex = Math.min(statusLines.length - 1, Math.floor(frames.progress * statusLines.length));
  const aspect = frame.width / frame.height;

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        {/* the face */}
        <div
          className="stage on-stage relative flex items-center justify-center overflow-hidden [--stage-h:min(70svh,760px)]"
          style={{ minHeight: "min(var(--stage-h), 100vw)" }}
        >
          <div
            className="relative"
            style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100%, calc(var(--stage-h) * ${aspect}))` }}
          >
            <motion.div
              className="absolute inset-0 will-change-[filter] lg:[mask-image:linear-gradient(to_right,transparent,#000_5%,#000_95%,transparent)]"
              initial={{ filter: "blur(30px)", scale: 1.04 }}
              animate={ready || failed ? { filter: "blur(0px)", scale: 1 } : { filter: "blur(30px)", scale: 1.04 }}
              transition={{ duration: reduce ? 0 : 1.7, ease: EASE }}
            >
              <Image
                src={src}
                alt={alt}
                width={frame.width}
                height={frame.height}
                unoptimized
                preload
                className="absolute inset-0 h-full w-full"
              />
              {stops.map((s, i) => (
                <FrameCanvas
                  key={s}
                  image={frames.frames[i] ?? null}
                  className="absolute inset-0 h-full w-full"
                  style={{ opacity: ready ? opacities[i] : 0 }}
                />
              ))}
            </motion.div>

            <FocusBrackets locked={ready || failed} reduce={!!reduce} />

            {/* concern labels, strongest as the slider crosses each threshold */}
            {ready &&
              concerns.map((c) => {
                const o = thresholdLabelOpacity(distance, c.keyDistanceM);
                if (o <= 0.25) return null; // the label stays at full contrast while it is shown
                const faded = distance > c.keyDistanceM;
                const toLeft = c.anchor.x / frame.width > 0.55;
                return (
                  <div
                    key={c.id}
                    aria-hidden="true"
                    className="tag-in pointer-events-none absolute"
                    style={{ left: percent((c.anchor.x / frame.width) * 100), top: percent((c.anchor.y / frame.height) * 100) }}
                  >
                    <span
                      className={`absolute block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper shadow-[0_0_0_1.5px_var(--ink)] ${faded ? "bg-transparent" : "bg-ink"}`}
                    />
                    <span
                      className={`absolute top-0 -translate-y-1/2 whitespace-nowrap border border-ink/15 bg-paper px-2 py-1 text-[0.75rem] leading-none text-ink ${toLeft ? "right-3 mr-1" : "left-3 ml-1"}`}
                    >
                      {c.copy.fadeLabel}
                    </span>
                  </div>
                );
              })}

            <p
              className="pointer-events-none absolute bottom-3 left-3 max-w-[78%] border border-ink/15 bg-paper px-3 py-2 text-[0.75rem] leading-snug transition-opacity duration-700"
              style={{ opacity: ready ? 1 : 0 }}
            >
              {heroLabel}
            </p>

            {/* status while the renders finish (small screens; wide screens show it beside the face) */}
            <motion.p
              role="status"
              initial={false}
              animate={{ opacity: ready || failed ? 0 : 1 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-x-3 bottom-3 border border-ink/15 bg-paper px-3 py-2 text-center text-[0.8125rem] leading-snug lg:hidden"
              aria-hidden={ready || failed}
            >
              {statusLines[statusIndex]}
            </motion.p>
          </div>

          {/* the readout sits on the stage on small screens */}
          <div className="pointer-events-none absolute left-3 top-3 border border-ink/15 bg-paper px-3 py-2 lg:hidden" aria-hidden="true">
            <span className="serif num text-[1.75rem] leading-none">
              {num}
              <span className="ml-1 text-[1rem]">{unit}</span>
            </span>
          </div>
        </div>

        {/* readout and what is visible */}
        <div className="relative">
          <div
            aria-hidden={!ready}
            inert={!ready}
            className="transition-opacity duration-700"
            style={{ opacity: ready ? 1 : 0 }}
          >
            <p className="eyebrow">Seen from</p>
            <p className="serif num mt-2 hidden text-[clamp(4.5rem,8.5vw,8rem)] font-light leading-[0.9] tracking-[-0.03em] lg:block" aria-hidden="true">
              {num}
              <span className="ml-2 text-[0.38em] tracking-normal text-muted">{unit}</span>
            </p>
            <p className="serif mt-1 text-[1.5rem] leading-tight lg:mt-3 lg:text-[1.75rem]" style={{ fontWeight: 380 }}>
              {where}
            </p>

            <h3 className="eyebrow mt-8 border-t border-rule pt-5">At this distance</h3>
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {concerns.map((c) => {
                const st = statusAt(c, distance);
                const on = st.state !== "none";
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <StateDot state={st.state} />
                      <span className={`serif text-[1.125rem] leading-snug transition-colors duration-300 ${on ? "text-ink" : "text-muted"}`}>{c.copy.title}</span>
                      {c.profile ? (
                        <span aria-hidden="true" className="ml-auto block h-1 w-14 bg-rule">
                          <span className="block h-1 bg-ink" style={{ width: percent((st.count! / st.total) * 100) }} />
                        </span>
                      ) : (
                        <span className="num ml-auto text-right text-[0.8125rem] text-muted">
                          <span className={on ? "text-ink" : ""}>{on ? "Visible" : "Out of sight"}</span>
                          <span className="ml-2 hidden sm:inline">
                            {c.relief ? "gone by" : "up to"} {formatDistance(c.visibility.maxDistanceM)}
                          </span>
                        </span>
                      )}
                    </div>
                    <p data-counter={c.id} className="num mt-1 pl-[1.375rem] text-[0.8125rem] leading-snug text-muted">
                      {stepBackCounter(c.visibility, distance)}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
              Counts are marks an observer with perfect eyesight could still pick out from here. {rendererNote}
            </p>
          </div>

          {/* analysing panel (wide screens): honest status while the focus pull runs */}
          <div
            aria-hidden={ready}
            className="pointer-events-none absolute inset-0 hidden transition-opacity duration-700 lg:block"
            style={{ opacity: ready ? 0 : 1 }}
          >
            <p className="eyebrow">Analysing</p>
            <p role="status" className="serif mt-3 text-[1.75rem] leading-tight" style={{ fontWeight: 380 }}>
              {failed ? "The distance view could not be drawn in this browser." : statusLines[statusIndex]}
            </p>
            <ol className="mt-8 space-y-3 border-t border-rule pt-5 text-[0.9375rem]">
              {statusLines.map((line, i) => (
                <li key={line} className={`flex gap-3 ${i <= statusIndex ? "text-ink" : "text-muted"}`}>
                  <span className="num font-mono text-[0.6875rem] leading-[1.9]">{String(i + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 h-px w-full bg-rule">
              <motion.div className="h-px origin-left bg-ink" animate={{ scaleX: Math.max(0.04, frames.progress) }} transition={{ duration: 0.4, ease: EASE }} />
            </div>
          </div>
        </div>
      </div>

      {/* the tape */}
      <div
        className="mt-10 transition-opacity duration-700 lg:mt-14"
        style={{ opacity: ready ? 1 : 0.25 }}
        aria-hidden={!ready}
        inert={!ready}
      >
        <DistanceTape
          value={distance}
          onChange={(d) => setDistance(clampDistance(d))}
          onUserInput={stopIntro}
          anchors={anchors}
          marks={concerns.map((c) => ({ id: c.id, label: c.copy.title, distanceM: c.keyDistanceM }))}
          valueText={valueText}
          label="Step back: viewing distance"
        />
        <p className="mt-2 text-[0.8125rem] text-muted">
          Drag, or use the arrow keys. Page Up and Page Down move faster.
        </p>
      </div>
    </div>
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
      {[
        "M0 14V0H14",
        "M86 0H100V14",
        "M100 86V100H86",
        "M14 100H0V86",
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="#f5f3ef" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
    </motion.svg>
  );
}
