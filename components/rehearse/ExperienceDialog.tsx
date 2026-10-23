"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { loopTab } from "./focus";

interface ExperienceDialogProps {
  onClose: () => void;
  children: ReactNode;
  /**
   * Changes when the experience moves to a new part (ask, building, the day). Focus then goes to the first element marked
   * `data-autofocus`, so a screen reader hears the new part and the keyboard starts in it.
   */
  focusKey: string;
}

/**
 * The full-screen shell. A native modal <dialog> gives the top layer, the inert page behind it and Esc; this adds what it
 * leaves out: Tab that loops instead of leaving the page, the page behind that does not scroll, and focus that goes back to
 * the button that opened it.
 */
export function ExperienceDialog({ onClose, children, focusKey }: ExperienceDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();

    const root = document.documentElement;
    const before = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    const bar = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    if (bar > 0) root.style.paddingRight = `${bar}px`;

    return () => {
      root.style.overflow = before.overflow;
      root.style.paddingRight = before.paddingRight;
      if (dialog.open) dialog.close();
      opener?.focus?.();
    };
  }, []);

  // Each new part of the experience puts focus on its own heading (or the field it marks), so the change is announced.
  useEffect(() => {
    const dialog = ref.current;
    const target = dialog?.querySelector<HTMLElement>("[data-autofocus]");
    target?.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="rehearse-dialog"
      onKeyDown={(e) => ref.current && loopTab(e, ref.current)}
      onCancel={(e) => {
        // Esc: the experience decides what closing means (a drawer first, then the whole thing).
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 hidden h-dvh max-h-none w-screen max-w-none flex-col overflow-hidden border-0 bg-paper p-0 text-ink open:flex"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-2 md:px-10 md:py-2.5">
        <p id={titleId} className="eyebrow !text-[0.875rem]">
          Tomorrow, from their side
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-11 w-11 place-items-center border border-ink transition-colors hover:bg-ink/5"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </dialog>
  );
}
