/** The quiet list of what the run is doing. The last line is the one in progress while `active`; the rest are done. */
export function Progress({ steps, active, label }: { steps: string[]; active: boolean; label: string }) {
  if (steps.length === 0) return null;
  return (
    <ol aria-live="polite" aria-label={label} data-testid="rehearse-steps" className="space-y-2.5">
      {steps.map((text, i) => {
        const current = active && i === steps.length - 1;
        return (
          <li key={`${i}-${text}`} className="flex items-start gap-3 text-[1rem] leading-snug">
            <span
              aria-hidden="true"
              className={`mt-[0.4rem] block h-2.5 w-2.5 shrink-0 rounded-full border border-ink ${current ? "animate-pulse bg-transparent" : "bg-ink forced-colors:bg-[CanvasText]"}`}
            />
            <span className={current ? "text-ink" : "text-ink-soft"}>
              {text}
              {current && <span className="sr-only"> (in progress)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
