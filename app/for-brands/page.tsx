import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { SkuMapping } from "@/components/brands/SkuMapping";

export const metadata: Metadata = {
  title: "For brands",
  description: "A visibility layer for any YouCam Skin Analysis: send the result and the photo, get a distance for every concern back as JSON. Costs, latency and a real response.",
};

const STEPS = [
  { n: "01", title: "Send", body: "The YouCam Skin Analysis result you already have, plus the photo it came from." },
  { n: "02", title: "Measure", body: "We scale the face, measure every mark in millimetres and contrast, and run it through a model of human vision." },
  { n: "03", title: "Return", body: "A distance for each concern, with a plausible range and a confidence, ready for your own screens, kiosks and reports." },
];

const GETS = [
  "Per-concern distances in metres, with an interval.",
  "A confidence for each, with the reason in plain words.",
  "A typical-eye distance and a perfect-eye distance for each, so you can word each claim honestly.",
  "A rendered view of the photo at any distance, from the same model.",
];

const COSTS = [
  {
    session: "Distances only",
    calls: "One HD Skin Analysis.",
    units: "16",
    note: "12 on YouCam's standard engine, which drops the pore and breakout distances.",
  },
  {
    session: "Full session",
    calls: "The analysis, one Skin Simulation (seven concerns) and up to four makeup try-on pictures.",
    units: "about 26",
    note: "16 + 6 + up to 4. Deleting the session's photo and results afterwards is free.",
  },
  {
    session: "Drop-in on an analysis you already ran",
    calls: "None. The route reads the result you send and never calls YouCam.",
    units: "0 extra",
    note: "It sits on top of what you already pay for.",
  },
];

const ROADMAP = [
  {
    title: "Kiosk mode",
    body: "One result screen with large touch targets, a reset after idle time, brand theming and a fixed camera distance, so a calibration can stand in for the iris ruler.",
  },
  {
    title: "Video-call mode",
    body: "The same model at about 60 cm, for how a face reads on a call, next to the mirror and across-a-table views.",
  },
];

interface Example {
  request: { persona: string; bodyBytes: number };
  headers: Record<string, string | null>;
  response: { viewing: unknown; concerns: Record<string, unknown>[]; targets: Record<string, unknown>[]; targetsTotal: number };
}

interface Latency {
  runs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  bodyBytes: number;
  server: string;
}

function readJson<T>(file: string): T | null {
  const full = path.join(process.cwd(), "public", "brands", file);
  return fs.existsSync(full) ? (JSON.parse(fs.readFileSync(full, "utf8")) as T) : null;
}

