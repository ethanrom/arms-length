"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { ConcernExplorer } from "@/components/concerns/ConcernExplorer";
import { MakeItDisappear } from "@/components/disappear/MakeItDisappear";
import { ShareCardPreview } from "@/components/share/ShareCardPreview";
import { StepBack } from "@/components/step-back/StepBack";
import { MaskStripView } from "./MaskStripView";
import { Section } from "@/components/ui/Section";
import { WhatIfReveal } from "@/components/whatif/WhatIfReveal";
import { deriveConcernViews } from "./derive";
import type { ResultsData } from "./types";

export function ResultsExperience({ data }: { data: ResultsData }) {
  const views = useMemo(() => deriveConcernViews(data), [data]);
  const { persona, frame, alt, measurements, report, anchors } = data;

  const coverageView = data.coverage ? views.find((v) => v.id === data.coverage?.concern) : undefined;
  const whatIfView = data.whatIf ? views.find((v) => v.id === data.whatIf?.whatIf.concern) : undefined;
  const chapters = [
    { id: "step-back", label: "Step back" },
    { id: "what-others-see", label: "What others see" },
    ...(data.coverage ? [{ id: "make-it-disappear", label: "Make it disappear" }] : []),
    ...(data.whatIf ? [{ id: "what-if", label: "What if" }] : []),
    { id: "share", label: "Share" },
  ];

  return (
    <main id="main" tabIndex={-1} className="outline-none" style={{ "--stage": data.stageGrey } as CSSProperties}>
      <header className="page pb-6 pt-5 md:pb-8 md:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
          <Link href="/try" className="link inline-flex min-h-11 items-center gap-2 text-[0.875rem] text-muted hover:text-ink">
            <span aria-hidden="true">&larr;</span> Choose another face
          </Link>
          <nav aria-label="On this page" className="-mx-5 w-[calc(100%+2.5rem)] overflow-x-auto px-5 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
            <ol className="flex gap-x-6 whitespace-nowrap sm:flex-wrap font-mono text-[0.6875rem] uppercase tracking-[0.1em]">
              {chapters.map((c, i) => (
                <li key={c.id}>
                  <a href={`#${c.id}`} className="link inline-flex min-h-9 items-center gap-2 text-ink-soft hover:text-ink">
                    <span className="num text-muted">{String(i + 1).padStart(2, "0")}</span>
                    {c.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div className="mt-4 grid gap-x-12 gap-y-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-end">
          <div>
            <p className="eyebrow">{persona.label}</p>
            <h1 className="display mt-3 text-[clamp(2.25rem,1.2rem+3.6vw,4.25rem)]">
              What others see of <em className="font-normal italic">this face</em>
            </h1>
          </div>
          <div className="md:justify-self-end">
            <p className="serif mb-3 text-[1.375rem] italic leading-snug" style={{ fontWeight: 380 }}>
              {data.tagline}
            </p>
            <p className="max-w-[30rem] text-[1rem] leading-relaxed text-ink-soft">{persona.description}</p>
            <p className="mt-2 max-w-[30rem] text-[0.8125rem] leading-relaxed text-muted">{data.provenance}</p>
          </div>
        </div>
      </header>

      <div className="page pb-8 md:pb-10">
        <MaskStripView strip={data.maskStrip} compact />
      </div>

      <Section
        id="step-back"
        index="01"
        eyebrow="From the mirror to across the room"
        title={
          <>
            Step <em className="font-normal italic">back</em>
          </>
        }
        lede="Slide away from the mirror. The face is redrawn as an observer at each distance sees it."
        compact
      >
        <StepBack
          src={persona.image}
          alt={alt}
          frame={frame}
          scale={measurements.scale}
          viewing={report.viewing}
          concerns={views}
          anchors={anchors}
          statusLines={data.statusLines}
          rendererNote={data.rendererNote}
          heroLabel={data.heroLabel}
        />
      </Section>

      <Section
        id="what-others-see"
        index="02"
        eyebrow="Relief first"
        title="What others see"
        lede="Each concern gets a distance, not a grade. The bar shows where it stops being visible on the same scale as the slider; the thin line is the plausible range."
      >
        <ConcernExplorer
          views={views}
          src={persona.image}
          alt={alt}
          frame={frame}
          anchors={anchors}
          outOfScope={data.outOfScope}
          receipts={data.receipts}
          reliefWithinM={data.reliefWithinM}
        />
      </Section>

      {data.coverage && (
        <Section
          id="make-it-disappear"
          index="03"
          eyebrow={`For ${data.coverage.title.toLowerCase()}`}
          title={
            <>
              Make it <em className="font-normal italic">disappear</em> at a distance you choose
            </>
          }
          lede={data.coverage.lede}
        >
          <MakeItDisappear
            coverage={data.coverage}
            view={coverageView}
            src={persona.image}
            frame={frame}
            scale={measurements.scale}
            viewing={report.viewing}
          />
        </Section>
      )}

      {data.whatIf && (
        <Section
          id="what-if"
          index={data.coverage ? "04" : "03"}
          eyebrow={`For ${data.whatIf.title.toLowerCase()}`}
          title={
            <>
              What <em className="font-normal italic">if</em>
            </>
          }
        >
          <WhatIfReveal whatIf={data.whatIf} view={whatIfView} src={persona.image} alt={alt} frame={frame} anchors={anchors} />
        </Section>
      )}

      <Section
        id="share"
        index={String(chapters.length).padStart(2, "0")}
        eyebrow="The comforting ones travel well"
        title="Share what others see"
        lede="Three lines and a face. The card is the same markup that will become the preview image when it is shared."
      >
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-16">
          <ShareCardPreview data={data.share} imageSrc={persona.image} />
          <div className="max-w-sm">
            <p className="eyebrow">Keep going</p>
            <ul className="mt-4 divide-y divide-rule border-y border-rule text-[0.9375rem]">
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
          </div>
        </div>
      </Section>

      <section aria-labelledby="test-title" className="on-dark bg-ink text-paper">
        <div className="page flex flex-col items-start gap-8 py-16 md:flex-row md:items-end md:justify-between md:py-24">
          <div>
            <p className="eyebrow !text-paper/70">Self-test</p>
            <h2 id="test-title" className="display mt-4 max-w-3xl text-[clamp(2.25rem,1.2rem+3.8vw,4.75rem)]">
              Don&rsquo;t trust us. <em className="font-normal italic">Test it</em> with your own eyes.
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
