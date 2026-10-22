"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import { isAdultConfirmed } from "@/components/try/consent";
import { ResultsExperience } from "@/components/results/ResultsExperience";
import type { CaptureResult } from "@/lib/capture/types";
import type { ConcernId } from "@/lib/contracts";
import {
  ACCESS_STORAGE_KEY,
  YOUCAM_KEY_STORAGE_KEY,
  checkAccess,
  createLiveSession,
  type Access,
  type Credentials,
  type LiveSession,
  type LiveSnapshot,
} from "@/lib/integration/live";
import { AGE_CONFIRMATION, AGE_NOTE, PRIVACY_LINE } from "@/lib/integration/privacy";
import { buildResultsData } from "@/lib/integration/viewModel";

type Gate = { kind: "checking" } | { kind: "denied"; message: string } | { kind: "ok"; replay: boolean; code: string | null; apiKey: string | null };

const unlocked = (access: Access, { code = null, apiKey = null }: Credentials): Gate =>
  access.allowed ? { kind: "ok", replay: access.replay, code, apiKey } : { kind: "denied", message: access.message };

export interface DemoFaceLink {
  id: string;
  label: string;
}

/**
 * /try/live: the access check (an own YouCam key, an access code, or neither on an open deployment), the capture flow, then the live pipeline (lib/integration/live.ts) and its results.
 * Everything runs in this browser tab except the YouCam calls, which go through /api/youcam/*.
 */
