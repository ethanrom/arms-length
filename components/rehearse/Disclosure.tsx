import type { ReactNode } from "react";

/** A native disclosure with the site's hairline and a plus that turns into a minus: no script, and the keys work as they do everywhere. */
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`group border-t border-rule ${className ?? ""}`}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2 text-[0.9375rem] hover:text-ink-soft">
        <span>{summary}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0">
          <path d="M0 6h12" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6 0v12" stroke="currentColor" strokeWidth="1.3" className="group-open:hidden" />
        </svg>
      </summary>
      <div className="pb-5 pt-1">{children}</div>
    </details>
  );
}
