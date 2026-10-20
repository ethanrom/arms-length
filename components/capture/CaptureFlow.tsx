"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  assessFrame,
  decodeUpload,
  describeCameraError,
  detectStill,
  finalizeCapture,
  grabFrame,
  loadLandmarker,
  openCamera,
  startLiveDetection,
  type Finalized,
} from "@/lib/capture/browser";
import { faceBoxFromLandmarks, guidance, type CaptureQuality } from "@/lib/capture/quality";
import type { CaptureResult } from "@/lib/capture/types";
import type { Box, Size2 } from "@/lib/contracts";
import { PRIVACY_LINE } from "@/lib/integration/privacy";

export const CONSENT_TEXT = PRIVACY_LINE;

const LIVE_INTERVAL_MS = 200; // about 5 checks per second
const STABLE_TICKS = 3; // a guidance message must hold this long before it is announced
const READY_TEXT = "Looks good. Hold still and take the photo.";

type Phase = "idle" | "starting" | "live" | "working" | "review";

interface LiveState {
  quality: CaptureQuality;
  size: Size2;
  /** Face bounds as fractions of the frame, for the overlay. */
  box: Box | null;
}

export interface CaptureFlowProps {
  /** Called when the user accepts a photo. */
  onCapture: (result: CaptureResult) => void;
}

const button =
  "rounded-md border border-zinc-900 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";
const primary = `${button} bg-zinc-900 text-white hover:bg-zinc-700`;
const secondary = `${button} bg-white text-zinc-900 hover:bg-zinc-100`;

