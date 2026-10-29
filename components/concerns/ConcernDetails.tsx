"use client";

import { useEffect, useId, useRef } from "react";
import { formatDistance, fractionAt } from "@/app/_lib/axis";
import type { ConcernView } from "@/components/results/derive";
import type { ScaleEstimate, ViewingConditions } from "@/lib/contracts";
import { formatInterval, shareWord } from "@/lib/copy";
import { ReceiptTrigger } from "@/components/receipt/ReceiptSheet";
import type { DistanceAnchor, ReceiptEntry } from "@/components/results/types";
import { AnnotatedFace, cropAround } from "./AnnotatedFace";
import { ChartFigure } from "./ChartFigure";
import { DistanceAxisHeader, DistanceBar } from "./DistanceBar";
import { SurvivalCurve } from "./SurvivalCurve";

export interface ConcernDetailsProps {
  view: ConcernView;
  src: string;
  frame: { width: number; height: number };
  anchors: DistanceAnchor[];
  receipt: ReceiptEntry | undefined;
  scale: ScaleEstimate;
  viewing: ViewingConditions;
  /** Follows the "lightest touch" hook: the sheet closes, then the page opens that tab. */
  onGoTo: (tabId: string) => void;
}

/** The scale-uncertainty whisker, carried from the bound over to the distance the bar is drawn at. */
function scaledInterval([lo, hi]: [number, number], at: number, of: number): [number, number] {
  const k = of > 0 ? at / of : 1;
  return [lo * k, hi * k];
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Everything one concern's card used to hold, in a side sheet that opens from its row: the sentences, the mark-safety line,
 * where it sits on the face, the chart with its data table, the "How we know" receipt, and what the number means.
 */
export function ConcernSheet({ onClose, ...details }: ConcernDetailsProps & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { view } = details;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={titleId}
      // The receipt's own sheet sits inside this one, and React passes its "close" up the tree: only this sheet's own counts.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="px-6 pb-10 pt-6 sm:px-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="eyebrow !text-[0.875rem]">{view.copy.keyLine}</p>
            <h2 id={titleId} className="title mt-2 text-[1.875rem]">
              {view.copy.title}
            </h2>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
        <ConcernDetails
          {...details}
          onGoTo={(tabId) => {
            dialog.current?.close();
            details.onGoTo(tabId);
          }}
        />
      </div>
    </dialog>
  );
}

function ConcernDetails({ view, src, frame, anchors, receipt, scale, viewing, onGoTo }: ConcernDetailsProps) {
  const { copy, visibility, relief } = view;
  const tickM = anchors.map((a) => a.distanceM);
  // The named distances the table reads off, without the selfie stop that sits 5 cm from the mirror.
  const stops = anchors.filter((a) => a.label !== "Selfie");

  return (
    <div className="mt-5">
      <p className="serif text-[clamp(1.375rem,1.1rem+1vw,1.625rem)] leading-[1.2]" style={{ fontWeight: 400 }}>
        {copy.headline}
      </p>
      <p className="mt-2 max-w-[34rem] text-[1rem] leading-relaxed text-ink-soft">{copy.detail}</p>

      {/* a mark's distance says how visible it is, not what it is */}
      {copy.safety && <p className="mt-3 max-w-[34rem] border-l-2 border-ink pl-3 text-[0.875rem] leading-relaxed text-ink-soft">{copy.safety}</p>}

      <div className="stage on-stage mt-5">
        <AnnotatedFace src={src} alt="" frame={frame} view={view} crop={cropAround(view.bounds, frame)} sizes="(min-width: 640px) 34rem, 100vw" />
      </div>
      <p className="mt-2 text-[0.875rem] leading-snug text-ink-soft">{copy.title}: the most visible are outlined firmly.</p>

      {/* A large soft area states no distance, so it gets neither a bar nor a curve. */}
      {!view.soft && (
        <div className="mt-6">
          <DistanceAxisHeader anchors={anchors} />
          {view.profile ? (
            <ChartFigure
              caption="Solid line: a typical sharp-eyed person. Dashed line: the most that even perfect eyes could pick out. The dot marks where about half have dropped out of sight for a typical person."
              tableLabel={`${copy.title}: share that can be picked out at each distance`}
              head={["Distance", "Typical sharp-eyed person", "Even perfect eyes (at most)"]}
              rows={stops.map((a) => [
                `${a.label}, ${formatDistance(a.distanceM)}`,
                capitalise(shareWord(fractionAt(view.nominalProfile ?? view.profile!, a.distanceM))),
                capitalise(shareWord(fractionAt(view.profile!, a.distanceM))),
              ])}
            >
              <SurvivalCurve profile={view.profile} nominalProfile={view.nominalProfile} medianM={view.keyDistanceM} relief={relief} tickM={tickM} decorative />
            </ChartFigure>
          ) : (
            <ChartFigure
              caption={`A typical sharp-eyed person could pick it out up to about ${formatDistance(view.keyDistanceM)}. Even perfect eyes, at most ${formatDistance(visibility.maxDistanceM)}.`}
              tableLabel={`${copy.title}: farthest distance it can be picked out`}
              head={["Observer", "Farthest distance"]}
              rows={[
                ["Typical sharp-eyed person", `About ${formatDistance(view.keyDistanceM)}`],
                ["Even perfect eyes (at most)", formatDistance(visibility.maxDistanceM)],
                ["Plausible range, perfect eyes", formatInterval(visibility.intervalM)],
              ]}
            >
              <DistanceBar
                maxM={view.keyDistanceM}
                intervalM={scaledInterval(visibility.intervalM, view.keyDistanceM, visibility.maxDistanceM)}
                relief={relief}
                tickM={tickM}
                decorative
              />
            </ChartFigure>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-8 gap-y-1">
        {receipt && view.targets.some((t) => t.id === receipt.targetId) && (
          <ReceiptTrigger
            entry={receipt}
            visibility={visibility}
            target={view.targets.find((t) => t.id === receipt.targetId)!}
            scale={scale}
            viewing={viewing}
            title={copy.title}
            src={src}
            frame={frame}
          />
        )}
        {copy.hook && (
          <a
            href="#make-it-disappear"
            onClick={(e) => {
              e.preventDefault();
              onGoTo("make-it-disappear");
            }}
            className="link inline-flex min-h-10 items-center text-[0.875rem]"
          >
            {copy.hook}
          </a>
        )}
      </div>

      <dl className="mt-6 grid gap-5 border-t border-rule pt-6 text-[0.9375rem] leading-relaxed">
        <div>
          <dt className="eyebrow !text-[0.875rem]">What this number means</dt>
          <dd className="mt-1.5 max-w-[34rem] text-ink-soft">{copy.explainer}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-[0.875rem]">How sure we are</dt>
          <dd className="mt-1.5 max-w-[34rem] text-ink-soft">{copy.confidence}</dd>
        </div>
      </dl>
    </div>
  );
}
