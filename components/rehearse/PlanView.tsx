"use client";

import { useId, useState, type FormEvent, type ReactNode, type Ref } from "react";
import type { DayPlan } from "@/lib/contracts/rehearse";
import { Disclosure } from "./Disclosure";
import { MomentCard, type Rerun } from "./MomentCard";
import type { RehearsePhoto } from "./TheirView";

interface PlanViewProps {
  plan: DayPlan;
  photo: RehearsePhoto;
  /** What the run did, in the order it did it. */
  steps: string[];
  rerun?: Rerun;
  onSelectMoment?: (distanceM: number) => void;
  /** Sends a follow-up question; the plan is replaced when the answer arrives. */
  onFollowUp: (question: string) => void;
  followUp: { busy: boolean; error: string | null };
  /** The follow-up's progress list, shown under the form while it runs. */
  progress?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

const VERIFIED = "Every number checked against the model";
const DIRECT = "Built directly from the model";

export function PlanView({ plan, photo, steps, rerun, onSelectMoment, onFollowUp, followUp, progress, ref }: PlanViewProps) {
  const count = plan.moments.length;
  const headingId = useId();
  const questionId = useId();
  const errorId = useId();
  const [question, setQuestion] = useState("");
  const [nudge, setNudge] = useState(false);

  const ask = (e: FormEvent) => {
    e.preventDefault();
    if (followUp.busy) return;
    const text = question.trim();
    if (text.length < 3) return setNudge(true);
    setNudge(false);
    onFollowUp(text);
  };

  return (
    <div ref={ref} tabIndex={-1} role="region" aria-labelledby={headingId} aria-busy={followUp.busy} data-testid="rehearse-plan" className="rise outline-none">
      <header className="grid gap-x-12 gap-y-5 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-end">
        <div>
          <h3 id={headingId} className="eyebrow !text-[0.875rem]">
            Your day in {count} {count === 1 ? "moment" : "moments"}
          </h3>
          <p className="serif mt-3 text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] leading-snug" style={{ fontWeight: 380 }} data-testid="rehearse-summary">
            {plan.summary.text}
          </p>
        </div>
        <p
          data-testid="rehearse-badge"
          data-verified={plan.verified}
          className="inline-flex w-fit items-center gap-2.5 justify-self-start border border-ink px-3.5 py-2 text-[0.9375rem] leading-snug md:justify-self-end"
        >
          <CheckMark />
          {plan.verified ? VERIFIED : DIRECT}
        </p>
      </header>

      <ol className={`mt-10 transition-opacity duration-300 ${followUp.busy ? "opacity-60" : ""}`}>
        {plan.moments.map((moment) => (
          <li key={moment.id}>
            <MomentCard plan={plan} moment={moment} photo={photo} rerun={rerun} onSelectMoment={onSelectMoment} />
          </li>
        ))}
      </ol>

      <form onSubmit={ask} noValidate className="border-t border-ink pt-6">
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
            aria-describedby={nudge || followUp.error ? errorId : undefined}
            aria-invalid={nudge || undefined}
            placeholder="What if lunch is outdoors?"
            className="min-h-12 min-w-0 flex-1 border border-ink bg-paper px-4 text-[1.0625rem] text-ink placeholder:text-muted"
          />
          <button type="submit" className="btn btn-primary" aria-disabled={followUp.busy}>
            {followUp.busy ? "Rehearsing" : "Ask again"}
          </button>
        </div>
        {(nudge || followUp.error) && (
          <p id={errorId} role="alert" className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink">
            {nudge ? "Add a short question, such as what if lunch is outdoors." : followUp.error}
          </p>
        )}
        {progress && <div className="mt-5">{progress}</div>}
      </form>

      <Disclosure summary="How this was put together" className="mt-8 border-b">
        <div className="max-w-2xl space-y-3 text-[0.9375rem] leading-relaxed text-ink-soft">
          <p>
            {plan.verified
              ? "An AI planner split your day into moments and chose a scene for each. Every number in its wording was matched to a result from the vision model before you saw it."
              : "This plan was written straight from the model's results with fixed templates, rather than in the planner's own words. The numbers are the same kind; the sentences are plainer."}
            {plan.stats.repairs > 0 && " The planner revised its wording once after a check."}
          </p>
          {steps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 marker:text-ink">
              {steps.map((s, i) => (
                <li key={`${i}-${s}`}>{s}</li>
              ))}
            </ol>
          )}
          <p className="num text-[0.875rem]">
            {(plan.stats.ms / 1000).toFixed(1)} s, {plan.stats.turns} planner {plan.stats.turns === 1 ? "turn" : "turns"}, {plan.stats.toolCalls} tool calls.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