export function CaptureFlow({ onCapture }: CaptureFlowProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [review, setReview] = useState<Finalized | null>(null);
  const [accepted, setAccepted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  // Move focus to the heading when the step changes, so keyboard and screen reader users are not left on a
  // button that has just disappeared.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [phase]);

  // Live guidance: landmarks a few times per second while the camera is on.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (phase !== "live" || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {});

    let cancelled = false;
    let timer = 0;
    let candidate = "";
    let held = 0;
    startLiveDetection()
      .then((detect) => {
        const tick = () => {
          if (cancelled) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const size = { width: video.videoWidth, height: video.videoHeight };
            const detection = detect(video);
            const quality = assessFrame(video, size, detection);
            let box: Box | null = null;
            if (detection) {
              const b = faceBoxFromLandmarks(detection.landmarks, size);
              box = { x: b.x / size.width, y: b.y / size.height, w: b.w / size.width, h: b.h / size.height };
            }
            setLive({ quality, size, box });
            const text = guidance(quality) ?? READY_TEXT;
            held = text === candidate ? held + 1 : 1;
            candidate = text;
            if (held === STABLE_TICKS) setStatus(text);
          }
          timer = window.setTimeout(tick, LIVE_INTERVAL_MS);
        };
        tick();
      })
      .catch(() => {
        if (cancelled) return;
        stopCamera();
        setError("Face detection could not load. Check your connection and try again.");
        setPhase("idle");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      video.srcObject = null;
    };
  }, [phase, stopCamera]);

  async function startCamera() {
    setError(null);
    setLive(null);
    setReview(null);
    setAccepted(false);
    setPhase("starting");
    setStatus("Starting the camera…");
    const model = loadLandmarker();
    let stream: MediaStream;
    try {
      stream = await openCamera();
    } catch (e) {
      model.catch(() => {});
      setError(describeCameraError(e));
      setPhase("idle");
      return;
    }
    try {
      await model;
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Face detection could not load. Check your connection and try again.");
      setPhase("idle");
      return;
    }
    streamRef.current = stream;
    setStatus("Looking for your face…");
    setPhase("live");
  }

  async function analyse(canvas: HTMLCanvasElement) {
    try {
      const finalized = finalizeCapture(canvas, await detectStill(canvas));
      setReview(finalized);
      setPhase("review");
      if (finalized.result) setStatus("Photo ready. Check it, then use it or retake.");
      else setStatus(`This photo can't be used yet. ${firstHardHint(finalized.quality)}`);
    } catch {
      setError("Face detection could not run on that photo. Try again or use a different photo.");
      setPhase("idle");
    }
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video) return;
    if (!live?.quality.usable) {
      setStatus(live ? (guidance(live.quality) ?? "Hold still for a moment.") : "Looking for your face…");
      return;
    }
    const frame = grabFrame(video);
    stopCamera();
    setPhase("working");
    setStatus("Checking your photo…");
    await analyse(frame);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setError(null);
    setAccepted(false);
    setPhase("working");
    setStatus("Checking your photo…");
    let canvas: HTMLCanvasElement;
    try {
      canvas = await decodeUpload(file);
    } catch {
      setError("That file could not be read as a photo. Try a JPEG or PNG.");
      setPhase("idle");
      return;
    }
    await analyse(canvas);
  }

  function stopAndReset() {
    stopCamera();
    setLive(null);
    setReview(null);
    setAccepted(false);
    setPhase("idle");
    setStatus("Camera stopped.");
  }

  function accept() {
    if (!review?.result) return;
    setAccepted(true);
    setStatus("Photo accepted.");
    onCapture(review.result);
  }

  const q = live?.quality;
  const boxColour = !live?.box
    ? "stroke-white"
    : q?.ok
      ? "stroke-emerald-400"
      : q?.usable
        ? "stroke-amber-400"
        : "stroke-red-400";

  return (
    <section
      aria-labelledby="capture-heading"
      data-capture-phase={phase}
      className="mx-auto flex w-full max-w-xl flex-col gap-4 text-zinc-900"
    >
      <h2 id="capture-heading" ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
        {phase === "review" ? "Check your photo" : "Add a photo"}
      </h2>

      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-capture="status"
        className="min-h-6 text-base font-medium"
      >
        {status}
      </p>
      {error && (
        <p role="alert" data-capture="error" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {(phase === "idle" || phase === "starting" || phase === "working") && (
        <>
          <ul className="list-disc pl-5 text-sm text-zinc-700" data-capture="tips">
            <li>Face the camera straight on, with your whole face in view.</li>
            <li>Use even light, and switch off any beauty or smoothing filter.</li>
            <li>A photo from your phone camera gives the most detail.</li>
          </ul>
          <p data-capture="consent" className="text-sm text-zinc-700">
            {CONSENT_TEXT}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={startCamera} disabled={phase !== "idle"}>
              Use my camera
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => fileRef.current?.click()}
              disabled={phase !== "idle"}
            >
              Upload a photo
            </button>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFile}
        aria-hidden="true"
        tabIndex={-1}
      />

      {phase === "live" && (
        <>
          <div
            data-capture="viewfinder"
            className="relative w-full overflow-hidden rounded-md bg-zinc-900"
            // Mirrored like a mirror; the saved photo is not mirrored.
            style={{
              aspectRatio: live ? `${live.size.width} / ${live.size.height}` : "16 / 9",
              transform: "scaleX(-1)",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="Live camera preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              {live?.box && (
                <rect
                  x={live.box.x}
                  y={live.box.y}
                  width={live.box.w}
                  height={live.box.h}
                  rx={0.02}
                  fill="none"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                  className={boxColour}
                />
              )}
            </svg>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={`${primary} aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
              aria-disabled={!q?.usable}
              onClick={takePhoto}
            >
              Take photo
            </button>
            <button type="button" className={secondary} onClick={stopAndReset}>
              Stop camera
            </button>
          </div>
        </>
      )}

      {phase === "review" && review && (
        <>
          {review.preview && (
            <figure className="flex flex-col gap-2" data-capture="preview">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made in this tab */}
              <img
                src={review.preview}
                alt="Your photo, cropped around your face as it will be analysed"
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              {review.result && (
                <figcaption className="text-sm text-zinc-700">
                  {review.result.size.width} × {review.result.size.height} px.{" "}
                  {review.result.engine === "hd"
                    ? review.result.upscaled
                      ? "Enlarged to reach the high-detail analysis, so the finest detail is less certain. A phone photo gives the most."
                      : "Enough detail for the high-detail analysis."
                    : "This is under 1080 px on its short side, so it uses the standard-detail analysis."}
                </figcaption>
              )}
            </figure>
          )}
          <Issues quality={review.quality} />
          <p data-capture="consent" className="text-sm text-zinc-700">
            {CONSENT_TEXT}
          </p>
          <div className="flex flex-wrap gap-3">
            {review.result && (
              <button
                type="button"
                className={`${primary} aria-disabled:opacity-50`}
                aria-disabled={accepted}
                onClick={accept}
              >
                {accepted ? "Photo accepted" : "Use this photo"}
              </button>
            )}
            <button type="button" className={secondary} onClick={startCamera}>
              Retake with camera
            </button>
            <button type="button" className={secondary} onClick={() => fileRef.current?.click()}>
              Upload another photo
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function firstHardHint(q: CaptureQuality): string {
  return q.checks.find((c) => !c.ok && c.hard)?.hint ?? "";
}

function Issues({ quality }: { quality: CaptureQuality }) {
  const failed = quality.checks.filter((c) => !c.ok);
  // With no face found, every other check fails by default; only the first answer is useful.
  const noFace = failed.find((c) => c.id === "face");
  const hard = noFace ? [noFace] : failed.filter((c) => c.hard);
  const soft = noFace ? [] : failed.filter((c) => !c.hard);
  if (hard.length === 0 && soft.length === 0) return null;
  return (
    <div data-capture="issues" className="flex flex-col gap-2 text-sm">
      {hard.length > 0 && (
        <>
          <p className="font-medium">This photo can&apos;t be used yet:</p>
          <ul className="list-disc pl-5">
            {hard.map((c) => (
              <li key={c.id}>{c.hint}</li>
            ))}
          </ul>
        </>
      )}
      {soft.length > 0 && (
        <>
          <p className="font-medium">{hard.length > 0 ? "Also worth fixing:" : "Worth a second look:"}</p>
          <ul className="list-disc pl-5">
            {soft.map((c) => (
              <li key={c.id}>{c.hint}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
