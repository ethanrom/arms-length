import type { Metadata } from "next";
import Link from "next/link";
import "./science.css";
import { AngleExplorer } from "@/components/science/AngleExplorer";
import { LazyMount } from "@/components/science/controls";
import { CsfExplorer } from "@/components/science/CsfExplorer";
import { ChecksTable, ReferenceList, Reproduce } from "@/components/science/Evidence";
import { FollowFeature } from "@/components/science/FollowFeature";
import { Chapter, Cite, Code } from "@/components/science/kit";
import { ModelFestWidget } from "@/components/science/ModelFestWidget";
import { PoreSurvival } from "@/components/science/PoreSurvival";
import { TwoEyes } from "@/components/science/TwoEyes";
import { WorthItDiff } from "@/components/science/WorthItDiff";
import { summarize } from "@/lib/science/modelfest";
import { codeUrl } from "@/lib/science/refs";

export const metadata: Metadata = {
  title: "The science",
  description:
    "An interactive explainer. Every widget runs the same code that produces your results: the iris ruler, the contrast sensitivity model and its ModelFest validation, with sources and commands to reproduce each number.",
};

const TOC = [
  { id: "follow", title: "Follow one mark" },
  { id: "angle", title: "Angle is everything" },
  { id: "csf", title: "The contrast sensitivity function" },
  { id: "modelfest", title: "Validated on ModelFest" },
  { id: "eyes", title: "Typical eyes and perfect eyes" },
  { id: "survival", title: "From 649 pores to one sentence" },
  { id: "worth-it", title: "“Worth it?” is a visible-difference question" },
  { id: "checks", title: "How we checked it" },
  { id: "reproduce", title: "Reproduce it" },
  { id: "references", title: "References" },
];

const ASSURANCES = [
  {
    title: "The same code",
    text: (
      <>
        These widgets import <Code>lib/vision</Code>, <Code>lib/skin</Code>, <Code>lib/scale</Code> and <Code>eval/modelfest</Code>. The app that produces your results imports
        them too.
      </>
    ),
  },
  {
    title: "No illustrative numbers",
    text: <>A slider shows a number only by calling the function that gives it in production. The one recorded input, a synthetic face&rsquo;s YouCam analysis, is labelled where it is used.</>,
  },
  {
    title: "Checked against people",
    text: null,
  },
];

