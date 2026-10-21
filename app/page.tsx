import Link from "next/link";
import { LivingFace } from "@/components/landing/LivingFace";
import { TAPE_ANCHORS, keyDistanceOf, keyLine, titleOf } from "@/lib/integration/copy";
import { loadBundle } from "@/lib/integration/demo";
import { isSoftArea, toneOf } from "@/lib/copy";

/** The default face: the demo with the most relief, so the first thing anyone sees is kind (expert panel, 2026-10-21). */
const HERO_FACE = "p1a";

/** Row sizes, biggest first: the chart gets smaller the way an eye chart does, as the distance shrinks. */
const CHART_SIZES = [
  "clamp(2.4rem, 1.2rem + 5.4vw, 5.25rem)",
  "clamp(1.9rem, 1rem + 3.6vw, 3.75rem)",
  "clamp(1.5rem, 0.9rem + 2.4vw, 2.6rem)",
  "clamp(1.25rem, 0.8rem + 1.6vw, 1.85rem)",
];

/**
 * A real reading of the hero face: the four concerns with a distance, the farthest-carrying first. Large soft areas are
 * left out of the chart (they carry on every face and state no distance) and named in a note beneath it.
 */
function chartReading() {
  const bundle = loadBundle(HERO_FACE);
  if (!bundle) return { rows: [], softNote: "" };
  const concerns = bundle.report.concerns;
  const rows = concerns
    .filter((cv) => !isSoftArea(cv))
    .sort((a, b) => keyDistanceOf(b) - keyDistanceOf(a))
    .slice(0, CHART_SIZES.length)
    .map((cv, i) => ({ size: CHART_SIZES[i], label: titleOf(cv.concern), value: keyLine(cv, toneOf(cv)) }));
  const soft = concerns.filter(isSoftArea).map((cv) => titleOf(cv.concern).toLowerCase());
  const softNote =
    soft.length > 0
      ? `${soft.join(" and ").replace(/^./, (c) => c.toUpperCase())} are large, soft areas: they carry across a room on every face, so we state no distance for them.`
      : "";
  return { rows, softNote };
}

const PRINCIPLES = [
  {
    n: "01",
    title: "Relief first",
    body: "Most of what you scrutinise in the mirror is out of sight a step or two away. We lead with that, because it is true.",
  },
  {
    n: "02",
    title: "Distances, not scores",
    body: "No grade and no number out of a hundred. Each concern gets the distance at which a person could still pick it out.",
  },
  {
    n: "03",
    title: "Out of sight means out of sight",
    body: "When we say a mark is gone past a distance, we mean even perfect eyes, looking right at it in normal indoor light. Real viewers glance, so they see less.",
  },
];

