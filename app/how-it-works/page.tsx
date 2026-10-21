import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CsfChart } from "@/components/how/CsfChart";
import { IrisFigure } from "@/components/how/IrisFigure";
import { MeasureFigure } from "@/components/how/MeasureFigure";
import { SummaryCards } from "@/components/how/SummaryCards";
import { MaskStripView } from "@/components/results/MaskStripView";
import { formatDistance } from "@/lib/copy";
import { keyDistanceOf } from "@/lib/integration/copy";
import { loadBundle, loadDemoResults } from "@/lib/integration/demo";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Arm's Length turns a YouCam skin analysis into distances: the iris as a ruler, masks to millimetres, a vision model checked against 16 observers, and why not just ask an AI.",
};

const CHAPTERS = [
  { id: "idea", title: "The idea" },
  { id: "iris", title: "The iris as a ruler" },
  { id: "millimetres", title: "From masks to millimetres" },
  { id: "vision", title: "How vision fades detail" },
  { id: "observers", title: "Two kinds of eyes" },
  { id: "youcam", title: "The YouCam APIs we use" },
  { id: "validation", title: "Checked against people" },
  { id: "ai", title: "Why not just ask an AI?" },
  { id: "limits", title: "Limitations" },
];

/** What each YouCam call costs and what we take from it (docs/YOUCAM.md section 2, from real calls and the feature-cost list). */
const API_ROWS = [
  {
    api: "HD Skin Analysis",
    send: "The photo.",
    use: "Masks for eight concerns (17 masks): breakouts, dark spots, pores, fine lines, under-eye shadows, under-eye puffiness, redness and texture. The raw material for every distance.",
    units: "16 (12 on the standard engine, our fallback)",
  },
  {
    api: "Skin Simulation",
    send: "The photo and a strength for each concern.",
    use: "A picture of the same face with a concern reduced. At half strength it answers “where would a change be noticed?”; at full strength it is the face without the shading, to measure shading against.",
    units: "4 for up to four concerns, 6 for five to ten (a live session sends one call with seven)",
  },
  {
    api: "Makeup VTO",
    send: "The photo and a foundation coverage level.",
    use: "A try-on picture, measured again, to find the lightest coverage that puts a mark out of sight from a chosen distance.",
    units: "1 per picture",
  },
  {
    api: "Task delete",
    send: "The id of a finished task.",
    use: "Removes the photo and results from YouCam when you leave the page. It cannot remove Skin Simulation pictures early.",
    units: "0",
  },
];

const LIMITS = [
  "A distance is a model of a sharp-eyed viewer looking right at the feature, not a forecast of what one person will notice. We quote a typical sharp-eyed person for what can be picked out, and perfect eyes for what is out of sight.",
  "An unretouched photo matters. Beauty filters and heavy smoothing lower the measured contrast, which can make a feature look less visible than it is.",
  "The scale rests on the iris, about 4% either way, unless you calibrate with a bank card.",
  "Light changes what shows. We assume indoor face brightness; strong sun and raking light reveal more.",
  "A photo and a screen are not your face. They render contrast by their own rules.",
  "YouCam's HD line mask can mark beard stubble along the jaw as lines. Those marks are thin and short, so they rarely change a result.",
  "We tested four synthetic faces. That shows the method works end to end; it is not proof that it works equally on every skin tone, and we do not claim that.",
  "The demo faces are synthetic (AI-generated). Their analyses were recorded from YouCam in advance, so opening one makes no live call.",
  "Arm's Length is about visibility, not health: it says nothing about how your skin is doing and gives no advice.",
];

const REPO = "https://github.com/ethanrom/arms-length/blob/main/docs";

function Chapter({ id, n, title, children }: { id: string; n: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t border-ink pt-6 md:pt-8">
      <p className="eyebrow flex items-center gap-3">
        <span className="num text-ink">{n}</span>
        <span aria-hidden="true" className="h-px w-8 bg-ink/40" />
      </p>
      <h2 id={`${id}-h`} className="display mt-3 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
        {title}
      </h2>
      <div className="prose-body mt-6 space-y-5 text-[1.0625rem] leading-[1.7] text-ink-soft">{children}</div>
    </section>
  );
}

