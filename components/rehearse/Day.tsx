"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDistance, spokenDistance } from "@/app/_lib/axis";
import type { DayPlan, ObserveResult } from "@/lib/contracts/rehearse";
import { chipFor, headlineFor, noNeedLine, observeOf, ribbonPositions, tipFor } from "./moments";
import { Drawer } from "./Drawer";
import { EndOfDay } from "./EndOfDay";
import { Ribbon, type RibbonMoment } from "./Ribbon";
import { Stage } from "./stage/Stage";
import type { StagePhoto } from "./stage/types";
import { useCalm } from "./useCalm";

/** The stage is about 58% of the screen's height, but leaves room (the 25rem) for the caption and the ribbon on a short screen. */
const STAGE_H = "min(58svh, calc(100svh - 25rem))";
const AUTOPLAY_MS = 4000;
const SWIPE_PX = 56;
const MIRROR_PULSE_MS = 2500;

interface DayProps {
  plan: DayPlan;
  photo: StagePhoto;
  onFollowUp: (question: string) => void;
  followUpError: string | null;
  onStartOver: () => void;
  onClose: () => void;
  /** Bumps to put the experience back on the first moment when a new plan arrives. */
  startKey: number;
  /** Open on the end-of-day page (after a question that did not come back with a plan). */
  startAtEnd?: boolean;
}

const isTypingTarget = (el: EventTarget | null) => el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && (el as HTMLInputElement).type !== "radio";

