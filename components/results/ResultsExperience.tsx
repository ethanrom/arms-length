"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { ConcernExplorer } from "@/components/concerns/ConcernExplorer";
import { MakeItDisappear } from "@/components/disappear/MakeItDisappear";
import { ShareStudio } from "@/components/share/ShareStudio";
import { StepBack } from "@/components/step-back/StepBack";
import { Section } from "@/components/ui/Section";
import { WorthItReveal } from "@/components/whatif/WorthItReveal";
import type { ConcernId } from "@/lib/contracts";
import { engineBadge } from "@/lib/integration/copy";
import { deriveConcernViews } from "./derive";
import { EngineStrip } from "./EngineStrip";
import { MaskDisclosure } from "./MaskDisclosure";
import type { ResultsData } from "./types";

interface ResultsExperienceProps {
  data: ResultsData;
  /** Live sessions: run the coverage try-ons for a concern on request. */
  onRunCoverage?: (concern: ConcernId) => void;
  /** Where "back" goes: the face chooser for demo faces, the start of the flow for a live session. */
  back?: { href: string; label: string };
  /** Live sessions: YouCam units this session has used so far, for the engine strip. */
  unitsCharged?: number;
}

/**
 * The results page. The face and the Step back slider come first, the rest follows in the order a visitor wants it:
 * the YouCam credit, what others see (relief first, with receipts), the lightest touch, "Worth it?", and the share card.
 */
export function ResultsExperience({ data, onRunCoverage, back = { href: "/try", label: "Choose another face" }, unitsCharged }: ResultsExperienceProps) {
  const views = useMemo(() => deriveConcernViews(data), [data]);
  const { persona, frame, measurements, report, anchors } = data;

  const chapters = [
    { id: "what-others-see", label: "What others see" },
    ...(data.coverage ? [{ id: "make-it-disappear", label: data.coverage.title }] : []),
    ...(data.worthIt ? [{ id: "worth-it", label: "Worth it?" }] : []),
    { id: "share", label: "Share" },
  ];
  const num = (id: string) => String(chapters.findIndex((c) => c.id === id) + 1).padStart(2, "0");

  return (
    <main id="main" tabIndex={-1} className="outline-none" style={{ "--stage": data.stageGrey } as CSSProperties}>
      <div className="page pt-2">
        <Link href={back.href} className="link inline-flex min-h-10 items-center gap-2 text-[0.9375rem] text-ink-soft hover:text-ink">
          <span aria-hidden="true">&larr;</span> {back.label}
        </Link>
      </div>

      <section id="step-back" aria-label="Step back from the mirror" className="page scroll-mt-4 pb-8 pt-1 md:pb-10">
        <StepBack
          src={persona.image}
          alt={data.alt}
          frame={frame}
          scale={measurements.scale}
          viewing={report.viewing}
          concerns={views}
          anchors={anchors}
          statusLines={data.statusLines}
          rendererNote={data.rendererNote}
          heroLabel={data.heroLabel}
          estimate={data.disclaimers.estimate}
          validation={data.engine.validation}
          loupe={data.loupe}
        />
      </section>

      <EngineStrip engine={data.engine} badge={engineBadge(data.source, unitsCharged)} live={data.source === "live"} />

      <header className="page py-10 md:py-14">
        <div className="grid gap-x-12 gap-y-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-end">
          <div>
            <p className="eyebrow !text-[0.875rem]">{persona.label}</p>
            <h1 className="display mt-3 text-[clamp(2.25rem,1.3rem+3vw,3.75rem)]">
              What others see of <em className="font-normal italic">{data.ownPhoto ? "your skin" : "this face"}</em>
            </h1>
          </div>
          <div className="md:justify-self-end">
            {persona.description && <p className="max-w-[30rem] text-[1rem] leading-relaxed text-ink-soft">{persona.description}</p>}
            <p className={`max-w-[30rem] text-[0.875rem] leading-relaxed text-ink-soft ${persona.description ? "mt-2" : ""}`}>{data.provenance}</p>
          </div>
        </div>
        <p className="serif mt-6 max-w-3xl text-[clamp(1.25rem,1rem+1vw,1.75rem)] leading-snug" style={{ fontWeight: 380 }}>
          {data.summary}
        </p>
        {data.disclaimers.synthetic && <p className="mt-3 max-w-3xl text-[0.875rem] leading-relaxed text-ink-soft">{data.disclaimers.synthetic}</p>}
        {data.notices.length > 0 && (
          <ul className="mt-4 max-w-3xl space-y-1 border-l-2 border-ink pl-4 text-[0.9375rem] leading-relaxed text-ink-soft" aria-label="Notes about this reading">
            {data.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        <div className="mt-8">
          <MaskDisclosure strip={data.maskStrip} />
        </div>

        <nav aria-label="On this page" className="mt-8">
          <ol className="flex flex-wrap gap-x-6 gap-y-1 text-[0.9375rem]">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="link inline-flex min-h-10 items-center gap-2 text-ink-soft hover:text-ink">
                  <span className="num text-ink-soft">{String(i + 1).padStart(2, "0")}</span>
                  {c.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <Section
        id="what-others-see"
        index={num("what-others-see")}
        eyebrow="Relief first"
        title="What others see"
        lede="Every concern gets a distance, not a grade. Open a card for where it sits on the face, the chart behind it, and the receipt."
      >
        <ConcernExplorer
          views={views}
          src={persona.image}
          frame={frame}
          anchors={anchors}
          outOfScope={data.outOfScope}
          receipts={data.receipts}
          reliefNote={data.reliefNote}
          scale={measurements.scale}
          viewing={report.viewing}
        />
      </Section>

      {data.coverage && (
        <Section
          id="make-it-disappear"
          index={num("make-it-disappear")}
          eyebrow="Checked on a virtual try-on"
          title={
            <>
              The lightest <em className="font-normal italic">touch</em>
            </>
          }
          lede={data.coverage.lede}
        >
          <MakeItDisappear coverage={data.coverage} src={persona.image} frame={frame} scale={measurements.scale} viewing={report.viewing} onRun={onRunCoverage} />
        </Section>
      )}

      {data.worthIt && (
        <Section
          id="worth-it"
          index={num("worth-it")}
          eyebrow="YouCam Skin Simulation"
          title={
            <>
              Worth <em className="font-normal italic">it?</em>
            </>
          }
        >
          <WorthItReveal worthIt={data.worthIt} src={persona.image} frame={frame} anchors={anchors} disclaimer={data.disclaimers.simulation} />
        </Section>
      )}

      <Section
        id="share"
        index={num("share")}
        eyebrow="The comforting ones travel well"
        title="Share what others see"
        lede="Choose the lines. The card has no face unless you add a synthetic one, and it says who it is for."
      >
        <ShareStudio share={data.share} />
        <ul className="mt-12 max-w-sm divide-y divide-rule border-y border-rule text-[0.9375rem]">
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
      </Section>

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
