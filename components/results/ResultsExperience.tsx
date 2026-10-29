"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { DEFAULT_AXIS } from "@/app/_lib/axis";
import { ConcernSheet } from "@/components/concerns/ConcernDetails";
import { MakeItDisappear } from "@/components/disappear/MakeItDisappear";
import { RehearseDay } from "@/components/rehearse/RehearseDay";
import { ShareStudio } from "@/components/share/ShareStudio";
import { StepBack } from "@/components/step-back/StepBack";
import { WorthItReveal } from "@/components/whatif/WorthItReveal";
import type { ConcernId } from "@/lib/contracts";
import type { RehearseRequest } from "@/lib/contracts/rehearse";
import { deriveConcernViews } from "./derive";
import { createDistanceStore } from "./distanceStore";
import { PanelHead } from "./PanelHead";
import { ResultsTabs, useTabState, type TabSpec } from "./ResultsTabs";
import type { ResultsData } from "./types";
import { WhatTheySee } from "./WhatTheySee";

interface ResultsExperienceProps {
  data: ResultsData;
  /** Live sessions: run the coverage try-ons for a concern on request. */
  onRunCoverage?: (concern: ConcernId) => void;
  /** Where "back" goes: the face chooser for demo faces, the start of the flow for a live session. */
  back?: { href: string; label: string };
  /** Live sessions: YouCam units this session has used so far, for the engine strip. */
  unitsCharged?: number;
  /** Adds the "Tomorrow" tab for this face. Absent when the feature is off. */
  rehearse?: { requestFace: RehearseRequest["face"] };
}

const FIRST_TAB = "what-others-see";

/**
 * The results page, as an app rather than an article. The face and the Step back controls stay on the left (on a wide screen
 * they never scroll away); on the right a tab per feature: what they see (a row per concern, following the slider), the
 * day-ahead agent, the lightest touch, "Worth it?" and the share card. The tab ids are the section ids the page always had, so
 * `#worth-it` still opens "Worth it?".
 */