/** The day, one moment at a time: the scene as the people there see it, one line to say what it means, and the day as a ribbon. */
export function Day({ plan, photo, onFollowUp, followUpError, onStartOver, onClose, startKey, startAtEnd = false }: DayProps) {
  const moments = plan.moments;
  const n = moments.length;
  const calm = useCalm();
  const [index, setIndex] = useState(startAtEnd ? n : 0);
  const [seenStart, setSeenStart] = useState(startKey);
  const [mirror, setMirror] = useState(false);
  const [tipId, setTipId] = useState<string | null>(null);
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const knowButton = useRef<HTMLButtonElement>(null);
  const chipId = useId();
  const toggleName = useId();

  // A new plan starts at its first moment.
  if (seenStart !== startKey) {
    setSeenStart(startKey);
    setIndex(0);
    setMirror(false);
    setTipId(null);
    setOpenChip(null);
    setPlaying(false);
  }

  const observes = useMemo(() => moments.map((m) => observeOf(plan, m)), [plan, moments]);
  const positions = useMemo(() => ribbonPositions(moments), [moments]);
  const ribbon = useMemo<RibbonMoment[]>(() => moments.map((m) => ({ id: m.id, time: m.time, title: m.title, kind: chipFor(m).kind })), [moments]);
  const tips = useMemo(() => moments.map((m) => tipFor(plan, m)), [plan, moments]);

  const go = useCallback(
    (to: number) => {
      setIndex(Math.max(0, Math.min(n, to)));
      setMirror(false);
      setTipId(null);
      setOpenChip(null);
    },
    [n],
  );

  // Play moves on every few seconds and stops at the end of the day.
  useEffect(() => {
    if (!playing) return;
    if (index >= n) return;
    const t = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, n, go]);
  const playingNow = playing && index < n;

  // ← and → anywhere in the experience, except while typing or with the drawer open.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (drawer || isTypingTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else return;
      setPlaying(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, go, index]);

  // Swipe on the stage; vertical drags still scroll.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  // The mirror: held while a pointer or Space/Enter is down. A click with no press before it (assistive technology) shows it briefly.
  const held = useRef(false);
  const pulse = useRef(0);
  const holdOn = () => {
    window.clearTimeout(pulse.current);
    held.current = true;
    setMirror(true);
  };
  const holdOff = () => {
    held.current = false;
    setMirror(false);
  };
  const holdKeys = (e: KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.type === "keydown" && !e.repeat) holdOn();
    if (e.type === "keyup") holdOff();
  };
  useEffect(() => () => window.clearTimeout(pulse.current), []);

  if (index >= n) {
    return (
      <div onPointerDownCapture={() => setPlaying(false)}>
        <EndOfDay plan={plan} ribbon={ribbon} positions={positions} onPick={go} onReplay={() => go(0)} onFollowUp={onFollowUp} followUpError={followUpError} onStartOver={onStartOver} onClose={onClose} />
      </div>
    );
  }

  const moment = moments[index];
  const base = observes[index];
  const tip = tips[index];
  const tipOn = tipId === moment.id && !!tip;
  const shown: ObserveResult | null = tipOn ? tip.after : base;
  const chip = chipFor(moment);
  const headline = headlineFor(moment, base);
  const noNeed = noNeedLine(shown);
  const chipOpen = openChip === moment.id;
  const where = shown ? (shown.input.scene === "video_call" ? `Looks like ${formatDistance(shown.distanceM)} away` : `${formatDistance(shown.distanceM)} away`) : "";
  const announce = `Moment ${index + 1} of ${n}: ${moment.title}${moment.time ? `, ${moment.time}` : ""}. ${headline}`;
  // Longer headlines get a smaller size, so two lines are enough.
  const headlineSize =
    headline.length <= 56
      ? "text-[clamp(1.875rem,1.2rem+2.6vw,3rem)]"
      : headline.length <= 96
        ? "text-[clamp(1.5rem,1.1rem+1.7vw,2.375rem)]"
        : "text-[clamp(1.25rem,1rem+1.2vw,1.875rem)]";

  return (
    <div
      className="mx-auto w-full px-5 pb-10 md:px-10"
      style={{ maxWidth: `min(100%, calc(${STAGE_H} * 1.6 + 5rem))` }}
      data-testid="rehearse-day"
      onPointerDownCapture={(e) => {
        if (!(e.target as HTMLElement).closest("[data-play]")) setPlaying(false);
      }}
      onKeyDownCapture={(e) => {
        if (!(e.target as HTMLElement).closest("[data-play]") && e.key !== "Tab") setPlaying(false);
      }}
    >
      <div inert={drawer}>
        {/* the stage: every moment is mounted so the next one is already drawn; only this one shows */}
        <div className="relative touch-pan-y select-none" onPointerDown={onDown} onPointerUp={onUp} onDragStart={(e) => e.preventDefault()} data-testid="rehearse-stage" data-mode={mirror ? "mirror" : "theirs"}>
          <div style={{ aspectRatio: "16 / 10" }} className="relative -mx-5 md:mx-0">
            {moments.map((m, i) => {
              const current = i === index;
              const obs = current ? shown : observes[i];
              return (
                <div
                  key={m.id}
                  inert={!current}
                  aria-hidden={!current}
                  data-testid={current ? "day-stage" : undefined}
                  data-moment={m.id}
                  data-distance-m={current && obs ? obs.distanceM : undefined}
                  data-camera-cm={current ? obs?.input.call?.cameraDistanceCm : undefined}
                  data-layout={current ? obs?.input.call?.layout : undefined}
                  data-tip={current ? String(tipOn) : undefined}
                  className={`absolute inset-0 transition-opacity duration-500 ${current ? "opacity-100" : "pointer-events-none opacity-0"}`}
                >
                  <Stage
                    scene={obs?.input.scene ?? m.scene.scene}
                    light={obs?.input.light ?? m.scene.light ?? "indoor"}
                    call={obs?.input.call ?? m.scene.call}
                    observe={obs}
                    photo={photo}
                    priority={Math.abs(i - index) <= 1 ? "now" : "later"}
                    label={`${m.title}: your face as the people there see it${obs ? `, from ${spokenDistance(obs.distanceM)}` : ""}`}
                  />
                  {/* your mirror, mounted ahead so holding the button is a quick crossfade, not a wait */}
                  {current && (
                    <div aria-hidden="true" inert className={`absolute inset-0 transition-opacity duration-150 ${mirror ? "opacity-100" : "opacity-0"}`}>
                      <Stage scene={obs?.input.scene ?? m.scene.scene} light={obs?.input.light ?? m.scene.light ?? "indoor"} call={obs?.input.call ?? m.scene.call} observe={obs} photo={photo} mirror label="" />
                    </div>
                  )}
                </div>
              );
            })}
            <ArrowButton side="left" label="Previous moment" testId="prev" disabled={index <= 0} onClick={() => go(index - 1)} />
            <ArrowButton side="right" label={index === n - 1 ? "The whole day" : "Next moment"} testId="next" onClick={() => go(index + 1)} />
            {mirror && (
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 border border-ink/15 bg-paper px-2.5 py-1.5 text-[0.875rem] leading-none">
                Your mirror, 25 cm
              </span>
            )}
            {!mirror && where && (
              <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 z-10 border border-ink/15 bg-paper px-2.5 py-1.5 text-[0.875rem] leading-none">
                <span className="num">{where}</span>
              </span>
            )}
          </div>
        {/* the same face as they see it, enlarged to the mirror's framing: held next to the mirror, it is the whole point.
            Over the corner of the stage on a wide screen, under it on a phone. */}
        {shown && (
          <figure data-testid="closer-inset" className="m-0 mt-3 flex items-center gap-3 md:absolute md:bottom-3 md:right-3 md:z-10 md:mt-0 md:block md:w-[30%]">
            <div
              className={`w-[46%] shrink-0 overflow-hidden rounded-lg border bg-paper transition-shadow duration-150 md:w-full ${mirror ? "border-ink shadow-[0_0_0_2px_var(--ink)]" : "border-ink/30"}`}
            >
              <Stage key={moment.id} closer scene={shown.input.scene} light={shown.input.light} call={shown.input.call} observe={shown} photo={photo} label={`${moment.title}: as they see it, up close`} />
              <figcaption className="hidden px-2 py-1 text-[0.875rem] leading-tight md:block">As they see it, up close</figcaption>
            </div>
            <p aria-hidden="true" className="text-[0.9375rem] leading-snug text-ink-soft md:hidden">
              As they see it, up close
            </p>
          </figure>
        )}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-4">
          <p className="eyebrow !text-[0.875rem] !text-ink-soft">
            {moment.time && (
              <>
                <span className="num">{moment.time}</span> &middot;{" "}
              </>
            )}
            <span data-testid="moment-title">{moment.title}</span>
          </p>
          <button ref={knowButton} type="button" onClick={() => setDrawer(true)} aria-haspopup="dialog" className="inline-flex min-h-11 shrink-0 items-center text-[0.9375rem] text-ink-soft underline decoration-1 underline-offset-4 hover:text-ink">
            How we know
          </button>
        </div>
        <h2
          data-autofocus
          tabIndex={-1}
          data-testid="moment-headline"
          className={`serif -mt-1 max-w-[46rem] text-balance leading-[1.1] tracking-[-0.018em] outline-none ${headlineSize}`}
          style={{ fontWeight: 350 }}
        >
          {headline}
        </h2>

        {noNeed && (
          <p className="mt-2 text-[0.9375rem] leading-snug text-ink-soft" data-testid="no-need">
            No need to cover here: {noNeed}.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {chip.claim ? (
              <button
                type="button"
                aria-expanded={chipOpen}
                aria-controls={chipId}
                data-testid="moment-chip"
                onClick={() => setOpenChip(chipOpen ? null : moment.id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-ink px-4 text-[0.9375rem] transition-colors ${chipOpen ? "bg-ink text-paper" : "hover:bg-ink/5"}`}
              >
                <span aria-hidden="true" className={`block h-2.5 w-2.5 rounded-full border ${chipOpen ? "border-paper bg-paper" : "border-ink bg-ink"}`} />
                {chip.label}
              </button>
            ) : (
              <span data-testid="moment-chip" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rule-strong px-4 text-[0.9375rem] text-ink-soft">
                <span aria-hidden="true" className="block h-2.5 w-2.5 rounded-full border border-ink" />
                {chip.label}
              </span>
            )}
            {tip && (
              <fieldset>
                <legend className="sr-only">The scene</legend>
                <div className="inline-flex border border-ink">
                  {(
                    [
                      { on: false, label: "As is" },
                      { on: true, label: "With the tip" },
                    ] as const
                  ).map((o) => (
                    <label key={o.label} className="relative cursor-pointer">
                      <input type="radio" name={toggleName} className="peer sr-only" checked={tipOn === o.on} onChange={() => setTipId(o.on ? moment.id : null)} />
                      <span className="flex min-h-11 items-center justify-center border-l border-ink px-4 text-[0.9375rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline">
                        {o.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          <div>
            <button
              type="button"
              aria-pressed={mirror}
              data-testid="hold-mirror"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                holdOn();
              }}
              onPointerUp={holdOff}
              onPointerCancel={holdOff}
              onKeyDown={holdKeys}
              onKeyUp={holdKeys}
              onBlur={() => held.current && holdOff()}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => {
                if (e.detail !== 0 || held.current) return;
                setMirror(true);
                pulse.current = window.setTimeout(() => setMirror(false), MIRROR_PULSE_MS);
              }}
              className="btn btn-ghost touch-none select-none aria-pressed:bg-ink aria-pressed:text-paper"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                <ellipse cx="10" cy="9" rx="5.5" ry="7" />
                <path d="M7 4.5c.8-.9 1.8-1.4 3-1.5M10 16v2.5M6.5 18.5h7" />
              </svg>
              Hold to see your mirror
            </button>
          </div>
        </div>
        {chip.claim && (
          <p id={chipId} hidden={!chipOpen} data-testid="moment-claim" className="serif mt-3 max-w-[38rem] text-[1.1875rem] leading-snug" style={{ fontWeight: 400 }}>
            {chip.claim.text}
          </p>
        )}

        <div className="mt-4 flex items-start gap-3">
          {!calm && (
            <button
              type="button"
              data-play
              data-testid="play"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playingNow}
              aria-label={playingNow ? "Pause" : "Play the day"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ink transition-colors hover:bg-ink/5"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                {playingNow ? <path d="M3 2h3v10H3zM8 2h3v10H8z" /> : <path d="M3 1.5l9 5.5-9 5.5z" />}
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <Ribbon moments={ribbon} positions={positions} current={index} onPick={go} />
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <p className="sr-only" role="status" aria-live="polite" data-testid="mirror-status">
        {mirror ? "Showing your mirror, 25 centimetres." : ""}
      </p>

      {drawer && (
        <Drawer
          plan={plan}
          moment={moment}
          onClose={() => {
            setDrawer(false);
            // the experience is inert while the drawer is open, so focus goes back once it is not
            requestAnimationFrame(() => knowButton.current?.focus());
          }}
        />
      )}
    </div>
  );
}

function ArrowButton({ side, label, testId, onClick, disabled }: { side: "left" | "right"; label: string; testId: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      className={`absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-ink/40 bg-paper/90 transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-0 ${side === "left" ? "left-2" : "right-2"}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={side === "left" ? "M10 2L4 8l6 6" : "M6 2l6 6-6 6"} stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </button>
  );
}