export function LiveSessionView({ faces }: { faces: DemoFaceLink[] }) {
  const [gate, setGate] = useState<Gate>({ kind: "checking" });
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [adult, setAdult] = useState(false);
  // /try asks for the 18+ confirmation before it sends anyone here; it keeps the answer for this tab, so ask only if it is missing.
  const [needsAgeGate, setNeedsAgeGate] = useState(true);
  const session = useRef<LiveSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const creds = {
      code: window.sessionStorage.getItem(ACCESS_STORAGE_KEY) || null,
      apiKey: window.sessionStorage.getItem(YOUCAM_KEY_STORAGE_KEY) || null,
    };
    checkAccess(creds).then((access: Access) => {
      if (cancelled) return;
      if (isAdultConfirmed()) {
        setAdult(true);
        setNeedsAgeGate(false);
      }
      setGate(unlocked(access, creds));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the page (closing the tab, navigating away, "try another photo") asks YouCam to delete this session's tasks.
  useEffect(() => {
    const leave = () => session.current?.cleanup();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      session.current?.dispose();
    };
  }, []);

  const begin = useCallback(
    (capture: CaptureResult) => {
      if (gate.kind !== "ok") return;
      session.current?.dispose();
      const next = createLiveSession({ accessCode: gate.code, apiKey: gate.apiKey });
      session.current = next;
      next.subscribe(setSnapshot);
      void next.start(capture);
    },
    [gate],
  );

  const restart = useCallback(() => {
    session.current?.dispose();
    session.current = null;
    setSnapshot(null);
  }, []);

  const runCoverage = useCallback((concern: ConcernId) => void session.current?.runCoverage(concern), []);

  const bundle = snapshot?.bundle ?? null;
  const options = snapshot?.options;
  const data = useMemo(() => (bundle ? buildResultsData(bundle, options) : null), [bundle, options]);

  if (data) {
    return (
      <ResultsExperience
        data={data}
        onRunCoverage={runCoverage}
        back={{ href: "/try", label: "Back to the demo faces" }}
        unitsCharged={snapshot?.unitsCharged}
      />
    );
  }

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-16 pt-10 md:pb-24 md:pt-16">
        <p className="eyebrow !text-[0.875rem]">Use my photo</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          Your skin, <em className="font-normal italic">from the other side</em>
        </h1>

        {gate.kind === "checking" && (
          <p role="status" className="lede mt-8 max-w-[34rem]">
            Checking whether live analysis is available…
          </p>
        )}

        {gate.kind === "denied" && (
          <Reserved message={gate.message} faces={faces} onUnlock={(access, creds) => setGate(unlocked(access, creds))} />
        )}

        {gate.kind === "ok" && (!snapshot || snapshot.stage === "idle") && (
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <p className="lede max-w-[30rem]">Face the camera straight on, in even light.</p>
              {gate.replay && (
                <p role="note" className="mt-6 max-w-[30rem] border-l-2 border-ink pl-4 text-[0.875rem] leading-relaxed text-ink-soft">
                  Replay mode: whatever you add is answered with a recorded analysis of a synthetic face. No units are spent.
                </p>
              )}
              <p className="mt-6 max-w-[30rem] text-[0.875rem] leading-relaxed text-ink-soft">
                For the most detail, upload a phone photo. A webcam frame is enlarged to reach the high-detail analysis, and the finest detail, such as pores, is then less certain.
              </p>
            </div>
            <div className="border border-rule bg-white p-5 sm:p-8">
              {needsAgeGate && <AgeGate adult={adult} onChange={setAdult} />}
              {adult && (
                <div className={needsAgeGate ? "mt-8 border-t border-rule pt-8" : ""}>
                  <CaptureFlow onCapture={begin} />
                </div>
              )}
            </div>
          </div>
        )}

        {snapshot && (snapshot.stage === "uploading" || snapshot.stage === "measuring") && (
          <div className="mt-10 max-w-[34rem]" aria-busy="true">
            <p className="eyebrow !text-[0.875rem]">Analysing</p>
            <p role="status" className="serif mt-3 text-[1.75rem] leading-tight" style={{ fontWeight: 380 }}>
              {snapshot.message}
            </p>
            <ol className="mt-8 space-y-3 border-t border-rule pt-5 text-[0.9375rem]">
              <li className={snapshot.stage === "uploading" ? "text-ink" : "text-muted"}>01 YouCam finds your marks.</li>
              <li className={snapshot.stage === "measuring" ? "text-ink" : "text-muted"}>02 We measure each one in millimetres and contrast.</li>
              <li className="text-muted">03 The vision model gives each concern a distance.</li>
            </ol>
          </div>
        )}

        {snapshot?.stage === "error" && (
          <div className="mt-10 max-w-[34rem]">
            <p role="alert" className="serif text-[1.5rem] leading-snug" style={{ fontWeight: 380 }}>
              {snapshot.error}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn btn-primary" onClick={restart}>
                Try another photo
              </button>
              <Link href="/try#faces" className="btn btn-ghost">
                Try a demo face
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/** Own photos are for people 18 and over: one plain checkbox, then the camera. The consent text sits right above it. */
function AgeGate({ adult, onChange }: { adult: boolean; onChange: (adult: boolean) => void }) {
  const id = useId();
  return (
    <div>
      <h2 className="title text-[1.5rem]">Before you add a photo</h2>
      <p className="mt-4 max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">{PRIVACY_LINE}</p>
      <p className="mt-3 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">{AGE_NOTE}</p>
      <label htmlFor={id} className="mt-6 flex min-h-12 cursor-pointer items-center gap-3">
        <input id={id} type="checkbox" className="h-5 w-5 shrink-0 accent-[#161513]" checked={adult} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-[1.0625rem]">{AGE_CONFIRMATION}</span>
      </label>
    </div>
  );
}

/**
 * Live analysis is not open to this visitor right now (our credits are spent, a wrong code or key, or a recorded-faces
 * deployment). A calm card in place of the camera step, so nobody takes or uploads a photo only to be turned away: say so,
 * offer the visitor's own YouCam key first and an access code second, and link the demo faces.
 */
function Reserved({ message, faces, onUnlock }: { message: string; faces: DemoFaceLink[]; onUnlock: (access: Access, creds: Credentials) => void }) {
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
      <div>
        <p role="alert" className="serif max-w-[34rem] text-[1.5rem] leading-snug" style={{ fontWeight: 380 }}>
          {message}
        </p>
        <CredentialForm
          label="YouCam API key"
          button="Use my key"
          storageKey={YOUCAM_KEY_STORAGE_KEY}
          empty="Enter your YouCam API key first."
          note="Used only for this tab's calls to YouCam. We never store it, and it is forgotten when you close the tab."
          creds={(value) => ({ apiKey: value })}
          onUnlock={onUnlock}
        />
        <CredentialForm
          label="Access code"
          button="Use code"
          storageKey={ACCESS_STORAGE_KEY}
          empty="Enter your access code first."
          creds={(value) => ({ code: value })}
          onUnlock={onUnlock}
        />
      </div>
      <div>
        <p className="eyebrow !text-[0.875rem]">Or try a demo face</p>
        <ul className="mt-4 divide-y divide-rule border-y border-rule text-[1rem]">
          {faces.map((f) => (
            <li key={f.id}>
              <Link href={`/try/${f.id}`} className="flex min-h-12 items-center justify-between">
                {f.label} <span aria-hidden="true">&rarr;</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-soft">The demo faces are synthetic (AI-generated), and need no camera, no upload, no key and no code.</p>
      </div>
    </div>
  );
}

/** One password field and its button: checks the value with the server, keeps it in this tab's storage when it works. */
function CredentialForm({
  label,
  button,
  storageKey,
  empty,
  note,
  creds,
  onUnlock,
}: {
  label: string;
  button: string;
  storageKey: string;
  empty: string;
  note?: string;
  creds: (value: string) => Credentials;
  onUnlock: (access: Access, creds: Credentials) => void;
}) {
  const inputId = useId();
  const noteId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = (field.current?.value ?? "").trim();
    if (!value) {
      setStatus(empty);
      return;
    }
    setBusy(true);
    setStatus(null);
    const access = await checkAccess(creds(value));
    setBusy(false);
    if (access.allowed) {
      window.sessionStorage.setItem(storageKey, value);
      onUnlock(access, creds(value));
    } else {
      setStatus(access.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 max-w-sm">
      <label htmlFor={inputId} className="eyebrow !text-[0.875rem] block">
        {label}
      </label>
      <div className="mt-3 flex gap-3">
        <input
          id={inputId}
          ref={field}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby={note ? noteId : undefined}
          className="h-12 min-w-0 flex-1 border border-ink bg-transparent px-4 text-[1.0625rem]"
        />
        <button type="submit" className="btn btn-primary" disabled={busy} aria-disabled={busy}>
          {busy ? "Checking…" : button}
        </button>
      </div>
      {note && (
        <p id={noteId} className="mt-2 text-[0.875rem] leading-relaxed text-muted">
          {note}
        </p>
      )}
      <p role="status" className="mt-3 min-h-6 text-[0.9375rem] leading-relaxed text-ink-soft">
        {status}
      </p>
    </form>
  );
}
