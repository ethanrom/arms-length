import Link from "next/link";
import { LivingFace } from "@/components/landing/LivingFace";
import { TAPE_ANCHORS, keyDistanceOf, keyLine, titleOf } from "@/lib/integration/copy";
import { loadBundle } from "@/lib/integration/demo";
import { toneOf } from "@/lib/copy";

/** Row sizes, biggest first: the chart gets smaller the way an eye chart does, as the distance shrinks. */
const CHART_SIZES = [
  "clamp(2.4rem, 1.2rem + 5.4vw, 5.25rem)",
  "clamp(1.9rem, 1rem + 3.6vw, 3.75rem)",
  "clamp(1.5rem, 0.9rem + 2.4vw, 2.6rem)",
  "clamp(1.25rem, 0.8rem + 1.6vw, 1.85rem)",
];

/** A real reading (Synthetic face A): four concerns, the farthest-carrying first. */
function chartRows() {
  const bundle = loadBundle("p2b");
  if (!bundle) return [];
  return [...bundle.report.concerns]
    .sort((a, b) => keyDistanceOf(b) - keyDistanceOf(a))
    .slice(0, CHART_SIZES.length)
    .map((cv, i) => ({ size: CHART_SIZES[i], label: titleOf(cv.concern), value: keyLine(cv, toneOf(cv)) }));
}

const PRINCIPLES = [
  {
    n: "01",
    title: "Relief first",
    body: "Most of what you scrutinise in the mirror is invisible a step away. We lead with that, because it is true and because it is kind.",
  },
  {
    n: "02",
    title: "Distances, not scores",
    body: "No grade, no number out of a hundred. Each concern gets the farthest distance at which a person could still see it.",
  },
  {
    n: "03",
    title: "A promise we can keep",
    body: "Beyond that distance it is invisible even to perfect eyes. Real viewers only see less, so the bound never over-claims.",
  },
];

export default function Home() {
  const chart = chartRows();
  const face = loadBundle("p2b");
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <section className="page grid gap-12 pb-16 pt-10 md:pt-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-14 lg:pb-24 lg:pt-14">
        <div>
          <p className="eyebrow rise flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-8 bg-ink/40" />
            Skin analysis, seen from the other side
          </p>
          <h1 className="display rise mt-6 text-[clamp(2.5rem,1rem+4.3vw,4.9rem)]" style={{ animationDelay: "80ms" }}>
            You see your skin from <span className="num">25&nbsp;cm</span>. <em className="font-normal italic">Everyone else</em> sees it from a metre.
          </h1>
          <p className="lede rise mt-7 max-w-[34rem]" style={{ animationDelay: "180ms" }}>
            Arm&rsquo;s Length uses YouCam skin analysis and the science of human vision to show what others can actually see, and from how far.
          </p>
          <p className="serif rise mt-6 max-w-[34rem] text-[clamp(1.25rem,1rem+0.8vw,1.625rem)] italic leading-snug" style={{ animationDelay: "230ms", fontWeight: 380 }}>
            YouCam&rsquo;s AI finds it. Vision science measures it.
          </p>
          <div className="rise mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "280ms" }}>
            <Link href="/try/p2b" className="btn btn-primary">
              Try a demo face <span className="arrow" aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/try#camera" className="btn btn-ghost">
              Check mine
            </Link>
          </div>
          <p className="rise mt-5 text-[0.8125rem] text-muted" style={{ animationDelay: "340ms" }}>
            Demo faces are synthetic (AI-generated). Nobody real is shown.
          </p>
        </div>

        <div className="rise" style={{ animationDelay: "200ms" }}>
          <LivingFace
            src={face?.image ?? "/demo/p2b/photo.jpg"}
            alt="Synthetic portrait of a man with deep brown skin, shown blurring as the viewing distance grows."
            frame={face?.frame ?? { width: 1080, height: 1341 }}
            anchors={TAPE_ANCHORS}
            scale={face?.scale}
            viewing={face?.viewing}
          />
        </div>
      </section>

      <section aria-labelledby="chart-title" className="rule-top">
        <div className="page grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
          <div>
            <p className="eyebrow flex items-center gap-3">
              <span className="num text-ink">01</span>
              <span aria-hidden="true" className="h-px w-8 bg-ink/40" />
              What it tells you
            </p>
            <h2 id="chart-title" className="display mt-4 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
              A chart read from <em className="font-normal italic">far away</em>
            </h2>
            <p className="lede mt-5 max-w-sm">
              Eye charts measure the smallest detail you can still make out. We turn that around: for each concern on your face, how far back can someone stand before it is gone?
            </p>
            <p className="mt-5 text-[0.8125rem] text-muted">A real reading of a synthetic face. Yours comes from your own photo.</p>
          </div>

          <div aria-label="Example reading" role="group" className="border-t border-ink">
            {chart.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-6 border-b border-rule py-4 md:py-5">
                <span className="serif leading-none tracking-[-0.02em]" style={{ fontSize: row.size, fontWeight: 360 }}>
                  {row.label}
                </span>
                <span className="num whitespace-nowrap text-right font-mono text-[0.75rem] uppercase tracking-[0.08em] text-muted">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="principles-title" className="rule-top bg-paper-deep">
        <div className="page py-16 md:py-24">
          <h2 id="principles-title" className="eyebrow">
            How we think about it
          </h2>
          <ol className="mt-8 grid gap-10 md:grid-cols-3 md:gap-12">
            {PRINCIPLES.map((p) => (
              <li key={p.n} className="border-t border-ink pt-5">
                <span className="num font-mono text-[0.75rem] text-muted">{p.n}</span>
                <h3 className="title mt-3 text-[1.75rem]">{p.title}</h3>
                <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-ink-soft">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="test-title" className="rule-top">
        <div className="page grid gap-8 py-16 md:py-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow flex items-center gap-3">
              <span className="num text-ink">02</span>
              <span aria-hidden="true" className="h-px w-8 bg-ink/40" />
              Self-test
            </p>
            <h2 id="test-title" className="display mt-4 text-[clamp(2.25rem,1.2rem+3.8vw,4.75rem)]">
              Don&rsquo;t trust us. <em className="font-normal italic">Test it</em> with your own eyes.
            </h2>
          </div>
          <div>
            <p className="lede max-w-[28rem]">Hold a bank card to your screen, walk back until a spot disappears, and see whether your eyes agree with our prediction.</p>
            <Link href="/self-test" className="btn btn-primary mt-7">
              Walk back and see <span className="arrow" aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="cta-title" className="on-dark bg-ink text-paper">
        <div className="page flex flex-col items-start gap-8 py-16 md:flex-row md:items-end md:justify-between md:py-24">
          <h2 id="cta-title" className="display max-w-2xl text-[clamp(2.25rem,1.2rem+3.6vw,4.5rem)]">
            Step back and <em className="font-normal italic">see.</em>
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/try/p2b" className="btn border-paper bg-paper text-ink hover:bg-white">
              Try a demo face <span className="arrow" aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/how-it-works" className="btn border-paper/60 text-paper hover:bg-paper/10">
              How it works
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
