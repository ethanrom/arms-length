"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import { ResultsExperience } from "@/components/results/ResultsExperience";
import type { CaptureResult } from "@/lib/capture/types";
import type { ConcernId } from "@/lib/contracts";
import { ACCESS_STORAGE_KEY, checkAccess, createLiveSession, type Access, type LiveSession, type LiveSnapshot } from "@/lib/integration/live";
import { AGE_CONFIRMATION, AGE_NOTE, PRIVACY_LINE } from "@/lib/integration/privacy";
import { buildResultsData } from "@/lib/integration/viewModel";

type Gate = { kind: "checking" } | { kind: "denied"; message: string } | { kind: "ok"; replay: boolean; code: string | null };

/**
 * /try/live: the access check, the capture flow, then the live pipeline (lib/integration/live.ts) and its results.
 * Everything runs in this browser tab except the YouCam calls, which go through /api/youcam/*.
 */
export function LiveSessionView() {
  const [gate, setGate] = useState<Gate>({ kind: "checking" });
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [adult, setAdult] = useState(false);
  const session = useRef<LiveSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const code = window.sessionStorage.getItem(ACCESS_STORAGE_KEY) || null;
    checkAccess(code).then((access: Access) => {
      if (cancelled) return;
      setGate(access.allowed ? { kind: "ok", replay: access.replay, code } : { kind: "denied", message: access.message });
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
      const next = createLiveSession({ accessCode: gate.code });
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
        <p className="eyebrow">Check mine</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          Your skin, <em className="font-normal italic">from the other side</em>
        </h1>

        {gate.kind === "checking" && (
          <p role="status" className="lede mt-8 max-w-[34rem]">
            Checking whether live analysis is available…
          </p>
        )}

        {gate.kind === "denied" && (
          <div className="mt-8 max-w-[34rem]">
            <p role="alert" className="serif text-[1.5rem] leading-snug" style={{ fontWeight: 380 }}>
              {gate.message}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/try#faces" className="btn btn-primary">
                Try a demo face <span className="arrow" aria-hidden="true">&rarr;</span>
              </Link>
              <Link href="/try#camera" className="btn btn-ghost">
                Enter an access code
              </Link>
            </div>
          </div>
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
              {adult ? <CaptureFlow onCapture={begin} /> : <AgeGate onConfirm={() => setAdult(true)} />}
            </div>
          </div>
        )}

        {snapshot && (snapshot.stage === "uploading" || snapshot.stage === "measuring") && (
          <div className="mt-10 max-w-[34rem]" aria-busy="true">
            <p className="eyebrow">Analysing</p>
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
function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  const id = useId();
  return (
    <div>
      <h2 className="title text-[1.5rem]">Before you add a photo</h2>
      <p className="mt-4 max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">{PRIVACY_LINE}</p>
      <p className="mt-3 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">{AGE_NOTE}</p>
      <label htmlFor={id} className="mt-6 flex min-h-12 cursor-pointer items-center gap-3">
        <input id={id} type="checkbox" className="h-5 w-5 shrink-0 accent-[#161513]" checked={false} onChange={onConfirm} />
        <span className="text-[1.0625rem]">{AGE_CONFIRMATION}</span>
      </label>
    </div>
  );
}
