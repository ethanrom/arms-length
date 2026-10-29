"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DISCLAIMERS } from "@/lib/copy/disclaimers";
import { ACCESS_STORAGE_KEY, YOUCAM_KEY_STORAGE_KEY, checkAccess } from "@/lib/integration/live";
import { ADULT_STORAGE_KEY } from "./consent";

/**
 * "Use my photo": the 18+ confirmation, what happens to a photo, and the gate. Live analysis is open while the contest runs;
 * a collapsed disclosure holds the two optional ways in when it is not: the visitor's own YouCam API key, or an access code.
 * GET /api/youcam/status decides between live analysis and "try a demo face"; the camera and upload step is on /try/live.
 */
export function CheckMine() {
  const router = useRouter();
  const codeId = useId();
  const keyId = useId();
  const keyNoteId = useId();
  const adultId = useId();
  const noteId = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const code = useRef<HTMLInputElement>(null);
  const key = useRef<HTMLInputElement>(null);
  const adult = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Uncontrolled fields, filled in after hydration with this tab's earlier answers. Restoring only ever adds: the server
    // HTML is interactive before this runs, so a tick or typing that landed first must survive (never write "unchecked" or
    // overwrite a non-empty code here).
    const saved = window.sessionStorage.getItem(ACCESS_STORAGE_KEY);
    if (saved && code.current && !code.current.value) code.current.value = saved;
    const savedKey = window.sessionStorage.getItem(YOUCAM_KEY_STORAGE_KEY);
    if (savedKey && key.current && !key.current.value) key.current.value = savedKey;
    if ((saved || savedKey) && disclosure.current) disclosure.current.open = true;
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
    const apiKey = (key.current?.value ?? "").trim();
    const access = await checkAccess({ code: trimmed || null, apiKey: apiKey || null });
    if (!access.allowed) {
      setMessage(access.message);
      // The reason may be about a field that is folded away: open it so the visitor can see what to fix.
      if ((trimmed || apiKey) && disclosure.current) disclosure.current.open = true;
      setBusy(false);
      return;
    }
    if (trimmed) window.sessionStorage.setItem(ACCESS_STORAGE_KEY, trimmed);
    else window.sessionStorage.removeItem(ACCESS_STORAGE_KEY);
    if (apiKey) window.sessionStorage.setItem(YOUCAM_KEY_STORAGE_KEY, apiKey);
    else window.sessionStorage.removeItem(YOUCAM_KEY_STORAGE_KEY);
    window.sessionStorage.setItem(ADULT_STORAGE_KEY, "1");
    router.push("/try/live");
  }

  return (
    <div id="camera" className="scroll-mt-6 grid gap-5 border border-rule bg-paper-deep/40 p-5 sm:p-6 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:gap-8 lg:gap-12">
      <div>
        <h2 id="camera-title" className="title text-[clamp(1.5rem,1.3rem+0.8vw,1.875rem)]">
          Use my photo
        </h2>
        <p className="mt-2 max-w-[36rem] text-[0.9375rem] leading-relaxed text-ink-soft">
          Analysed live by YouCam, within a small daily allowance of our credits. If those run out, you can use your own YouCam API key.
        </p>
        <p className="mt-3 max-w-[36rem] text-[0.875rem] leading-relaxed text-muted">
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
            className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-[#161513]"
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
        <p id={noteId} className="mt-2 pl-9 text-[0.875rem] leading-relaxed text-muted">
          {DISCLAIMERS.adults}
        </p>

        <div className="mt-4">
          <button type="submit" className="btn btn-primary" disabled={busy} aria-disabled={busy}>
            {busy ? "Checking…" : "Use my photo"}
            {!busy && (
              <span className="arrow" aria-hidden="true">
                &rarr;
              </span>
            )}
          </button>
        </div>

        <details ref={disclosure} className="mt-1 max-w-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-[0.9375rem] text-ink underline underline-offset-4">Have a YouCam API key? Use your own</summary>
          <label htmlFor={keyId} className="eyebrow mt-3 block">
            YouCam API key (optional)
          </label>
          <input
            id={keyId}
            name="youcam-key"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            ref={key}
            aria-describedby={keyNoteId}
            className="mt-2 h-12 w-full border border-ink bg-transparent px-4 text-[1.0625rem]"
          />
          <p id={keyNoteId} className="mt-2 text-[0.875rem] leading-relaxed text-muted">
            Used only for this tab&rsquo;s calls to YouCam, and never stored on our server. It is forgotten when you close the tab. You can delete the key from your YouCam account after judging.
          </p>
          <label htmlFor={codeId} className="eyebrow mt-4 block">
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
            className="mt-2 h-12 w-full border border-ink bg-transparent px-4 text-[1.0625rem]"
          />
        </details>
        <div role="status" aria-live="polite" className={`max-w-sm text-[0.9375rem] leading-relaxed ${message ? "mt-4" : ""}`}>
          {message}
        </div>
      </form>
    </div>
  );
}
