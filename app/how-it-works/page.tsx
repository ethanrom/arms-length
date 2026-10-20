import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CsfChart } from "@/components/how/CsfChart";
import { IrisFigure } from "@/components/how/IrisFigure";
import { MeasureFigure } from "@/components/how/MeasureFigure";
import { MaskStripView } from "@/components/results/MaskStripView";
import { loadDemoResults } from "@/lib/integration/demo";
import { formatDistance } from "@/lib/copy";

function ChartPlaceholder() {
  return (
    <figure>
      <div
        role="img"
        aria-label="Placeholder for a chart comparing Arm’s Length distances with a vision-language model’s answers across repeated runs"
        className="relative aspect-[16/9] border border-dashed border-rule-strong bg-paper-deep/50"
      >
        <div aria-hidden="true" className="absolute inset-x-12 inset-y-8">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="absolute inset-x-0 h-px bg-rule" style={{ top: `${i * 33.3}%` }} />
          ))}
          <span className="absolute inset-y-0 left-0 w-px bg-ink/50" />
        </div>
        <span aria-hidden="true" className="absolute left-3 top-1/2 origin-left -translate-y-1/2 -rotate-90 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">Distance given (m)</span>
        <span aria-hidden="true" className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">Repeated runs, same photo</span>
        <p className="absolute inset-0 grid place-items-center px-6 text-center">
          <span className="serif text-[1.5rem] leading-snug text-ink-soft" style={{ fontWeight: 380 }}>
            Chart pending: our distances against a vision model&rsquo;s answers, run after run.
          </span>
        </p>
      </div>
      <figcaption className="mt-3 max-w-[40rem] text-[0.8125rem] leading-relaxed text-muted">
        Placeholder. The comparison is run on the demo faces and will be plotted here.
      </figcaption>
    </figure>
  );
}

export const metadata: Metadata = {
  title: "How it works",
  description: "How Arm's Length turns a skin analysis into distances: the iris as a ruler, masks to millimetres, and the science of contrast sensitivity.",
};

const CHAPTERS = [
  { id: "idea", title: "The idea" },
  { id: "iris", title: "The iris as a ruler" },
  { id: "millimetres", title: "From masks to millimetres" },
  { id: "vision", title: "How vision fades detail" },
  { id: "promise", title: "The one-sided promise" },
  { id: "youcam", title: "What YouCam APIs we use" },
  { id: "ai", title: "Why not just ask an AI?" },
  { id: "limits", title: "Limitations" },
];

const APIS = [
  {
    name: "HD Skin Analysis",
    use: "Masks for eight concerns: acne, age spots, pores, wrinkles, dark circles, eye bags, redness and texture. This is the raw material for every distance.",
  },
  {
    name: "Makeup try-on",
    use: "Renders of foundation and concealer on the same photo, to check that a given coverage really brings a concern inside a chosen distance.",
  },
  {
    name: "Skin Simulation",
    use: "Renders with a concern reduced, for the “what if” comparison. It shows what would change what others see, nothing more.",
  },
  {
    name: "Camera Kit",
    use: "Live capture guidance for framing and light, where it fits. Planned; uploads work without it.",
  },
];

const LIMITS = [
  "The distance is a bound for an ideal observer, not a forecast of what one person will notice.",
  "An unretouched photo matters. Beauty filters and heavy smoothing lower the measured contrast, which can make a feature look less visible than it is.",
  "The scale rests on the iris, about 4% either way, unless you calibrate with a bank card.",
  "Light changes what shows. We assume indoor face brightness; strong sun and raking light reveal more.",
  "A photo and a screen are not your face. They render contrast by their own rules.",
  "The demo faces are synthetic (AI-generated). Their analyses are recorded replays.",
  "Arm's Length is about visibility, not health: it says nothing about how your skin is doing and gives no advice.",
];

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