/** The saved response, cut to a screenful: long arrays become a count, numbers keep two decimals. */
function excerpt(example: Example): string {
  const shown = example.response.concerns.filter((c) => c.concern === "pore" || c.concern === "acne").slice(0, 2);
  const short = (key: string, value: unknown) => {
    if (Array.isArray(value) && value.length > 3 && typeof value[0] === "object") return `[${value.length} entries]`;
    if (typeof value === "number") return Math.round(value * 100) / 100;
    return value;
  };
  const body = JSON.stringify({ viewing: example.response.viewing, concerns: shown, targets: example.response.targets.slice(0, 1) }, short, 2);
  return `200 OK   x-scale-source: ${example.headers["x-scale-source"]} (${example.headers["x-scale-method"]})\n${body.replace(/\n {2}"targets"/, `\n  /* 1 of ${example.response.targetsTotal} marks */\n  "targets"`)}`;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export default function ForBrandsPage() {
  const example = readJson<Example>("example-response.json");
  const latency = readJson<Latency>("latency.json");

  const request = `POST /api/visibility
{
  "output": [ /* YouCam task result, data.results.output */ ],
  "image": "data:image/jpeg;base64,...",
  "masks": { /* optional: the mask PNGs, inline */ },
  "viewing": { "luminanceCdM2": 45 }   /* optional */
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
            <Link href="/try/p1a" className="btn btn-primary">
              See it on a demo face <span className="arrow" aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/how-it-works" className="btn btn-ghost">
              Read the method
            </Link>
          </div>
        </div>
        <p className="max-w-sm border-l border-ink pl-5 text-[1rem] leading-relaxed text-ink-soft lg:justify-self-end">
          Below: a real response from the drop-in route on a recorded synthetic face, what a session costs in YouCam units, and how long the route takes.
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
                <span className="num font-mono text-[0.875rem] text-muted">{s.n}</span>
                <h3 className="title mt-3 text-[1.75rem]">{s.title}</h3>
                <p className="mt-3 max-w-sm text-[1rem] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="eyebrow mb-3">In</p>
              <pre className="overflow-x-auto border border-rule bg-paper-deep p-5 font-mono text-[0.875rem] leading-relaxed text-ink-soft" tabIndex={0} aria-label="Example request">
                <code>{request}</code>
              </pre>
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-3">Out (a real response, shortened)</p>
              <pre className="max-h-[34rem] overflow-auto border border-rule bg-paper-deep p-5 font-mono text-[0.875rem] leading-relaxed text-ink-soft" tabIndex={0} aria-label="Example response">
                <code>{example ? excerpt(example) : "The saved response is missing."}</code>
              </pre>
            </div>
          </div>
          <p className="mt-5 max-w-[44rem] text-[0.9375rem] leading-relaxed text-muted">
            Produced by running the drop-in route on the recorded analysis of a synthetic face, {example ? `${(example.request.bodyBytes / 1e6).toFixed(1)} MB` : "a few MB"} in. Numbers are rounded here.{" "}
            <a href="/brands/example-response.json" className="link text-ink">
              The saved response (JSON)
            </a>{" "}
            has every concern in full. Without a scale from you, the route estimates one from the masks, so confidence is stated as low; send your own iris or card scale to tighten it.
          </p>
        </div>
      </section>

      <section aria-labelledby="cost-title" className="rule-top bg-paper-deep">
        <div className="page py-16 md:py-24">
          <p className="eyebrow">What it costs</p>
          <h2 id="cost-title" className="display mt-4 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
            Cost per session, <em className="font-normal italic">in YouCam units</em>
          </h2>
          <div className="mt-10 overflow-x-auto" tabIndex={0} aria-label="Cost per session table, scrolls sideways on small screens">
            <table className="w-full min-w-[40rem] border-collapse text-left text-[1rem] leading-relaxed">
              <caption className="sr-only">YouCam units spent per kind of session</caption>
              <thead>
                <tr className="border-y border-ink text-[0.875rem]">
                  <th scope="col" className="py-3 pr-6 font-medium">Session</th>
                  <th scope="col" className="py-3 pr-6 font-medium">YouCam calls</th>
                  <th scope="col" className="py-3 pr-6 font-medium">Units</th>
                  <th scope="col" className="py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {COSTS.map((c) => (
                  <tr key={c.session} className="border-b border-rule align-top">
                    <th scope="row" className="serif py-4 pr-6 text-[1.25rem] font-normal">{c.session}</th>
                    <td className="py-4 pr-6 text-ink-soft">{c.calls}</td>
                    <td className="num py-4 pr-6 font-mono text-[1.0625rem] text-ink">{c.units}</td>
                    <td className="py-4 text-[0.9375rem] text-ink-soft">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-12 grid gap-8 border-t border-ink pt-8 md:grid-cols-2">
            <div>
              <h3 className="title text-[1.5rem]">How long the route takes</h3>
              <p className="mt-3 max-w-[30rem] text-[1rem] leading-relaxed text-ink-soft">
                {latency ? (
                  <>
                    <span className="serif num text-[2.25rem] text-ink" style={{ fontWeight: 360 }}>
                      {seconds(latency.medianMs)}
                    </span>{" "}
                    median over {latency.runs} requests (fastest {seconds(latency.minMs)}, slowest {seconds(latency.maxMs)}), with a {(latency.bodyBytes / 1e6).toFixed(1)} MB body that carries the masks inline.
                    Measured on a developer machine, against {latency.server}. The route calls no YouCam endpoint, so this is our computation alone.
                  </>
                ) : (
                  "Not measured on this build."
                )}
              </p>
            </div>
            <div>
              <h3 className="title text-[1.5rem]">How long YouCam takes</h3>
              <p className="mt-3 max-w-[30rem] text-[1rem] leading-relaxed text-ink-soft">
                In our first runs an HD analysis had finished within about 7 seconds of the request and a makeup try-on picture within about 8. These are upper bounds from the first poll, not averages; the polling is free.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="noticed-title" className="rule-top">
        <div className="page grid gap-12 py-16 md:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
          <div>
            <p className="eyebrow">Where it earns its place</p>
            <h2 id="noticed-title" className="display mt-4 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
              Where a change would <em className="font-normal italic">actually be noticed</em>
            </h2>
            <p className="lede mt-5 max-w-[30rem]">
              &ldquo;Worth it?&rdquo; compares the photo with a YouCam Skin Simulation of the same face at half strength, and says how far away a typical person could tell the difference. It is a map of where a change shows, never a verdict on what to buy.
            </p>
            <ul className="mt-8 border-t border-ink">
              {GETS.map((g) => (
                <li key={g} className="flex gap-4 border-b border-rule py-3.5 text-[1rem] leading-relaxed text-ink-soft">
                  <span aria-hidden="true" className="mt-[0.65em] block h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
          <SkuMapping />
        </div>
      </section>

      <section aria-labelledby="road-title" className="rule-top bg-paper-deep">
        <div className="page py-16 md:py-24">
          <p className="eyebrow">Next</p>
          <h2 id="road-title" className="display mt-4 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
            On the <em className="font-normal italic">roadmap</em>
          </h2>
          <p className="mt-4 max-w-[34rem] text-[1rem] leading-relaxed text-muted">Planned, not built yet.</p>
          <ul className="mt-8 grid gap-8 md:grid-cols-2 md:gap-10">
            {ROADMAP.map((r) => (
              <li key={r.title} className="border-t border-ink pt-5">
                <h3 className="title text-[1.75rem]">{r.title}</h3>
                <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-ink-soft">{r.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
