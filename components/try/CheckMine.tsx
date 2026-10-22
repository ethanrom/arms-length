"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DISCLAIMERS } from "@/lib/copy/disclaimers";
import { ACCESS_STORAGE_KEY, checkAccess } from "@/lib/integration/live";
import { ADULT_STORAGE_KEY } from "./consent";

/**
 * "Use my photo": the 18+ confirmation, what happens to a photo, an optional access code (judges get one) and the gate.
 * GET /api/youcam/status decides between live analysis and "invite-only, try a demo face"; the camera and upload step
 * is on /try/live.
 */
export function CheckMine() {
  const router = useRouter();
  const codeId = useId();
  const adultId = useId();
  const noteId = useId();
  const code = useRef<HTMLInputElement>(null);
  const adult = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Uncontrolled fields, filled in after hydration with this tab's earlier answers. Restoring only ever adds: the server
    // HTML is interactive before this runs, so a tick or typing that landed first must survive (never write "unchecked" or
    // overwrite a non-empty code here).
    const saved = window.sessionStorage.getItem(ACCESS_STORAGE_KEY);
    if (saved && code.current && !code.current.value) code.current.value = saved;
    if (adult.current && window.sessionStorage.getItem(ADULT_STORAGE_KEY) === "1") adult.current.checked = true;
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!adult.current?.checked) {
      setMessage("Please confirm you are 18 or over to use your own photo. The demo faces above are for everyone.");
      adult.current?.focus();
      return;
    }
    setBusy(true);
    const trimmed = (code.current?.value ?? "").trim();
    const access = await checkAccess(trimmed || null);
    if (!access.allowed) {
      setMessage(access.message);
      setBusy(false);
      return;
    }
    if (trimmed) window.sessionStorage.setItem(ACCESS_STORAGE_KEY, trimmed);
    else window.sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    window.sessionStorage.setItem(ADULT_STORAGE_KEY, "1");
    router.push("/try/live");
  }

  return (
    <div id="camera" className="scroll-mt-6 grid gap-10 border border-rule bg-paper-deep/40 p-6 sm:p-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <div>
        <p className="eyebrow">Before you start</p>
        <p className="serif mt-3 text-[clamp(1.5rem,1.2rem+1.2vw,2.25rem)] leading-tight" style={{ fontWeight: 380 }}>
          Two things to know
        </p>
        <p className="mt-4 max-w-[28rem] text-[1rem] leading-relaxed text-ink-soft">
          Your own photo is analysed live by YouCam, which spends YouCam credits, so it is invite-only while the contest runs. Have an access code? Enter it. Otherwise the demo faces above show
          everything it does.
        </p>
        <p className="mt-4 max-w-[28rem] text-[0.9375rem] leading-relaxed text-muted">
          {DISCLAIMERS.privacy} {DISCLAIMERS.retention} {DISCLAIMERS.simulationRetention}{" "}
          <Link href="/privacy" className="link text-ink">
            Read the privacy notice
          </Link>
          .
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate aria-describedby={noteId}>
        <div className="flex items-start gap-3">
          <input
            ref={adult}
            id={adultId}
            name="adult"
            type="checkbox"
            className="mt-1 h-6 w-6 shrink-0 cursor-pointer accent-[#161513]"
            aria-describedby={noteId}
          />
          <label htmlFor={adultId} className="cursor-pointer text-[1rem] leading-relaxed text-ink">
            I am 18 or over, and I have read{" "}
            <Link href="/privacy" className="link">
              how my photo is handled
            </Link>
            .
          </label>
        </div>

        <label htmlFor={codeId} className="eyebrow mt-8 block">
          Access code (optional)
        </label>
        <input
          id={codeId}
          name="access-code"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          ref={code}
          className="mt-3 h-12 w-full max-w-sm border border-ink bg-transparent px-4 text-[1.0625rem]"
        />
        <p id={noteId} className="mt-2 max-w-sm text-[0.875rem] leading-relaxed text-muted">
          {DISCLAIMERS.adults}
        </p>
        <div className="mt-6">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-disabled={busy}>
            {busy ? "Checking…" : "Use my photo"}
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