export default function HowItWorksPage() {
  // The figures reuse a demo face and its measured spots.
  const demo = loadDemoResults("p2b");
  const half = (concern: string) => demo?.report.concerns.find((c) => c.concern === concern)?.medianDistanceM;
  const spots = demo?.measurements.features.filter((f) => f.concern === "age_spot" && f.centroid.x > 700) ?? [];

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-8 pt-10 md:pt-16">
        <p className="eyebrow">How it works</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          From a skin analysis to <em className="font-normal italic">a distance</em>
        </h1>
        <p className="lede mt-6 max-w-[38rem]">
          The method in plain words. Every number you see is computed from the photo and the analysis; no language model writes it, and no score is invented.
        </p>
        <p className="mt-3 max-w-[38rem] text-[0.8125rem] leading-relaxed text-muted">
          Plain-language draft. The parameters and sources behind each step are listed in the model document in the repository.
        </p>
      </div>

      <div className="page grid gap-12 pb-24 pt-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-20">
        <nav aria-label="Chapters" className="lg:sticky lg:top-8 lg:self-start">
          <p className="eyebrow">In this page</p>
          <ol className="mt-4 space-y-1 border-l border-rule">
            {CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="-ml-px flex min-h-9 items-center gap-3 border-l border-transparent py-1 pl-4 text-[0.9375rem] text-ink-soft hover:border-ink hover:text-ink">
                  <span className="num font-mono text-[0.6875rem] text-muted">{String(i + 1).padStart(2, "0")}</span>
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
              Arm&rsquo;s Length answers with a distance for each concern. Pores, on one demo face: half of them gone by {half("pore") ? formatDistance(half("pore")!) : "about a metre and a half"}. Under-eye shadows: still there from across a room. No scores and no grades, just the farthest distance at which a person with perfect eyesight could still pick the thing out.
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

          <Chapter id="promise" n="05" title={<>The <em className="font-normal italic">one-sided</em> promise</>}>
            <p>
              We model an ideal observer: 20/20 vision, looking straight at the feature, nothing else competing for attention. Real people are worse than that. They glance, they look at your eyes, and skin has texture that hides marks. So the number is a bound, not a forecast.
            </p>
            <blockquote className="serif !max-w-none border-l-2 border-ink py-1 pl-6 text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.12] tracking-[-0.015em] text-ink" style={{ fontWeight: 340 }}>
              Beyond this distance, it is invisible even to perfect eyes.
            </blockquote>
            <div className="!max-w-none py-2" role="img" aria-label="Diagram: closer than the reported distance, a real viewer sees this much or less. Beyond it, nobody sees it, even with perfect eyes.">
              <div className="flex text-[0.8125rem] leading-snug">
                <div
                  className="flex-[3] border border-ink p-4 text-ink-soft"
                  style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 7px, rgb(22 21 19 / 0.12) 7px 8px)" }}
                >
                  A real viewer sees this much, or less.
                </div>
                <div className="relative flex-[2] border border-l-0 border-dashed border-ink p-4 text-ink-soft">
                  <span className="absolute -left-px -top-5 bottom-0 w-px bg-ink" aria-hidden="true" />
                  <span className="absolute -top-8 -translate-x-1/2 whitespace-nowrap font-mono text-[0.6875rem] uppercase tracking-[0.1em]" style={{ left: 0 }}>
                    The distance we report
                  </span>
                  Nobody does. Not even with perfect eyes.
                </div>
              </div>
            </div>
            <p>
              That is why we can lead with relief. The claim only ever errs on the side of showing too much, never too little.
            </p>
          </Chapter>

          <Chapter id="youcam" n="06" title={<>What <em className="font-normal italic">YouCam</em> APIs we use</>}>
            <p>Skin analysis is the raw material; the vision layer is ours. Everything runs on our server, so the key never reaches your browser. Demo faces replay recorded responses and make no live calls.</p>
            <dl className="!max-w-none border-t border-ink">
              {APIS.map((a) => (
                <div key={a.name} className="grid gap-1 border-b border-rule py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8">
                  <dt className="serif text-[1.25rem] leading-snug text-ink" style={{ fontWeight: 400 }}>
                    {a.name}
                  </dt>
                  <dd className="text-[0.9375rem] leading-relaxed text-ink-soft">{a.use}</dd>
                </div>
              ))}
            </dl>
          </Chapter>

          <Chapter id="ai" n="07" title={<>Why not just <em className="font-normal italic">ask an AI?</em></>}>
            <p>
              A general-purpose vision model can describe a face, but it cannot measure one. It has no scale, so it cannot know a spot is 2.9 mm wide. It has no contrast measurement and no model of the eye, so its answer to &ldquo;how far away would this be visible?&rdquo; is a plausible-sounding guess. Ask it twice and you may get two answers.
            </p>
            <p>
              Ours are computed. The same photo and the same analysis give the same distance every time, and each one comes with the working shown on its card.
            </p>
            <div className="!max-w-none py-2">
              <ChartPlaceholder />
            </div>
          </Chapter>

          <Chapter id="limits" n="08" title={<><em className="font-normal italic">Limitations</em>, plainly</>}>
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
