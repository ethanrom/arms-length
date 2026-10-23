"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { DayPlan } from "@/lib/contracts/rehearse";
import { coverLines } from "./moments";
import { Ribbon, type RibbonMoment } from "./Ribbon";

interface EndOfDayProps {
  plan: DayPlan;
  ribbon: readonly RibbonMoment[];
  positions: readonly number[];
  onPick: (index: number) => void;
  onReplay: () => void;
  /** Sends a follow-up question; the plan is replaced when the answer arrives. */
  onFollowUp: (question: string) => void;
  /** A kind sentence when the last question did not come back with a plan. */
  followUpError: string | null;
  onStartOver: () => void;
  onClose: () => void;
}

const VERIFIED = "Every number checked against the model";
const DIRECT = "Built directly from the model";

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** The whole day at once: the ribbon, the summary, what needs no cover, and a place to ask "what if". */
export function EndOfDay({ plan, ribbon, positions, onPick, onReplay, onFollowUp, followUpError, onStartOver, onClose }: EndOfDayProps) {
  const [question, setQuestion] = useState("");
  const [nudge, setNudge] = useState(false);
  const questionId = useId();
  const errorId = useId();
  const cover = coverLines(plan);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  const ask = (e: FormEvent) => {
    e.preventDefault();
    const text = question.trim();
    if (text.length < 3) return setNudge(true);
    setNudge(false);
    onFollowUp(text);
  };

  return (
    <div className="mx-auto w-full max-w-[52rem] px-5 pb-14 pt-2 md:px-10 md:pt-6" data-testid="rehearse-end">
      <h2 ref={heading} tabIndex={-1} className="eyebrow !text-[0.875rem] !text-ink outline-none">
        The whole day
      </h2>

      <div className="mt-5">
        <Ribbon moments={ribbon} positions={positions} current={null} onPick={onPick} size="large" />
      </div>

      <p className="serif mt-4 text-[clamp(1.75rem,1.2rem+2.4vw,2.875rem)] leading-[1.12] tracking-[-0.015em]" style={{ fontWeight: 360 }} data-testid="rehearse-summary">
        {plan.summary.text}
      </p>

      {cover.length > 0 && (
        <section aria-labelledby="rehearse-cover-title" className="mt-9" data-testid="rehearse-cover">
          <h3 id="rehearse-cover-title" className="eyebrow !text-[0.875rem]">
            No need to cover tomorrow
          </h3>
          <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2.5">
            {cover.map((c) => (
              <li key={c.concern} className="text-[1.0625rem] leading-snug">
                <span className="serif text-[1.25rem]">{c.name}</span> <span className="text-ink-soft">{c.when}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p
        data-testid="rehearse-badge"
        data-verified={plan.verified}
        className="mt-9 inline-flex w-fit items-center gap-2.5 border border-ink px-3.5 py-2 text-[0.9375rem] leading-snug"
      >
        <CheckMark />
        {plan.verified ? VERIFIED : DIRECT}
      </p>

      <form onSubmit={ask} noValidate className="mt-10 border-t border-ink pt-6">
        <label htmlFor={questionId} className="eyebrow !text-[0.875rem] !text-ink">
          What if&hellip;?
        </label>
        <div className="mt-3 flex max-w-2xl flex-col gap-3 sm:flex-row">
          <input
            id={questionId}
            type="text"
            value={question}
            maxLength={200}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (nudge) setNudge(false);
            }}
            aria-describedby={nudge || followUpError ? errorId : undefined}
            aria-invalid={nudge || undefined}
            placeholder="What if lunch is outdoors?"
            className="min-h-12 min-w-0 flex-1 border border-ink bg-paper px-4 text-[1.0625rem] text-ink placeholder:text-muted"
          />
          <button type="submit" className="btn btn-primary">
            Ask again
          </button>
        </div>
        {(nudge || followUpError) && (
          <p id={errorId} role="alert" className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink">
            {nudge ? "Add a short question, such as what if lunch is outdoors." : followUpError}
          </p>
        )}
      </form>

      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={onReplay} className="btn btn-ghost">
          Replay the day
        </button>
        <button type="button" onClick={onStartOver} className="btn btn-ghost">
          Start over
        </button>
        <button type="button" onClick={onClose} className="btn btn-ghost">
          Close
        </button>
      </div>
    </div>
  );
}