export default function SciencePage() {
  const mf = summarize();
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-10 pt-10 md:pt-16">
        <p className="eyebrow">The science</p>
        <h1 className="display mt-4 max-w-5xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          The model, <em className="font-normal italic">running in your browser</em>
        </h1>
        <p className="lede mt-6 max-w-[44rem]">
          Every widget below calls the same functions that produce a result on the results page. There are no illustrative numbers, no pre-baked answers and no language model:
          drag something and the code runs. Where a number is recorded rather than computed, we say so.
        </p>

        <ul className="mt-10 grid gap-x-10 gap-y-6 border-t border-ink pt-6 md:grid-cols-3">
          {ASSURANCES.map((a) => (
            <li key={a.title}>
              <p className="eyebrow !text-ink">{a.title}</p>
              <p className="mt-2 max-w-[24rem] text-[0.9375rem] leading-relaxed text-ink-soft">
                {a.text ?? (
                  <>
                    {mf.rmsAllDb.toFixed(2)} dB RMS against 16 observers over {mf.nAll} ModelFest stimuli <Cite k={["watson2005", "modelfest"]} />. Evidence and sources are in{" "}
                    <a href="#checks" className="link text-ink">
                      How we checked it
                    </a>
                    .
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>

        <nav aria-label="On this page" className="mt-10">
          <p className="eyebrow">On this page</p>
          <ol className="mt-4 grid gap-x-10 border-t border-rule sm:grid-cols-2 lg:grid-cols-3">
            {TOC.map((t, i) => {
              const evidence = t.id === "checks" || t.id === "references";
              return (
                <li key={t.id} className="border-b border-rule">
                  <a href={`#${t.id}`} className="flex min-h-11 items-baseline gap-3 py-2 text-[0.9375rem] text-ink-soft hover:text-ink">
                    <span className="num font-mono text-[0.875rem] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className={evidence ? "font-medium text-ink" : ""}>{t.title}</span>
                  </a>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-[0.875rem] text-ink-soft">
            Looking for the evidence? Jump to{" "}
            <a href="#checks" className="link text-ink">
              How we checked it
            </a>{" "}
            or{" "}
            <a href="#references" className="link text-ink">
              References
            </a>
            . Back to the{" "}
            <Link href="/how-it-works" className="link text-ink">
              plain-language version
            </Link>
            .
          </p>
        </nav>
      </div>

      <div className="page space-y-20 pb-24 md:space-y-28">
        <Chapter
          id="follow"
          n="01"
          kicker="Follow one mark"
          title={
            <>
              From a mask to <em className="font-normal italic">a verdict</em>
            </>
          }
          lede={
            <>
              <p>
                Pick a dark spot, a pore or a line on a face YouCam analysed. Five steps turn YouCam&rsquo;s mask into a verdict at the distance you choose: the outline, its size in
                millimetres with the iris as the ruler <Cite k="ruefer2005" />, its contrast in linear light <Cite k="srgb" />, the angle it covers, and what a typical pair of eyes and
                a perfect pair need at that angle <Cite k="watson2005" />.
              </p>
            </>
          }
        >
          <LazyMount label="The feature chain" minHeight={900}>
            <FollowFeature />
          </LazyMount>
        </Chapter>

        <Chapter
          id="angle"
          n="02"
          kicker="Size, distance and contrast"
          title={
            <>
              Angle is <em className="font-normal italic">everything</em>
            </>
          }
          lede={
            <>
              <p className="serif !max-w-none text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] leading-[1.2] text-ink" style={{ fontWeight: 360 }}>
                Vision depends only on the angle a feature subtends.
              </p>
              <p>
                A 2 mm spot at 3 m and a 4 mm spot at 6 m cover the same angle, so they get the same verdict. That is why the model needs only a size in millimetres and a
                contrast, and why a feature&rsquo;s distance grows exactly in proportion to its size.
              </p>
            </>
          }
        >
          <LazyMount label="The size-by-distance map" minHeight={780}>
            <AngleExplorer />
          </LazyMount>
        </Chapter>

        <Chapter
          id="csf"
          n="03"
          kicker="The contrast sensitivity function"
          title={
            <>
              What the eye <em className="font-normal italic">lets through</em>
            </>
          }
          lede={
            <>
              <p>
                The eye is most sensitive to medium detail, about 3.5 cycles per degree, and gives up beyond 60. We use Watson and Ahumada&rsquo;s published constants unchanged{" "}
                <Cite k="watson2005" />, with their fixed oblique-effect term <Cite k="berkley1975" />. Brighter light comes from castleCSF <Cite k="castle2024" />; Barten&rsquo;s older model is a
                sanity check only <Cite k="barten1999" />.
              </p>
              <p>
                Red-green contrast, for redness and breakouts, is judged in a cone space <Cite k={["stockman2000", "hunt"]} /> with castleCSF&rsquo;s chromatic channel, which is low-pass{" "}
                <Cite k="mullen1985" />. The Step back picture splits the photo into octave bands and keeps what clears this curve <Cite k={["peli1990", "peli1996"]} />.
              </p>
            </>
          }
        >
          <LazyMount label="The contrast sensitivity function" minHeight={640}>
            <CsfExplorer />
          </LazyMount>
        </Chapter>

        <Chapter
          id="modelfest"
          n="04"
          kicker="Validated on ModelFest"
          title={
            <>
              Checked <em className="font-normal italic">against people</em>
            </>
          }
          lede={
            <>
              <p>
                ModelFest is a public data set: 16 observers in 10 laboratories found the threshold of 43 test patterns <Cite k={["watson2005", "modelfest"]} />. We generate {mf.nAll} of them
                from their published definitions and run the production detector on each.
              </p>
              <p>
                The result is {mf.rmsAllDb.toFixed(2)} dB RMS over the {mf.nAll}, {mf.rmsSkinDb.toFixed(2)} dB over the {mf.nSkin} that look like skin features, and the paper&rsquo;s own figure
                is {mf.paperRms43Db.toFixed(2)} dB over {mf.paperN}. A person differs from the average observer by {mf.observerRms0Db.toFixed(2)} dB.
              </p>
            </>
          }
        >
          <LazyMount label="The ModelFest comparison" minHeight={900}>
            <ModelFestWidget />
          </LazyMount>
        </Chapter>

        <Chapter
          id="eyes"
          n="05"
          kicker="Typical eyes and perfect eyes"
          title={
            <>
              Two observers, <em className="font-normal italic">one claim</em>
            </>
          }
          lede={
            <>
              <p>
                Every mark gets two distances: where a typical sharp-eyed person looking right at it stops picking it out, and where even a sharper pair of eyes would. The gap between
                them is the margin, and it is the only place the model leaves room for people being different.
              </p>
            </>
          }
        >
          <LazyMount label="The two observers" minHeight={760}>
            <TwoEyes />
          </LazyMount>
        </Chapter>

        <Chapter
          id="survival"
          n="06"
          kicker="From 649 pores to one sentence"
          title={
            <>
              Count the many, <em className="font-normal italic">not the farthest</em>
            </>
          }
          lede={
            <>
              <p>
                A face has hundreds of pores and the farthest one is an outlier. So the report counts how many are still picked out at fixed distances, from a mirror to well across a room{" "}
                <Cite k="hall1966" />, and says &ldquo;at most&rdquo;. A phone selfie is taken from about 30 cm <Cite k="ward2018" />; most of what the curve shows lies beyond it.
              </p>
            </>
          }
        >
          <LazyMount label="The survival curve" minHeight={760}>
            <PoreSurvival />
          </LazyMount>
        </Chapter>

        <Chapter
          id="worth-it"
          n="07"
          kicker="“Worth it?”"
          title={
            <>
              A change is worth it if <em className="font-normal italic">anyone could tell</em>
            </>
          }
          lede={
            <>
              <p>
                Compare the photo with YouCam Skin Simulation at half strength, then ask the same detector from how far someone could tell the two apart. It is a simulation of a possible
                change in the picture, not a result for any product or routine.
              </p>
            </>
          }
        >
          <LazyMount label="The photo, the simulation and their difference" minHeight={820}>
            <WorthItDiff />
          </LazyMount>
        </Chapter>

        <Chapter
          id="checks"
          n="08"
          kicker="Evidence"
          title={
            <>
              How we <em className="font-normal italic">checked it</em>
            </>
          }
          lede={
            <>
              <p className="serif !max-w-none text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] leading-[1.2] text-ink" style={{ fontWeight: 360 }}>
                No model here was trained on faces. We use a published model of human vision and test that our code reproduces it.
              </p>
            </>
          }
        >
          <ChecksTable />
        </Chapter>

        <Chapter
          id="reproduce"
          n="09"
          kicker="Reproduce"
          title={
            <>
              Reproduce <em className="font-normal italic">any of it</em>
            </>
          }
          lede={
            <p>
              Everything above is in the repository, with the command that reproduces it. Nothing on this page needs a network call to YouCam or to any other service.
            </p>
          }
        >
          <Reproduce />
        </Chapter>

        <Chapter
          id="references"
          n="10"
          kicker="References"
          title={
            <>
              <em className="font-normal italic">Sources</em> for the science
            </>
          }
          lede={
            <p>
              Citations as given in{" "}
              <a href={codeUrl("docs/MODEL.md")} className="link text-ink" target="_blank" rel="noopener noreferrer">
                MODEL.md
              </a>{" "}
              and our research notes. A link is given only where we opened the page it points to.
            </p>
          }
        >
          <ReferenceList />
        </Chapter>
      </div>
    </main>
  );
}