export function ResultsExperience({ data, onRunCoverage, back = { href: "/try", label: "Choose another face" }, unitsCharged, rehearse }: ResultsExperienceProps) {
  const views = useMemo(() => deriveConcernViews(data), [data]);
  const { persona, frame, measurements, report, anchors } = data;

  // The slider's distance, shared with the rows without re-rendering the page on every step.
  const [distance] = useState(() => createDistanceStore(DEFAULT_AXIS.min));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const highlight = views.find((v) => v.id === selectedId) ?? null;
  const detailsView = views.find((v) => v.id === detailsId) ?? null;

  const ids = [FIRST_TAB, ...(rehearse ? ["rehearse"] : []), ...(data.coverage ? ["make-it-disappear"] : []), ...(data.worthIt ? ["worth-it"] : []), "share"];
  const [active, select] = useTabState(ids, FIRST_TAB);
  const goTo = useCallback(
    (id: string) => {
      select(id);
      // The control that opened the sheet is in a panel that is now hidden: put focus on the tab that took its place.
      requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
    },
    [select],
  );

  const tabs: TabSpec[] = [
    {
      id: FIRST_TAB,
      label: "What they see",
      content: <WhatTheySee data={data} views={views} distance={distance} selectedId={selectedId} onSelect={setSelectedId} onDetails={setDetailsId} unitsCharged={unitsCharged} />,
    },
    ...(rehearse
      ? [
          {
            id: "rehearse",
            label: "Tomorrow",
            content: (
              <>
                <PanelHead
                  eyebrow="What others see, hour by hour"
                  title={
                    <>
                      Tomorrow, from <em className="font-normal italic">their side</em>
                    </>
                  }
                  lede="Tell us what your day holds and see your face as the people there will, at their distance and in their light."
                />
                <RehearseDay requestFace={rehearse.requestFace} photo={{ src: persona.image, alt: data.alt, frame, scale: measurements.scale, focus: data.loupe }} />
              </>
            ),
          },
        ]
      : []),
    ...(data.coverage
      ? [
          {
            id: "make-it-disappear",
            label: "The lightest touch",
            content: (
              <>
                <PanelHead
                  eyebrow="Checked on a virtual try-on"
                  title={
                    <>
                      The lightest <em className="font-normal italic">touch</em>
                    </>
                  }
                  lede={data.coverage.lede}
                />
                <MakeItDisappear coverage={data.coverage} src={persona.image} frame={frame} scale={measurements.scale} viewing={report.viewing} onRun={onRunCoverage} />
              </>
            ),
          },
        ]
      : []),
    ...(data.worthIt
      ? [
          {
            id: "worth-it",
            label: "Worth it?",
            content: (
              <>
                <PanelHead
                  eyebrow="YouCam Skin Simulation"
                  title={
                    <>
                      Worth <em className="font-normal italic">it?</em>
                    </>
                  }
                />
                <WorthItReveal worthIt={data.worthIt} src={persona.image} frame={frame} anchors={anchors} disclaimer={data.disclaimers.simulation} />
              </>
            ),
          },
        ]
      : []),
    {
      id: "share",
      label: "Share",
      content: (
        <>
          <PanelHead
            eyebrow="The comforting ones travel well"
            title="Share what others see"
            lede="Choose the lines. The card has no face unless you add a synthetic one, and it says who it is for."
          />
          <ShareStudio share={data.share} />
          <ul className="mt-8 max-w-sm divide-y divide-rule border-y border-rule text-[0.9375rem]">
            <li>
              <Link href="/try" className="flex min-h-12 items-center justify-between">
                Try another face <span aria-hidden="true">&rarr;</span>
              </Link>
            </li>
            <li>
              <Link href="/how-it-works" className="flex min-h-12 items-center justify-between">
                How the distances are worked out <span aria-hidden="true">&rarr;</span>
              </Link>
            </li>
          </ul>
        </>
      ),
    },
  ];

  return (
    <main id="main" tabIndex={-1} className="outline-none" style={{ "--stage": data.stageGrey } as CSSProperties}>
      <div className="page pb-10 pt-3 lg:pb-10 lg:pt-4">
        <div className="grid grid-cols-1 gap-x-14 gap-y-3 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:grid-rows-[auto_1fr] lg:items-start">
          <header className="lg:col-start-2 lg:row-start-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6">
              <Link href={back.href} className="link inline-flex min-h-10 items-center gap-2 text-[0.9375rem] text-ink-soft hover:text-ink">
                <span aria-hidden="true">&larr;</span> {back.label}
              </Link>
              <p className="eyebrow !text-[0.875rem]">{persona.label}</p>
            </div>
            <h1 className="display mt-1 text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] lg:mt-3">
              What others see of <em className="font-normal italic">{data.ownPhoto ? "your skin" : "this face"}</em>
            </h1>
          </header>

          <section id="step-back" aria-label="Step back from the mirror" className="lg:sticky lg:top-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <StepBack
              src={persona.image}
              alt={data.alt}
              frame={frame}
              scale={measurements.scale}
              viewing={report.viewing}
              concerns={views}
              anchors={anchors}
              statusLines={data.statusLines}
              heroLabel={data.heroLabel}
              estimate={data.disclaimers.estimate}
              synthetic={data.disclaimers.synthetic}
              loupe={data.loupe}
              highlight={highlight}
              onDistanceChange={distance.set}
            />
          </section>

          <div className="lg:col-start-2 lg:row-start-2">
            <ResultsTabs tabs={tabs} active={active} onChange={select} label="What this reading shows" />
          </div>
        </div>
      </div>

      {detailsView && (
        <ConcernSheet
          key={detailsView.id}
          view={detailsView}
          src={persona.image}
          frame={frame}
          anchors={anchors}
          receipt={data.receipts.find((r) => r.concern === detailsView.id)}
          scale={measurements.scale}
          viewing={report.viewing}
          onGoTo={goTo}
          onClose={() => setDetailsId(null)}
        />
      )}

      <section aria-labelledby="test-title" className="on-dark bg-ink text-paper">
        <div className="page flex flex-col items-start gap-8 py-16 md:flex-row md:items-end md:justify-between md:py-24">
          <div>
            <p className="eyebrow !text-[0.875rem] !text-paper/80">Self-test</p>
            <h2 id="test-title" className="display mt-4 max-w-3xl text-[clamp(2.25rem,1.2rem+3.8vw,4.75rem)]">
              Check it <em className="font-normal italic">with your own eyes.</em>
            </h2>
          </div>
          <Link href="/self-test" className="btn border-paper bg-paper text-ink hover:bg-white">
            Walk back and see <span className="arrow" aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
