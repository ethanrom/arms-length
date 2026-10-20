"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ACCESS_STORAGE_KEY, checkAccess } from "@/lib/integration/live";
import { PRIVACY_LINE } from "@/lib/integration/privacy";

/**
 * "Check mine": an optional access code (judges get one) and the gate. GET /api/youcam/status decides between live
 * analysis and "reserved for judges, try a demo face"; the camera and upload step is on /try/live.
 */
export function CheckMine() {
  const router = useRouter();
  const inputId = useId();
  const noteId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // An uncontrolled field, filled in after hydration with the code from this tab's earlier visit.
    const saved = window.sessionStorage.getItem(ACCESS_STORAGE_KEY);
    if (saved && input.current) input.current.value = saved;
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const trimmed = (input.current?.value ?? "").trim();
    const access = await checkAccess(trimmed || null);
    if (!access.allowed) {
      setMessage(access.message);
      setBusy(false);
      return;
    }
    if (trimmed) window.sessionStorage.setItem(ACCESS_STORAGE_KEY, trimmed);
    else window.sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    router.push("/try/live");
  }

  return (
    <div id="camera" className="grid gap-10 border border-rule bg-paper-deep/40 p-6 sm:p-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Your own photo</p>
        <p className="serif mt-3 text-[clamp(1.5rem,1.2rem+1.2vw,2.25rem)] leading-tight" style={{ fontWeight: 380 }}>
          Check mine
        </p>
        <p className="mt-4 max-w-[28rem] text-[0.9375rem] leading-relaxed text-muted">
          Live analysis uses YouCam Skin Analysis on your photo, so it is reserved for judges for now. If you have an access code, enter it; otherwise the demo faces above show everything it does.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate aria-describedby={noteId}>
        <label htmlFor={inputId} className="eyebrow block">
          Access code (optional)
        </label>
        <input
          id={inputId}
          name="access-code"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          ref={input}
          className="mt-3 h-12 w-full max-w-sm border border-ink bg-transparent px-4 text-[1.0625rem]"
        />
        <p id={noteId} className="mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
          {PRIVACY_LINE}
        </p>
        <div className="mt-6">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-disabled={busy}>
            {busy ? "Checking…" : "Check mine"}
            {!busy && (
              <span className="arrow" aria-hidden="true">
                &rarr;
              </span>
            )}
          </button>
        </div>
        <div role="status" aria-live="polite" className="mt-5 min-h-6 max-w-sm text-[0.9375rem] leading-relaxed">
          {message}
        </div>
      </form>
    </div>
  );
}