/** A chart that is wider than a phone: it scrolls sideways rather than shrinking its text below reading size. */
function ChartFrame({ src, alt, width, height, label }: { src: string; alt: string; width: number; height: number; label: string }) {
  return (
    <div className="!max-w-none overflow-x-auto border border-rule bg-[#fcfcfb]" tabIndex={0} aria-label={label}>
      <Image src={src} alt={alt} width={width} height={height} unoptimized className="mx-auto h-auto w-full min-w-[38rem] max-w-[46rem]" />
    </div>
  );
}

export default function HowItWorksPage() {
  // The long-form figures reuse demo faces and their measured spots.
  const demo = loadDemoResults("p2b");
  const spots = demo?.measurements.features.filter((f) => f.concern === "age_spot" && f.centroid.x > 700) ?? [];
  const relief = loadBundle("p1a");
  const pore = relief?.report.concerns.find((c) => c.concern === "pore");
  const poreHalf = pore ? formatDistance(keyDistanceOf(pore)) : "about a metre and a half";

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-8 pt-10 md:pt-16">
        <p className="eyebrow">How it works</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          From a skin analysis to <em className="font-normal italic">a distance</em>
        </h1>
        <p className="lede mt-6 max-w-[38rem]">
          YouCam finds every mark. We measure it, then ask how far away a person could still see it. Every number is computed from the photo and the analysis; no language model writes it and no score is invented.
        </p>
      </div>

      <section aria-labelledby="five-h" className="page pb-14 pt-4 md:pb-20">
        <h2 id="five-h" className="eyebrow">
          The whole method in five cards
        </h2>
        <div className="mt-5">
          <SummaryCards />
        </div>
        <p className="mt-6 max-w-[40rem] text-[0.9375rem] leading-relaxed text-muted">
          Below is the long version, for the curious. The parameters and sources behind each step are in{" "}
          <a href={`${REPO}/MODEL.md`} className="link text-ink" rel="noopener noreferrer" target="_blank">
            MODEL.md
          </a>{" "}
          and{" "}
          <a href={`${REPO}/EVAL.md`} className="link text-ink" rel="noopener noreferrer" target="_blank">
            EVAL.md
          </a>{" "}
          in the repository.
        </p>
      </section>

      <div className="page grid grid-cols-[minmax(0,1fr)] gap-12 pb-24 pt-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-20">
        <nav aria-label="Chapters" className="lg:sticky lg:top-8 lg:self-start">
          <p className="eyebrow">In this page</p>
          <ol className="mt-4 space-y-1 border-l border-rule">
            {CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="-ml-px flex min-h-11 items-center gap-3 border-l border-transparent py-1 pl-4 text-[0.9375rem] text-ink-soft hover:border-ink hover:text-ink">
                  <span className="num font-mono text-[0.875rem] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  {c.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-[46rem] space-y-20 md:space-y-28">
          <Chapter id="idea" n="01" title={<>The idea: <em className="font-normal italic">mirrors lie about distance</em></>}>
            <p>
              You study your skin from about 25 cm, with the light on your side and all the time in the world. Everyone else meets your face from a metre or more, for a few seconds, mid-conversation. The question that matters is not &ldquo;what is on my skin?&rdquo; but &ldquo;what can anyone actually see, and from how far?&rdquo;
            </p>
            <p>
              Arm&rsquo;s Length answers with a distance for each concern. Pores, on one demo face: half of them are out of sight by {poreHalf} for a typical sharp-eyed person. Under-eye shading is a large, soft area, so it carries across a room on every face, and we say that instead of quoting a distance. No scores and no grades.
            </p>
          </Chapter>

          <Chapter id="iris" n="02" title={<>The iris as <em className="font-normal italic">a ruler</em></>}>
            <p>
              To say how far away something can be seen, we first need to know how big it is. A photo has no scale, but your eyes do: the visible part of the iris is about 11.7 mm across in adults (Rüfer and colleagues, 2005), and it varies by only around 4% from person to person. We find the iris in your photo, count its width in pixels, and that gives millimetres per pixel on your face.
            </p>
            {demo && (
              <div className="!max-w-none py-2">
                <IrisFigure
                  src={demo.persona.image}
                  alt="Close crop of a synthetic face's left eye with the iris outlined and measured across its width."
                  frame={demo.frame}
                  crop={{ x: 246, y: 500, w: 220, h: 160 }}
                  iris={{ cx: 356, cy: 592, r: (demo.measurements.scale.irisPx ?? 72) / 2 }}
                  stageGrey={demo.stageGrey}
                  label="Iris width ≈ 11.7 mm"
                />
              </div>
            )}
            <p>
              The 4% is carried through to the end. A feature&rsquo;s visibility distance grows in direct proportion to its size, so every distance comes with a plausible range: the thin whisker on each card. A bank card held to the forehead can tighten it.
            </p>
          </Chapter>

          <Chapter id="millimetres" n="03" title={<>From masks <em className="font-normal italic">to millimetres</em></>}>
            <p>
              YouCam returns a mask for each concern: where it found spots, lines or shadows. A mask says where, not how big or how visible. We turn each into measured features: blobs for spots, skeletons and widths for lines, extents for broad areas. Then we return to the photo, in linear light, and measure how different each feature is from the skin around it: brightness contrast, and red-green contrast for things like redness.
            </p>
            {demo && (
              <div className="!max-w-none border-y border-rule py-6">
                <MaskStripView strip={demo.maskStrip} />
              </div>
            )}
            {demo && spots.length > 0 && (
              <div className="!max-w-none py-2">
                <MeasureFigure
                  src={demo.persona.image}
                  alt="Close crop of a synthetic face's cheek with a few dark spots."
                  frame={demo.frame}
                  crop={{ x: 730, y: 590, w: 220, h: 220 }}
                  features={spots}
                  stageGrey={demo.stageGrey}
                  captions={["The photo.", "The marks found in the analysis.", "Each mark measured, scaled by the iris."]}
                />
              </div>
            )}
            <p>
              Size in millimetres and contrast: those are the two numbers vision science needs. Some masks carry location only. Pores arrive as fixed-size dots, so for those we assume a typical pore size and say so in the confidence line on the card.
            </p>
          </Chapter>

          <Chapter id="vision" n="04" title={<>How vision <em className="font-normal italic">fades detail</em> with distance</>}>
            <p>
              Human vision works like a filter. It is most sensitive to medium-sized detail and loses sensitivity to finer detail until, around 60 cycles per degree, nothing gets through. That curve is the contrast sensitivity function, and it is what eye charts sample. Stepping back shrinks every feature in your field of view and slides its detail toward the right-hand end of the curve. A feature stays visible while its contrast is above the threshold the curve sets.
            </p>
            <div className="!max-w-none py-2">
              <CsfChart />
            </div>
            <p>
              We apply this inside the photo itself. The image is split into octave bands (a Laplacian pyramid); we measure each band&rsquo;s local contrast around a feature (Peli, 1990) and compare it with the threshold at that distance. The largest distance where the feature still passes is the number on the card. The same computation redraws the photo for the Step back slider.
            </p>
          </Chapter>

          <Chapter id="observers" n="05" title={<>Two kinds of <em className="font-normal italic">eyes</em></>}>
            <p>
              We model two viewers. A <strong className="font-medium text-ink">typical sharp-eyed person</strong> has 20/20 vision, looks straight at the feature and has normal indoor light. That is who we speak for when a mark &ldquo;can be picked out&rdquo;. The second viewer is the same person made more sensitive, a pair of <strong className="font-medium text-ink">perfect eyes</strong>. Past the distance where even they fail, a mark is out of sight. Real people glance, look at your eyes and are distracted by skin texture, so they see less than either.
            </p>
            <blockquote className="serif !max-w-none border-l-2 border-ink py-1 pl-6 text-[clamp(1.5rem,1.1rem+1.6vw,2.4rem)] leading-[1.15] tracking-[-0.015em] text-ink" style={{ fontWeight: 340 }}>
              Past this distance, even perfect eyes looking right at it in normal indoor light can&rsquo;t pick it out.
            </blockquote>
            <div className="!max-w-none py-2" role="img" aria-label="Diagram: closer than the reported distance, a typical viewer sees this much or less. Past it, even perfect eyes can't pick the feature out.">
              <div className="flex text-[0.9375rem] leading-snug">
                <div
                  className="flex-[3] border border-ink p-4 text-ink-soft"
                  style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 7px, rgb(22 21 19 / 0.12) 7px 8px)" }}
                >
                  A real viewer sees this much, or less.
                </div>
                <div className="relative flex-[2] border border-l-0 border-dashed border-ink p-4 text-ink-soft">
                  <span className="absolute -left-px -top-5 bottom-0 w-px bg-ink" aria-hidden="true" />
                  <span className="absolute -top-9 -translate-x-1/2 whitespace-nowrap font-mono text-[0.875rem] uppercase tracking-[0.06em]" style={{ left: 0 }}>
                    The distance we report
                  </span>
                  Out of sight, even for perfect eyes.
                </div>
              </div>
            </div>
            <p>
              That is why we can lead with relief. The out-of-sight claim only ever errs on the side of showing too much, never too little.
            </p>
          </Chapter>

          <Chapter id="youcam" n="06" title={<>The <em className="font-normal italic">YouCam</em> APIs we use</>}>
            <p>
              YouCam finds the marks; the vision layer is ours. Everything runs on our server, so the key never reaches your browser, and the demo faces replay recorded responses with no live calls. Each row is a real endpoint we call, with what it costs in YouCam units (we were given a free allowance of 1,000).
            </p>
            <div className="!max-w-none overflow-x-auto" tabIndex={0} aria-label="YouCam APIs table, scrolls sideways on small screens">
              <table className="w-full min-w-[40rem] border-collapse text-left text-[0.9375rem] leading-relaxed">
                <caption className="sr-only">The YouCam APIs Arm&rsquo;s Length calls, what is sent, what is used from the answer, and the units each costs</caption>
                <thead>
                  <tr className="border-y border-ink text-[0.875rem]">
                    <th scope="col" className="py-3 pr-4 font-medium">YouCam API</th>
                    <th scope="col" className="py-3 pr-4 font-medium">What we send</th>
                    <th scope="col" className="py-3 pr-4 font-medium">What we use</th>
                    <th scope="col" className="py-3 font-medium">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {API_ROWS.map((r) => (
                    <tr key={r.api} className="border-b border-rule align-top">
                      <th scope="row" className="serif py-4 pr-4 text-[1.125rem] font-normal text-ink">{r.api}</th>
                      <td className="py-4 pr-4">{r.send}</td>
                      <td className="py-4 pr-4">{r.use}</td>
                      <td className="num py-4 text-ink">{r.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              A full live session (one analysis, one simulation and up to four try-on pictures) costs about 26 units; distances alone cost 16.
            </p>
            <p>
              <strong className="font-medium text-ink">Why not the JS Camera Kit?</strong> It frames and guides a live camera, but it does not give face landmarks, and we need the iris. MediaPipe gives the iris and the face geometry on your device, where capture guidance runs too, so the photo is checked before it leaves your browser. The Camera Kit would be a good addition for framing; it is not needed for the measurement.
            </p>
          </Chapter>

          <Chapter id="validation" n="07" title={<>Checked <em className="font-normal italic">against people</em></>}>
            <p>
              A model of vision is only worth using if it matches real eyes. ModelFest is a public data set from a group of vision laboratories: <strong className="font-medium text-ink">16 observers in ten labs</strong> were shown 43 test patterns, each faded until it was only just visible. The patterns include the shapes we care about: soft blobs (pores and small spots), a disc (a spot), a thin line (a fine line), an edge and broad soft patches.
            </p>
            <p className="serif num !max-w-none text-[clamp(2.25rem,1.6rem+2.4vw,3.5rem)] leading-[1.05] tracking-[-0.02em] text-ink" style={{ fontWeight: 340 }}>
              0.69 dB RMS error
              <span className="mt-2 block text-[1.0625rem] leading-snug tracking-normal text-ink-soft" style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif", fontWeight: 400 }}>
                over the 41 patterns we can generate. 0.78 dB over the 8 that look like skin features. Individual people differ from the average observer by 3.46 dB.
              </span>
            </p>
            <p>
              Nothing was tuned on this data: the model&rsquo;s constants are the published ones (Watson and Ahumada, 2005). Each dot below is one pattern, predicted against observed. Points on the diagonal are perfect.
            </p>
            <ChartFrame
              src="/charts/modelfest.svg"
              width={720}
              height={880}
              label="ModelFest chart, scrolls sideways on small screens"
              alt="Scatter chart of predicted against observed detection thresholds for 41 ModelFest test patterns. Points sit close to the diagonal: the root-mean-square error is 0.69 decibels over all patterns and 0.78 over the 8 skin-relevant shapes."
            />
            <p>
              What this does not show: ModelFest used calibrated test patterns on a display, not real skin, and nobody has run a human study of distances for real skin features. That is why the{" "}
              <Link href="/self-test" className="link text-ink">
                self-test
              </Link>{" "}
              exists. The full tables are in{" "}
              <a href={`${REPO}/EVAL.md`} className="link text-ink" rel="noopener noreferrer" target="_blank">
                EVAL.md
              </a>
              .
            </p>
          </Chapter>

          <Chapter id="ai" n="08" title={<>Why not just <em className="font-normal italic">ask an AI?</em></>}>
            <p className="serif !max-w-none text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] leading-[1.25] text-ink" style={{ fontWeight: 360 }}>
              Asked the same question five times, a frontier AI gave five answers, said &ldquo;no breakouts&rdquo; where YouCam found 18, 5 and 3, and broke the size-doubling law. It knows the recipe; it can&rsquo;t measure your face.
            </p>
            <p>
              We ran the comparison for real: 65 calls to a frontier vision model. It is better than we expected at the general physics. Told a spot&rsquo;s size and contrast, its typical answer landed about 1.3 times from our model&rsquo;s. What it cannot do is give a number you can build on.
            </p>
            <ul className="!max-w-none border-t border-ink">
              {[
                "Five identical asks about one patch differed by 16% to 36%, and the highest of the five was 1.4 to 2.1 times the lowest. Ours has no spread.",
                "Doubling a spot should double the distance. Its answers rose by 1.4 to 2.3 times instead.",
                "On the four demo faces it said “no breakouts” for three faces where YouCam located 18, 5 and 3. It gave the same pore distance, 0.8 m, on every face.",
                "It gives one number per concern: no count and no location. YouCam’s masks give both, which is what the Step back slider and the receipts are built on.",
              ].map((t) => (
                <li key={t} className="flex gap-4 border-b border-rule py-4 text-[1rem] leading-relaxed">
                  <span aria-hidden="true" className="mt-[0.7em] block h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <ChartFrame
              src="/charts/ai-comparison.svg"
              width={720}
              height={1248}
              label="AI comparison chart, scrolls sideways on small screens"
              alt="Two charts. First, for nine dark-spot patches, an AI's five answers each (dots) scatter widely, often outside our model's range (blue bar), while ours is a single range. Second, doubling a spot's size should double the distance; the AI's answers rise by 1.4 to 2.3 times instead of 2.0."
            />
            <p>
              Not shown: that the AI is wrong on real faces. There is no ground truth for those, and this test only measures consistency and sensitivity to the individual face. The method, prompts and every raw answer are in{" "}
              <a href="https://github.com/ethanrom/arms-length/tree/main/eval/llm-baseline" className="link text-ink" rel="noopener noreferrer" target="_blank">
                eval/llm-baseline
              </a>
              .
            </p>
          </Chapter>

          <Chapter id="limits" n="09" title={<><em className="font-normal italic">Limitations</em>, plainly</>}>
            <ul className="!max-w-none border-t border-ink">
              {LIMITS.map((l) => (
                <li key={l} className="flex gap-4 border-b border-rule py-4 text-[1rem] leading-relaxed">
                  <span aria-hidden="true" className="mt-[0.7em] block h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </Chapter>
        </div>
      </div>
    </main>
  );
}