export default function Home() {
  const { rows: chart, softNote } = chartReading();
  const face = loadBundle(HERO_FACE);
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      {/* Phone order (also the reading order): headline, buttons, then the face with its tape, all on the first screen. */}
      <section className="page grid gap-x-14 gap-y-5 pb-12 pt-5 md:pt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[1fr_auto_auto_auto_auto_1fr] lg:gap-y-0 lg:pb-20 lg:pt-12">
        <div className="lg:col-start-1 lg:row-start-2">
          <p className="eyebrow rise hidden items-center gap-3 sm:flex">
            <span aria-hidden="true" className="h-px w-8 bg-ink/40" />
            Your skin, seen from where other people stand
          </p>
          <h1 className="display rise mt-0 text-[clamp(1.95rem,1rem+4.3vw,4.9rem)] sm:mt-6" style={{ animationDelay: "80ms" }}>
            You see your skin from <span className="num">25&nbsp;cm</span>. <em className="font-normal italic">Everyone else</em> sees it from a metre.
          </h1>
        </div>

        <div className="rise flex flex-wrap gap-3 lg:col-start-1 lg:row-start-4 lg:mt-8" style={{ animationDelay: "180ms" }}>
          <Link href="/try/p1a" className="btn btn-primary">
            Try a demo face <span className="arrow" aria-hidden="true">&rarr;</span>
          </Link>
          <Link href="/try#camera" className="btn btn-ghost">
            Use my photo
          </Link>
        </div>

        <div className="rise lg:col-start-2 lg:row-span-6 lg:row-start-1" style={{ animationDelay: "200ms" }}>
          <LivingFace
            src={face?.image ?? `/demo/${HERO_FACE}/photo.jpg`}
            alt={face?.alt ?? "Synthetic portrait of a woman with light olive skin, shown blurring as the viewing distance grows."}
            frame={face?.frame ?? { width: 1080, height: 1610 }}
            anchors={TAPE_ANCHORS}
            scale={face?.scale}
            viewing={face?.viewing}
          />
        </div>

        <p className="lede rise max-w-[34rem] lg:col-start-1 lg:row-start-3 lg:mt-7" style={{ animationDelay: "240ms" }}>
          Arm&rsquo;s Length shows what others can actually see of your skin, and from how far. Drag the tape and watch your mirror distance turn into theirs.
        </p>

        <p className="rise max-w-[34rem] text-[0.875rem] leading-relaxed text-muted lg:col-start-1 lg:row-start-5 lg:mt-5" style={{ animationDelay: "300ms" }}>
          Demo faces are synthetic (AI-generated). Your own photo is for ages 18 and over, and we ask YouCam to delete it when you leave.{" "}
          <Link href="/privacy" className="link text-ink">
            How we handle photos
          </Link>
        </p>
      </section>

      <section aria-label="Built on YouCam" className="rule-top bg-paper-deep">
        <div className="page flex flex-col gap-1 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <p className="text-[1rem] leading-snug text-ink">Built on YouCam HD Skin Analysis, Skin Simulation and Makeup VTO.</p>
          <Link href="/how-it-works#youcam" className="link inline-flex min-h-11 items-center text-[0.9375rem]">
            See what each one does
          </Link>
        </div>
      </section>

      <section aria-labelledby="chart-title" className="rule-top">
        <div className="page grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
          <div>
            <p className="eyebrow">What it tells you</p>
            <h2 id="chart-title" className="display mt-4 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
              A chart read from <em className="font-normal italic">far away</em>
            </h2>
            <p className="lede mt-5 max-w-sm">
              Eye charts measure the smallest detail you can still make out. We turn that around: for each concern on your face, how far back can someone stand before it is gone?
            </p>
            <p className="mt-5 max-w-sm text-[0.875rem] leading-relaxed text-muted">
              A recorded reading of a synthetic (AI-generated) face. Yours comes from your own photo. {softNote}
            </p>
          </div>

          <div aria-label="Example reading" role="group" className="border-t border-ink">
            {chart.map((row) => (
              <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-4 md:py-5">
                <span className="serif leading-none tracking-[-0.02em]" style={{ fontSize: row.size, fontWeight: 360 }}>
                  {row.label}
                </span>
                <span className="num text-right font-mono text-[0.875rem] uppercase tracking-[0.06em] text-muted">{row.value}</span>
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
                <span className="num font-mono text-[0.875rem] text-muted">{p.n}</span>
                <h3 className="title mt-3 text-[1.75rem]">{p.title}</h3>
                <p className="mt-3 max-w-sm text-[1rem] leading-relaxed text-ink-soft">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="test-title" className="rule-top">
        <div className="page grid gap-8 py-16 md:py-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">Self-test</p>
            <h2 id="test-title" className="display mt-4 text-[clamp(2.25rem,1.2rem+3.8vw,4.75rem)]">
              A prediction you can <em className="font-normal italic">test</em>
            </h2>
          </div>
          <div>
            <p className="lede max-w-[28rem]">
              Hold a bank card to your screen, walk back until a spot disappears, and see whether your eyes agree with ours. Rather not walk? Stay seated and ask a friend to carry the screen away.
            </p>
            <Link href="/self-test" className="btn btn-primary mt-7">
              Check it with your own eyes <span className="arrow" aria-hidden="true">&rarr;</span>
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
            <Link href="/try/p1a" className="btn border-paper bg-paper text-ink hover:bg-white">
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
