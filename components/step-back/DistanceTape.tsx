"use client";

import type { CSSProperties } from "react";
import {
  DEFAULT_AXIS,
  distanceToStep,
  formatDistance,
  percent,
  stepToDistance,
  toUnit,
  type LogAxis,
} from "@/app/_lib/axis";
import type { DistanceAnchor } from "@/components/results/types";

export const TAPE_STEPS = 160;

/** Ticks between the anchors, like the marks on a tape measure. */
const MINOR_TICKS = [0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];

export interface TapeMark {
  id: string;
  label: string;
  distanceM: number;
}

interface DistanceTapeProps {
  value: number;
  onChange: (distanceM: number) => void;
  anchors: DistanceAnchor[];
  /** Where each concern fades; drawn above the tape on wide screens. */
  marks?: TapeMark[];
  /** Spoken value, e.g. "1.5 metres, across a table". */
  valueText: string;
  label?: string;
  disabled?: boolean;
  axis?: LogAxis;
  /** Called on any pointer or keyboard input, so the caller can stop an intro animation. */
  onUserInput?: () => void;
  /**
   * Just the tape, with a row of distances under it: for a hero that names its stops with buttons instead (the concern
   * labels above the tape and the named labels below it are left out).
   */
  compact?: boolean;
}

/** Distances numbered under a compact tape. */
const COMPACT_LABELS_M = [0.25, 0.5, 1, 2, 4, 6];

// Vertical layout, px from the top of the tape zone (the zone starts below the mark labels).
const BASE = 28; // baseline
const ZONE = 56; // height of the draggable zone
const LABEL_TOP = 60;
const LABEL_ROW = 38;

/**
 * A measuring tape you can drag. The real control is a native range input (keyboard, touch and screen
 * readers for free); everything drawn here is decoration that follows its value on a log axis.
 */
