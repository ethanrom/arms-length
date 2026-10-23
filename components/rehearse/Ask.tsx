"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EXAMPLE_DAYS, type RehearsePrefs } from "@/lib/contracts/rehearse";

/** The longest day we send. Long enough for a paragraph of plans; the server holds its own limit too. */
export const MAX_DAY_CHARS = 600;

interface AskProps {
  prefs: RehearsePrefs;
  onPrefs: (prefs: RehearsePrefs) => void;
  onSubmit: (day: string) => void;
  /** A kind sentence when the last run did not come back with a plan. */
  error?: string | null;
  /** The day as typed. Held by the parent so a failed run does not lose it. */
  day: string;
  onDay: (day: string) => void;
}

const SEGMENT =
  "flex min-h-11 items-center justify-center border-l border-ink px-5 text-[0.9375rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline";

/** Small line icons for the three examples: 22 px, the same 1.25 px stroke as the scenes. */
const ICONS: Record<(typeof EXAMPLE_DAYS)[number]["id"], ReactNode> = {
  workday: (
    <>
      <rect x="4" y="5" width="14" height="9" rx="1" />
      <path d="M2 17.5h18M8 14v3.5M14 14v3.5" />
    </>
  ),
  presenting: (
    <>
      <rect x="3" y="3.5" width="16" height="10" rx="1" />
      <path d="M11 13.5V19M7 19.5h8M6.5 8.5l3 2 3-4 3 2" />
    </>
  ),
  wedding: (
    <>
      <circle cx="8.5" cy="12" r="5" />
      <circle cx="14" cy="12" r="5" />
      <path d="M11.2 3.5l1.2 1.7-1.2 1.6-1.2-1.6z" />
    </>
  ),
};

/** The ask: "What's tomorrow?" in large type, a few words about the day, three examples, two preferences, the button. */
export function Ask({ prefs, onPrefs, onSubmit, error, day, onDay }: AskProps) {
  const [nudge, setNudge] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const ids = { question: useId(), hint: useId(), nudge: useId(), device: useId() };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = day.trim();
    if (text.length < 3) {
      setNudge(true);
      field.current?.focus();
      return;
    }
    setNudge(false);
    onSubmit(text);
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto flex w-full max-w-[52rem] flex-col px-5 pb-12 pt-4 md:px-10 md:pt-10">
      <h2 className="serif text-[clamp(2.5rem,1.6rem+4.4vw,5rem)] leading-[1.02] tracking-[-0.02em]" style={{ fontWeight: 340 }}>
        <label htmlFor={ids.question}>What&rsquo;s tomorrow?</label>
      </h2>

      <textarea
        ref={field}
        id={ids.question}
        data-autofocus
        name="day"
        rows={3}
        maxLength={MAX_DAY_CHARS}
        value={day}
        onChange={(e) => {
          onDay(e.target.value);
          if (nudge) setNudge(false);
        }}
        aria-describedby={`${ids.hint}${nudge ? ` ${ids.nudge}` : ""}`}
        aria-invalid={nudge || undefined}
        placeholder="9am video call, lunch by the window, dinner at 7"
        className="mt-8 block w-full resize-none border-0 border-b border-ink bg-transparent px-0 py-3 text-[clamp(1.25rem,1.05rem+0.9vw,1.75rem)] leading-snug text-ink placeholder:text-muted"
      />
      <p id={ids.hint} className="mt-3 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Times, places and whether you will be on a call all help.
      </p>
      {nudge && (
        <p id={ids.nudge} role="alert" className="mt-2 text-[1rem] text-ink">
          Add a line about your day, or start from one of the examples.
        </p>
      )}

      <div role="group" aria-label="Examples to start from" className="mt-7 flex flex-wrap gap-2.5">
        {EXAMPLE_DAYS.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => {
              onDay(ex.day);
              setNudge(false);
            }}
            className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-ink px-4 text-left text-[0.9375rem] leading-snug transition-colors hover:bg-ink/5"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              {ICONS[ex.id]}
            </svg>
            {ex.chip}
          </button>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-start gap-x-12 gap-y-6">
        <fieldset>
          <legend className="eyebrow !text-[0.875rem]">Calls are on a</legend>
          <div className="mt-2.5 inline-flex border border-ink">
            {(
              [
                { value: "laptop", label: "Laptop" },
                { value: "phone", label: "Phone" },
              ] as const
            ).map((d) => (
              <label key={d.value} className="relative cursor-pointer">
                <input type="radio" name={ids.device} className="peer sr-only" checked={prefs.callDevice === d.value} onChange={() => onPrefs({ ...prefs, callDevice: d.value })} />
                <span className={`${SEGMENT} min-w-[6.5rem]`}>{d.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="relative flex max-w-xs cursor-pointer items-center gap-3 self-end pb-1.5">
          <input type="checkbox" className="peer sr-only" checked={prefs.noMakeup} onChange={(e) => onPrefs({ ...prefs, noMakeup: e.target.checked })} />
          <span
            aria-hidden="true"
            className="grid h-6 w-6 shrink-0 place-items-center border border-ink bg-paper text-paper peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:bg-[Highlight]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={prefs.noMakeup ? "block" : "hidden"}>
              <path d="M2.5 7.4l3 3 6-6.4" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          <span className="text-[1rem] leading-snug">I&rsquo;d rather not wear makeup</span>
        </label>
      </div>

      {error && (
        <p role="alert" data-testid="rehearse-error" className="mt-8 max-w-xl border-l-2 border-ink pl-4 text-[1rem] leading-relaxed">
          {error}
        </p>
      )}

      <div className="mt-10">
        <button type="submit" className="btn btn-primary">
          Show me tomorrow
          <span className="arrow" aria-hidden="true">
            &rarr;
          </span>
        </button>
      </div>
    </form>
  );
}
