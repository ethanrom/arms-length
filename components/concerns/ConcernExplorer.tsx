"use client";

import { useId, useState } from "react";
import { formatDistance } from "@/app/_lib/axis";
import type { ConcernView } from "@/components/results/derive";
import { ReceiptTrigger } from "@/components/receipt/ReceiptSheet";
import type { DistanceAnchor, OutOfScopeNote, ReceiptEntry } from "@/components/results/types";
import { AnnotatedFace, cropAround } from "./AnnotatedFace";
import { DistanceAxisHeader, DistanceBar } from "./DistanceBar";

interface ConcernExplorerProps {
  views: ConcernView[];
  src: string;
  alt: string;
  frame: { width: number; height: number };
  anchors: DistanceAnchor[];
  outOfScope: OutOfScopeNote[];
  receipts: ReceiptEntry[];
  reliefWithinM: number;
}

export function ConcernExplorer({ views, src, alt, frame, anchors, outOfScope, receipts, reliefWithinM }: ConcernExplorerProps) {
  // Start with the farthest-carrying concern open, so the face is annotated from the first glance.
  const farthest = views.length ? views[views.length - 1].id : null;
  const [openId, setOpenId] = useState<string | null>(farthest);
  const open = views.find((v) => v.id === openId) ?? null;
  const relief = views.filter((v) => v.relief);
  const visible = views.filter((v) => !v.relief);
  const tickM = anchors.map((a) => a.distanceM);
  const aspect = frame.width / frame.height;

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      {/* the face, kept in view beside the cards on wide screens */}
      <div className="hidden lg:block">
        <div className="sticky top-6">
          <div className="stage on-stage relative flex items-center justify-center overflow-hidden [--stage-h:min(calc(100svh-5rem),820px)]">
            <div className="relative" style={{ width: `min(100%, calc(var(--stage-h) * ${aspect}))` }}>
              <AnnotatedFace src={src} alt={alt} frame={frame} view={open} sizes="(min-width: 1024px) 40vw, 90vw" />
              <p
                aria-live="polite"
                className="absolute inset-x-3 bottom-3 border border-ink/15 bg-paper px-3 py-2 text-[0.8125rem] leading-snug"
              >
                {open
                  ? `${open.copy.title}: ${open.targets.length} marked, the most visible outlined firmly.`
                  : "Open a card to see where on the face it sits."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 hidden sm:block">
          <DistanceAxisHeader anchors={anchors} />
        </div>

        <Group
          id="relief"
          heading={`Out of sight beyond ${formatDistance(reliefWithinM)}`}
          note="Nobody needs to look at these twice."
          views={relief}
          openId={openId}
          onToggle={toggle}
          tickM={tickM}
          anchors={anchors}
          receipts={receipts}
          src={src}
          alt={alt}
          frame={frame}
        />
        <Group
          id="visible"
          heading={`Still visible past ${formatDistance(reliefWithinM)}`}
          note="Ordered by how far each one carries."
          views={visible}
          openId={openId}
          onToggle={toggle}
          tickM={tickM}
          anchors={anchors}
          receipts={receipts}
          src={src}
          alt={alt}
          frame={frame}
        />

        {outOfScope.length > 0 && (
          <section aria-labelledby="not-visibility" className="mt-12 border-t border-rule pt-6">
            <h3 id="not-visibility" className="eyebrow">
              Not about visibility
            </h3>
            <p className="mt-2 max-w-md text-[0.875rem] leading-relaxed text-muted">
              These describe shape, feel or light rather than a mark someone can see, so we give them no distance.
            </p>
            <ul className="mt-4 grid gap-x-8 gap-y-2 text-[0.875rem] sm:grid-cols-2">
              {outOfScope.map((o) => (
                <li key={o.label} className="flex flex-col py-1">
                  <span className="text-ink-soft">{o.label}</span>
                  <span className="text-[0.8125rem] text-muted">{o.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

interface GroupProps {
  id: string;
  heading: string;
  note: string;
  views: ConcernView[];
  openId: string | null;
  onToggle: (id: string) => void;
  tickM: number[];
  anchors: DistanceAnchor[];
  receipts: ReceiptEntry[];
  src: string;
  alt: string;
  frame: { width: number; height: number };
}

function Group({ id, heading, note, views, openId, onToggle, tickM, anchors, receipts, src, alt, frame }: GroupProps) {
  if (views.length === 0) return null;
  return (
    <section aria-labelledby={`group-${id}`} className="mt-10 first:mt-0">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-ink pt-4">
        <h3 id={`group-${id}`} className="serif text-[1.375rem] leading-tight" style={{ fontWeight: 400 }}>
          {heading}
        </h3>
        <p className="text-[0.8125rem] text-muted">{note}</p>
      </header>
      <ul>
        {views.map((v) => (
          <ConcernCard
            key={v.id}
            view={v}
            open={openId === v.id}
            onToggle={() => onToggle(v.id)}
            tickM={tickM}
            anchors={anchors}
            receipt={receipts.find((r) => r.receipt.concern === v.id)}
            src={src}
            alt={alt}
            frame={frame}
          />
        ))}
      </ul>
    </section>
  );
}

interface CardProps {
  view: ConcernView;
  open: boolean;
  onToggle: () => void;
  tickM: number[];
  anchors: DistanceAnchor[];
  receipt: ReceiptEntry | undefined;
  src: string;
  alt: string;
  frame: { width: number; height: number };
}

function ConcernCard({ view, open, onToggle, tickM, receipt, src, alt, frame }: CardProps) {
  const panelId = useId();
  const { copy, visibility, relief } = view;

  return (
    <li className="border-b border-rule last:border-b-0">
      <div className="py-6">
        <h4>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
            className="group -mx-2 block w-[calc(100%+1rem)] px-2 text-left"
          >
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`block h-2.5 w-2.5 shrink-0 rounded-full border border-ink ${relief ? "bg-transparent" : "bg-ink"}`}
              />
              <span className="eyebrow !text-ink-soft">{copy.title}</span>
              <span className="eyebrow ml-auto flex items-center gap-2 !tracking-[0.1em]">
                <span className="num">{relief ? "Gone by" : "Up to"} {formatDistance(visibility.maxDistanceM)}</span>
                <span
                  aria-hidden="true"
                  className="relative block h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110"
                >
                  <span className="absolute left-0 top-1/2 h-px w-full bg-ink" />
                  <span className={`absolute left-1/2 top-0 h-full w-px bg-ink transition-transform duration-300 ${open ? "scale-y-0" : ""}`} />
                </span>
              </span>
            </span>
            <span className="serif mt-3 block text-[clamp(1.375rem,1.1rem+1vw,1.75rem)] leading-[1.18]" style={{ fontWeight: 380 }}>
              {copy.headline}
            </span>
            <span className="mt-2 block max-w-[34rem] text-[0.9375rem] leading-relaxed text-muted">{copy.detail}</span>
          </button>
        </h4>

        <div className="mt-4">
          <DistanceBar maxM={visibility.maxDistanceM} intervalM={visibility.intervalM} relief={relief} tickM={tickM} />
        </div>
        {receipt && (
          <div className="mt-1">
            <ReceiptTrigger entry={receipt} title={copy.title} src={src} alt={alt} frame={frame} />
          </div>
        )}

        <div id={panelId} role="region" aria-label={`${copy.title}: details`} hidden={!open} className="mt-5">
          {open && (
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)]">
              <div className="lg:hidden">
                <div className="stage on-stage">
                  <AnnotatedFace src={src} alt={alt} frame={frame} view={view} crop={cropAround(view.bounds, frame)} sizes="100vw" />
                </div>
              </div>
              <dl className="grid gap-5 text-[0.9375rem] leading-relaxed">
                <div>
                  <dt className="eyebrow">What this number means</dt>
                  <dd className="mt-1.5 max-w-[34rem] text-ink-soft">{copy.explainer}</dd>
                </div>
                <div>
                  <dt className="eyebrow">How sure we are</dt>
                  <dd className="mt-1.5 max-w-[34rem] text-ink-soft">{copy.confidence}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
