"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatDistance } from "@/app/_lib/axis";
import { cropAround } from "@/components/concerns/AnnotatedFace";
import type { Target } from "@/components/results/derive";
import type { ReceiptEntry } from "@/components/results/types";
import type { ConcernVisibility, ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { receiptCounts, safetyLineFor } from "@/lib/copy";
import { buildReceipt, locationInPhoto, receiptSentences, type ReceiptNumbers } from "@/lib/integration/receipt";
import { IRIS_DIAMETER_MM } from "@/lib/scale/iris";

const IRIS_MM = IRIS_DIAMETER_MM;

interface ReceiptTriggerProps {
  entry: ReceiptEntry;
  /** The concern's report line, for the exact counts (receipts are the one place counts appear). */
  visibility: ConcernVisibility;
  /** The measured target the receipt is about (from `ResultsData.measurements`). */
  target: Target;
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  /** "Dark spots" */
  title: string;
  src: string;
  frame: { width: number; height: number };
  className?: string;
}

const pct = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));

/**
 * A "How we know" button and the sheet it opens: the chain behind one distance, with real numbers from
 * lib/integration/receipt.ts. The distance can be changed; the verdict is the model's bound at that distance. Both
 * observers are always shown: what a typical sharp-eyed person needs, and what even perfect eyes need.
 */