export function DistanceTape({
  value,
  onChange,
  anchors,
  marks = [],
  valueText,
  label = "Viewing distance",
  disabled,
  axis = DEFAULT_AXIS,
  onUserInput,
  compact,
}: DistanceTapeProps) {
  const u = toUnit(value, axis);
  const step = distanceToStep(value, TAPE_STEPS, axis);
  const left = (d: number) => percent(toUnit(d, axis) * 100);
  const sortedMarks = [...marks].sort((a, b) => a.distanceM - b.distanceM);
  const zoneTop = (extra: number) => `calc(var(--marks-h) + ${extra}px)`;

  return (
    <div
      className={`relative select-none ${compact ? "[--marks-h:0px]" : "[--marks-h:0px] md:[--marks-h:3.5rem]"}`}
      style={{ height: compact ? ZONE + 30 : `calc(var(--marks-h) + ${LABEL_TOP + LABEL_ROW + 34}px)` } as CSSProperties}
    >
      {/* concern thresholds: label, leader, dot */}
      <div aria-hidden="true" className={compact ? "hidden" : "hidden md:block"}>
        {sortedMarks.map((m, i) => {
          const row = i % 2;
          const labelTop = row === 0 ? 0 : 22;
          const passed = value >= m.distanceM;
          return (
            <div key={m.id}>
              <span
                className={`absolute whitespace-nowrap text-[0.875rem] leading-none transition-opacity duration-300 ${passed ? "text-muted" : "text-ink"}`}
                style={{ left: left(m.distanceM), top: labelTop, transform: "translateX(-50%)" }}
              >
                {m.label}
              </span>
              <span
                className="absolute w-px bg-[#8a867c] forced-colors:bg-[GrayText]"
                style={{ left: left(m.distanceM), top: labelTop + 18, height: `calc(var(--marks-h) + ${BASE}px - ${labelTop + 18}px)` }}
              />
            </div>
          );
        })}
      </div>

      {/* tape */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: zoneTop(0), height: ZONE }}>
        <div className="absolute inset-x-0 h-px bg-[#8a867c] forced-colors:bg-[GrayText]" style={{ top: BASE }} />
        <div className="absolute left-0 bg-ink forced-colors:bg-[CanvasText]" style={{ top: BASE - 1, height: 2, width: percent(u * 100) }} />
        {MINOR_TICKS.map((t) => {
          const major = anchors.some((a) => Math.abs(Math.log(a.distanceM / t)) < 1e-6);
          return (
            <span
              key={t}
              className={`absolute w-px ${major ? "bg-ink forced-colors:bg-[CanvasText]" : "bg-[#8a867c] forced-colors:bg-[GrayText]"}`}
              style={{ left: left(t), top: major ? BASE - 14 : BASE - 6, height: major ? 28 : 12 }}
            />
          );
        })}
        {sortedMarks.map((m) => (
          <span
            key={m.id}
            className={`absolute block h-[9px] w-[9px] rounded-full border border-ink transition-colors duration-300 ${value >= m.distanceM ? "bg-paper" : "bg-ink forced-colors:bg-[CanvasText]"}`}
            style={{ left: left(m.distanceM), top: BASE, transform: "translate(-50%, -50%)" }}
          />
        ))}

        {/* thumb: a vernier line with a knob */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: percent(u * 100), top: 2, height: ZONE - 4, transform: "translateX(-50%)" }}
        >
          <span className="tape-knob block h-4 w-4 rounded-full border-2 border-paper bg-ink forced-colors:bg-[CanvasText] shadow-[0_0_0_1px_var(--ink)]" />
          <span className="block w-0.5 grow bg-ink forced-colors:bg-[CanvasText]" />
        </div>
      </div>

      {/* the real control */}
      <div className="absolute inset-x-0 [&:has(:focus-visible)_.tape-knob]:shadow-[0_0_0_3px_var(--paper),0_0_0_5px_var(--ink)]" style={{ top: zoneTop(0), height: ZONE }}>
        <input
          type="range"
          className="tape-range"
          min={0}
          max={TAPE_STEPS}
          step={1}
          value={step}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={valueText}
          onPointerDown={onUserInput}
          onKeyDown={onUserInput}
          onChange={(e) => {
            onUserInput?.();
            onChange(stepToDistance(Number(e.target.value), TAPE_STEPS, axis));
          }}
        />
      </div>

      {compact ? (
        /* numbered distances under the tape; the named stops are buttons beside it */
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: ZONE + 2 }}>
          {COMPACT_LABELS_M.map((d) => {
            const x = toUnit(d, axis);
            const align = x < 0.04 ? "left" : x > 0.96 ? "right" : "center";
            return (
              <span
                key={d}
                className={`num absolute whitespace-nowrap font-mono text-[0.875rem] leading-none ${d === 0.5 || d === 6 ? "hidden sm:inline" : ""}`}
                style={{
                  left: left(d),
                  transform: align === "center" ? "translateX(-50%)" : align === "right" ? "translateX(-100%)" : undefined,
                }}
              >
                {formatDistance(d)}
              </span>
            );
          })}
        </div>
      ) : (
        /* anchor labels, staggered over two rows so close neighbours (mirror, selfie) never collide */
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: zoneTop(0) }}>
          {anchors.map((a, i) => {
            const x = toUnit(a.distanceM, axis);
            const align = x < 0.12 ? "left" : x > 0.84 ? "right" : "center";
            // Start on the lower row so the first two anchors (mirror, selfie: 5 cm apart) never share one.
            const row = (i + 1) % 2;
            const labelTop = LABEL_TOP + (row === 1 ? LABEL_ROW : 0);
            return (
              <div key={a.label}>
                <span
                  className="absolute w-px bg-[#8a867c] forced-colors:bg-[GrayText]"
                  style={{ left: left(a.distanceM), top: BASE + 14, height: labelTop - 4 - (BASE + 14) }}
                />
                <div
                  className="absolute whitespace-nowrap"
                  style={{
                    left: left(a.distanceM),
                    top: labelTop,
                    transform: align === "center" ? "translateX(-50%)" : align === "right" ? "translateX(-100%)" : undefined,
                    textAlign: align,
                  }}
                >
                  <span className="num block font-mono text-[0.875rem] leading-none tracking-wide">{formatDistance(a.distanceM)}</span>
                  <span className="mt-1.5 block text-[0.875rem] leading-none text-muted">
                    <span className="md:hidden">{a.short}</span>
                    <span className="hidden md:inline">{a.label}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
