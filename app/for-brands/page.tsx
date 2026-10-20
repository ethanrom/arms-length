import type { Metadata } from "next";
import Link from "next/link";
import { KioskMock } from "@/components/brands/KioskMock";
import { loadDemoResults } from "@/lib/integration/demo";

export const metadata: Metadata = {
  title: "For brands",
  description: "A visibility layer for any YouCam Skin Analysis: send the result and the photo, get a distance for every concern back as JSON.",
};

const STEPS = [
  { n: "01", title: "Send", body: "The YouCam Skin Analysis result you already have, plus the photo it came from." },
  { n: "02", title: "Measure", body: "We scale the face with the iris, measure every mark in millimetres and contrast, and run it through a model of human vision." },
  { n: "03", title: "Return", body: "A distance for each concern, with a plausible range and a confidence, ready for your own screens, kiosks and reports." },
];

const GETS = [
  "Per-concern distances in metres, with an interval.",
  "A confidence for each, with the reason in plain words.",
  "The worked chain for any number: mask, millimetres, contrast, visual angle, threshold.",
  "A rendered view of the photo at any distance, from the same model.",
];

export default function ForBrandsPage() {
  const demo = loadDemoResults("p2b");
  const concerns = (demo?.report.concerns ?? []).slice(-2).map((c) => ({
    concern: c.concern,
    targetCount: c.targetCount,
    maxDistanceM: c.maxDistanceM,
    medianDistanceM: c.medianDistanceM,
    intervalM: c.intervalM,
    confidence: c.confidence,
  }));

  const request = `POST /api/visibility
{
  "output": [ /* YouCam task result, data.results.output */ ],
  "image": "data:image/jpeg;base64,...",
  "viewing": { "luminanceCdM2": 100 }
}`;

  const response = `200 OK
{
  "viewing": { "luminanceCdM2": 100, "acuityScale": 1, "label": "indoor" },
  "concerns": ${JSON.stringify(concerns, null, 2).replace(/\n/g, "\n  ")},
  "targets": [ /* one entry per mark, with its own distance */ ]
}`;

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page grid gap-12 pb-16 pt-10 md:pt-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16 lg:pb-24">
        <div>
          <p className="eyebrow">For brands</p>
          <h1 className="display mt-4 text-[clamp(2.6rem,1.2rem+5vw,5.5rem)]">
            A visibility layer for <em className="font-normal italic">any</em> YouCam Skin Analysis
          </h1>
          <p className="lede mt-6 max-w-[36rem]">
            Skin analysis tells a customer what is on their skin. This tells them what other people can see, and from how far. It sits on top of the analysis you already run.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/try/p2b" className="btn btn-primary">
              See it on a demo face <span className="arrow" aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/how-it-works" className="btn btn-ghost">
              Read the method
            </Link>
          </div>
        </div>
        <p className="max-w-sm border-l border-ink pl-5 text-[0.9375rem] leading-relaxed text-ink-soft lg:justify-self-end">
          The endpoint shape follows the drop-in contract. The numbers below were measured on a recorded synthetic face.
        </p>
      </div>

      <section aria-labelledby="plug-title" className="rule-top">
        <div className="page py-16 md:py-24">
          <p className="eyebrow">How it plugs in</p>
          <h2 id="plug-title" className="display mt-4 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
            Send the analysis. <em className="font-normal italic">Get distances back.</em>
          </h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {STEPS.map((s) => (
              <li key={s.n} className="border-t border-ink pt-5">
                <span className="num font-mono text-[0.75rem] text-muted">{s.n}</span>
                <h3 className="title mt-3 text-[1.75rem]">{s.title}</h3>
                <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="eyebrow mb-3">In</p>
              <pre className="overflow-x-auto border border-rule bg-paper-deep p-5 font-mono text-[0.8125rem] leading-relaxed text-ink-soft" tabIndex={0} aria-label="Example request">
                <code>{request}</code>
              </pre>
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-3">Out</p>
              <pre className="overflow-x-auto border border-rule bg-paper-deep p-5 font-mono text-[0.8125rem] leading-relaxed text-ink-soft" tabIndex={0} aria-label="Example response">
                <code>{response}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="kiosk-title" className="rule-top bg-paper-deep">
        <div className="page grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-20">
          <div>
            <p className="eyebrow">In the aisle</p>
            <h2 id="kiosk-title" className="display mt-4 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
              Your screen, <em className="font-normal italic">your skin</em>
            </h2>
            <p className="lede mt-5 max-w-[30rem]">
              Put the layer into a kiosk, an app or a consultation tool and let the customer step back from their own face.
            </p>
            <ul className="mt-8 border-t border-ink">
              {GETS.map((g) => (
                <li key={g} className="flex gap-4 border-b border-rule py-3.5 text-[0.9375rem] leading-relaxed text-ink-soft">
                  <span aria-hidden="true" className="mt-[0.65em] block h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
          {demo && <KioskMock data={demo} />}
        </div>
      </section>
    </main>
  );
}