export function ReceiptTrigger({ entry, visibility, target, scale, viewing, title, src, frame, className }: ReceiptTriggerProps) {
  const [open, setOpen] = useState(false);
  const [distanceM, setDistanceM] = useState(entry.defaultDistanceM);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const groupId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  const numbers = useMemo(() => buildReceipt(target, scale, viewing, distanceM), [target, scale, viewing, distanceM]);
  const sentences = useMemo(() => (numbers ? receiptSentences(numbers) : null), [numbers]);
  const counts = useMemo(() => receiptCounts(visibility), [visibility]);
  const safety = safetyLineFor(visibility.concern);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`link inline-flex min-h-10 items-center gap-2 text-[0.9375rem] font-medium ${className ?? ""}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="6.2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 6.2v3.8M7 3.9v.1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        How we know
        <span className="sr-only">: {title}</span>
      </button>

      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        {open && numbers && sentences && (
          <div className="px-6 pb-10 pt-6 sm:px-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="eyebrow !text-[0.875rem]">How we know</p>
                <h2 id={titleId} className="title mt-2 text-[1.875rem]">
                  {title}, at {formatDistance(distanceM)}
                </h2>
              </div>
              <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </div>

            <fieldset className="mt-6">
              <legend className="eyebrow !text-[0.875rem]">Seen from</legend>
              <div className="mt-3 inline-flex flex-wrap border border-ink" role="radiogroup" aria-label="Viewing distance">
                {entry.distancesM.map((d) => (
                  <label key={d} className="relative cursor-pointer">
                    <input type="radio" name={groupId} className="peer sr-only" checked={d === distanceM} onChange={() => setDistanceM(d)} />
                    <span className="num flex min-h-11 min-w-[4.25rem] items-center justify-center border-l border-ink px-3 text-[0.9375rem] transition-colors first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:font-semibold forced-colors:peer-checked:underline">
                      {formatDistance(d)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <ol className="mt-8">
              <Step n="01" sentence={sentences.found}>
                <MaskCrop outline={entry.outline} src={src} frame={frame} title={title} />
                {sentences.foundNote && <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">{sentences.foundNote}</p>}
                {safety && <p className="mt-3 border-l-2 border-ink pl-3 text-[0.875rem] leading-relaxed text-ink-soft">{safety}</p>}
              </Step>
              <Step n="02" sentence={sentences.size}>
                <RulerBars numbers={numbers} sourceLabel={sentences.sizeSource} />
              </Step>
              <Step n="03" sentence={sentences.contrast}>
                <Readout
                  value={pct(numbers.contrastPct)}
                  unit="%"
                  caption={numbers.basis === "counterfactual" ? "against the same face without it" : "against the surrounding skin"}
                />
              </Step>
              <Step n="04" sentence={sentences.angle}>
                <Compare numbers={numbers} />
                <p className="mt-5 serif text-[1.5rem] leading-snug" style={{ fontWeight: 400 }} aria-live="polite">
                  {sentences.verdict}
                </p>
                <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">{sentences.model}</p>
                <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-soft">An arcmin is a sixtieth of a degree, about the finest detail a sharp eye can make out.</p>
              </Step>
              {counts && (
                <Step n="05" sentence={`How many of your ${counts.total} marks, at a few distances.`}>
                  <ul className="space-y-2 text-[0.9375rem] leading-relaxed text-ink-soft">
                    {counts.rows.map((row) => (
                      <li key={row.distanceM}>{row.sentence}</li>
                    ))}
                  </ul>
                  {counts.nominalEstimated && (
                    <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">The typical-person counts are estimated from the perfect-eyes counts for this reading.</p>
                  )}
                </Step>
              )}
            </ol>
          </div>
        )}
      </dialog>
    </>
  );
}

function Step({ n, sentence, children }: { n: string; sentence: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t border-ink py-6">
      <span className="num pt-1 font-mono text-[0.875rem] text-ink-soft">{n}</span>
      <div>
        <p className="serif text-[1.25rem] leading-snug" style={{ fontWeight: 400 }}>
          {sentence}
        </p>
        <div className="mt-4">{children}</div>
      </div>
    </li>
  );
}

function Readout({ value, unit, caption }: { value: string; unit: string; caption?: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="serif num text-[3rem] font-light leading-none tracking-[-0.03em]">{value}</span>
      <span className="serif text-[1.25rem] text-ink-soft">{unit}</span>
      {caption && <span className="ml-2 text-[0.875rem] text-ink-soft">{caption}</span>}
    </p>
  );
}

/** The close-up of what YouCam found. The outline is drawn for sighted readers; the words say where it is. */
function MaskCrop({ outline, src, frame, title }: { outline: { x: number; y: number }[]; src: string; frame: { width: number; height: number }; title: string }) {
  const x0 = Math.min(...outline.map((p) => p.x));
  const y0 = Math.min(...outline.map((p) => p.y));
  const x1 = Math.max(...outline.map((p) => p.x));
  const y1 = Math.max(...outline.map((p) => p.y));
  const crop = cropAround({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, frame, 1.1, 4 / 3, 190);
  const d = outline.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
  const where = locationInPhoto({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, frame);
  const alt = `A close-up of the photo around the area YouCam found, ${where}. A light outline traces it.`;

  return (
    <figure>
      <div className="stage on-stage relative overflow-hidden" style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
        <Image
          src={src}
          alt={alt}
          width={frame.width}
          height={frame.height}
          sizes="480px"
          unoptimized
          className="absolute max-w-none"
          style={{
            width: `${(frame.width / crop.w) * 100}%`,
            left: `${(-crop.x / crop.w) * 100}%`,
            top: `${(-crop.y / crop.h) * 100}%`,
            height: "auto",
          }}
        />
        <svg aria-hidden="true" viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d={d} fill="none" stroke="#161513" strokeOpacity="0.55" strokeWidth="5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={d} fill="none" stroke="#f5f3ef" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <figcaption className="mt-2 text-[0.875rem] leading-snug text-ink-soft">
        {title}: found {where}.
      </figcaption>
    </figure>
  );
}

const mm = (v: number) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v)));

function RulerBars({ numbers, sourceLabel }: { numbers: ReceiptNumbers; sourceLabel: string }) {
  const sizeMm = numbers.sizeMm;
  const domain = Math.max(IRIS_MM, sizeMm) * 1.04;
  const w = (v: number) => `${(v / domain) * 100}%`;
  return (
    <div>
      <Readout value={mm(sizeMm)} unit="mm" caption={sourceLabel} />
      <div className="mt-5 space-y-3" role="img" aria-label={`The feature is ${mm(sizeMm)} millimetres; the iris used as the ruler is ${IRIS_MM} millimetres.`}>
        <div>
          <div className="flex justify-between gap-4 text-[0.875rem] text-ink-soft">
            <span>Iris, the ruler</span>
            <span className="num">{IRIS_MM} mm</span>
          </div>
          <div className="mt-1.5 h-2.5 border border-ink" style={{ width: w(IRIS_MM) }} />
        </div>
        <div>
          <div className="flex justify-between gap-4 text-[0.875rem] text-ink-soft">
            <span>{numbers.kind === "line" ? "This line, across" : "This feature"}</span>
            <span className="num">{mm(sizeMm)} mm</span>
          </div>
          <div className="mt-1.5 h-2.5 border border-ink bg-ink forced-colors:bg-[CanvasText]" style={{ width: `max(4px, ${w(sizeMm)})` }} />
        </div>
      </div>
    </div>
  );
}

/** What a typical sharp-eyed person needs, what even perfect eyes need, and what this one has: a figure with its words. */
function Compare({ numbers }: { numbers: ReceiptNumbers }) {
  const { angleArcmin, contrastPct, thresholdPct, typicalThresholdPct, distanceM } = numbers;
  const domain = Math.max(contrastPct, thresholdPct, typicalThresholdPct) * 1.1 || 1;
  const w = (v: number) => `${(v / domain) * 100}%`;
  const rows = [
    { label: "Needed by a typical sharp-eyed person", value: typicalThresholdPct, solid: false },
    { label: "Needed by even perfect eyes", value: thresholdPct, solid: false },
    { label: "It has", value: contrastPct, solid: true },
  ];
  return (
    <figure>
      <Readout value={angleArcmin < 10 ? angleArcmin.toFixed(1) : String(Math.round(angleArcmin))} unit="arcmin" caption={`at ${formatDistance(distanceM)}`} />
      <div className="mt-5 space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between gap-4 text-[0.875rem] text-ink-soft">
              <span>{r.label}</span>
              <span className="num">{pct(r.value)}%</span>
            </div>
            <div
              aria-hidden="true"
              className={`mt-1.5 h-2.5 border border-ink ${r.solid ? "bg-ink forced-colors:bg-[CanvasText]" : "bg-transparent"}`}
              style={{ width: `max(4px, ${w(r.value)})` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
        At this distance a typical sharp-eyed person needs about {pct(typicalThresholdPct)}% contrast, even perfect eyes need about {pct(thresholdPct)}%, and it has {pct(contrastPct)}%.
      </figcaption>
    </figure>
  );
}
