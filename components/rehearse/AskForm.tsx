"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { EXAMPLE_DAYS, type RehearsePrefs } from "@/lib/contracts/rehearse";

/** The longest day we send. Long enough for a paragraph of plans; the server holds its own limit too. */
export const MAX_DAY_CHARS = 600;

interface AskFormProps {
  busy: boolean;
  prefs: RehearsePrefs;
  onPrefs: (prefs: RehearsePrefs) => void;
  onSubmit: (day: string) => void;
}

const SEGMENT =
  "flex min-h-11 items-center justify-center border-l border-ink px-5 text-[0.9375rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline";

/** The ask: a few words about the day, three examples to start from, two preferences, and the button. */
export function AskForm({ busy, prefs, onPrefs, onSubmit }: AskFormProps) {
  const [day, setDay] = useState("");
  const [nudge, setNudge] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const ids = { text: useId(), hint: useId(), device: useId(), nudge: useId() };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
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
    <form onSubmit={submit} noValidate className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div>
        <label htmlFor={ids.text} className="eyebrow !text-[0.875rem] !text-ink">
          Tell me about tomorrow
        </label>
        <textarea
          ref={field}
          id={ids.text}
          name="day"
          rows={4}
          maxLength={MAX_DAY_CHARS}
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            if (nudge) setNudge(false);
          }}
          aria-describedby={`${ids.hint}${nudge ? ` ${ids.nudge}` : ""}`}
          aria-invalid={nudge || undefined}
          placeholder="9am video call, lunch with a friend by the window, dinner at 7"
          className="mt-3 block w-full resize-y border border-ink bg-paper px-4 py-3 text-[1.0625rem] leading-relaxed text-ink placeholder:text-muted"
        />
        <p id={ids.hint} className="mt-2 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          Times, places and whether you will be on a call all help. Only the measurements are used, not the photo.
        </p>
        {nudge && (
          <p id={ids.nudge} role="alert" className="mt-2 text-[0.9375rem] text-ink">
            Add a line about your day, or start from one of the examples.
          </p>
        )}

        <div role="group" aria-label="Examples to start from" className="mt-5 flex flex-wrap gap-2">
          {EXAMPLE_DAYS.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => {
                setDay(ex.day);
                setNudge(false);
              }}
              className="inline-flex min-h-10 items-center border border-ink px-3.5 text-left text-[0.875rem] leading-snug transition-colors hover:bg-ink/5 sm:min-h-11 sm:px-4"
            >
              {ex.chip}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-7 lg:pt-8">
        <fieldset>
          <legend className="eyebrow !text-[0.875rem]">Your calls are on a</legend>
          <div className="mt-3 inline-flex border border-ink">
            {(
              [
                { value: "laptop", label: "Laptop" },
                { value: "phone", label: "Phone" },
              ] as const
            ).map((d) => (
              <label key={d.value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={ids.device}
                  className="peer sr-only"
                  checked={prefs.callDevice === d.value}
                  onChange={() => onPrefs({ ...prefs, callDevice: d.value })}
                />
                <span className={`${SEGMENT} min-w-[6.5rem]`}>{d.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="relative flex max-w-sm cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={prefs.noMakeup}
            onChange={(e) => onPrefs({ ...prefs, noMakeup: e.target.checked })}
          />
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center border border-ink bg-paper text-paper peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:bg-[Highlight]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={prefs.noMakeup ? "block" : "hidden"}>
              <path d="M2.5 7.4l3 3 6-6.4" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </span>
          <span className="text-[1rem] leading-snug">
            I&rsquo;d rather not wear makeup
            <span className="mt-0.5 block text-[0.875rem] leading-snug text-ink-soft">Advice then stays with distance, light and framing.</span>
          </span>
        </label>

        <div>
          <button type="submit" className="btn btn-primary" aria-disabled={busy}>
            {busy ? "Rehearsing" : "Rehearse my day"}
            {!busy && (
              <span className="arrow" aria-hidden="true">
                &rarr;
              </span>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
