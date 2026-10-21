import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { DISCLAIMERS, MARK_SAFETY_LINE } from "@/lib/copy/disclaimers";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What happens to a photo you add: where it goes, what YouCam deletes, what we keep (nothing), and who it is for.",
};

const SHORT = [
  { head: "Demo faces upload nothing.", body: "They are synthetic (AI-generated) and their analyses were recorded in advance." },
  { head: "Your own photo goes to YouCam.", body: "Through our server, to be analysed by Perfect Corp's YouCam service." },
  { head: "We ask YouCam to delete it when you leave.", body: "The analysis and try-on pictures are deleted. One picture may stay up to 24 hours." },
  { head: "We don't store your photo.", body: "Not the photo, not the results, and there are no accounts." },
  { head: "Your own photo is for ages 18 and over.", body: "The demo faces are for everyone." },
];

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t border-ink pt-6 md:pt-8">
      <h2 id={`${id}-h`} className="display text-[clamp(1.75rem,1.2rem+2vw,2.75rem)]">
        {title}
      </h2>
      <div className="prose-body mt-5 space-y-4 text-[1.0625rem] leading-[1.7] text-ink-soft">{children}</div>
    </section>
  );
}

const STEPS = [
  "You confirm you are 18 or over and pick a photo, or take one.",
  "Your browser finds the iris, which is the ruler for the millimetres. That runs on your device.",
  "The photo goes to our server, which passes it on to YouCam HD Skin Analysis. If you open “Worth it?” or “The lightest touch”, the same photo goes to YouCam Skin Simulation and Makeup VTO, as try-on pictures.",
  "The pictures come back to your browser, and the sums that turn them into distances run there too.",
  "When you leave the page, your browser asks our server to ask YouCam to delete the photo and its results.",
];

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden="true" className="mt-[0.75em] block h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
      <span>{children}</span>
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-8 pt-10 md:pt-16">
        <p className="eyebrow">Privacy</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          Your photo, <em className="font-normal italic">in plain words</em>
        </h1>
        <p className="lede mt-6 max-w-[38rem]">What happens when you add a photo, what is deleted and when, and what we keep. It is short because there is little to keep.</p>
      </div>

      <div className="page pb-24 pt-4">
        <div className="max-w-[46rem] space-y-16 md:space-y-20">
          <section aria-labelledby="short-h">
            <h2 id="short-h" className="eyebrow">
              The short version
            </h2>
            <ul className="mt-4 border-t border-ink">
              {SHORT.map((s) => (
                <li key={s.head} className="border-b border-rule py-4 text-[1.0625rem] leading-relaxed">
                  <strong className="font-medium text-ink">{s.head}</strong> <span className="text-ink-soft">{s.body}</span>
                </li>
              ))}
            </ul>
          </section>

          <Block id="demo" title="The demo faces">
            <p>
              The four faces on the{" "}
              <Link href="/try" className="link text-ink">
                try page
              </Link>{" "}
              are AI-generated, so no real person&rsquo;s skin is shown. Opening one uploads nothing and calls no service: the analysis, the pictures and the numbers were recorded ahead of time and
              ship with the site.
            </p>
          </Block>

          <Block id="own-photo" title="Your own photo, step by step">
            <ol className="!max-w-none list-decimal space-y-3 pl-6 marker:text-muted">
              {STEPS.map((s) => (
                <li key={s} className="pl-1">
                  {s}
                </li>
              ))}
            </ol>
            <p>
              Only the photo goes to YouCam. The measurements (the iris, the sizes in millimetres, the contrast, the distances) stay in your browser. Face and iris measurements can
              count as sensitive data in some places, which is one reason ours are not sent anywhere.
            </p>
          </Block>

          <Block id="youcam" title="What YouCam keeps">
            <p>YouCam is a service from Perfect Corp, and its own policy governs what it does with a photo. Here is what we have checked against the live service.</p>
            <ul className="!max-w-none space-y-3">
              <Bullet>
                <strong className="font-medium text-ink">Deleted when you leave:</strong> the analysis and the makeup try-on tasks, with the photo and the pictures they made. We tested that a
                deleted task can no longer be fetched and that its picture link stops working.
              </Bullet>
              <Bullet>
                <strong className="font-medium text-ink">Up to 24 hours:</strong> {DISCLAIMERS.simulationRetention.replace(/^One exception: /, "")}
              </Bullet>
              <Bullet>
                <strong className="font-medium text-ink">If a delete doesn&rsquo;t get through</strong> (you closed the tab, or the connection dropped): YouCam&rsquo;s general policy removes
                uploaded and generated files after 30 days at the latest.
              </Bullet>
            </ul>
            <p>
              Read{" "}
              <a href="https://www.makeupar.com/perfectbeauty/youcam/privacy-policy-api" className="link text-ink" rel="noopener noreferrer" target="_blank">
                Perfect Corp&rsquo;s API privacy policy
              </a>{" "}
              for the rest.
            </p>
          </Block>

          <Block id="ours" title="What we keep">
            <p>
              <strong className="font-medium text-ink">We don&rsquo;t store your photo, your results or anything that names you.</strong> There are no accounts and no cookies. Your browser&rsquo;s tab
              storage holds an access code or your age confirmation until you close the tab, and nothing else.
            </p>
            <p>
              Our server keeps a small log of each call it makes to YouCam: what kind of call, the units it cost, the time, and a scrambled (hashed) copy of the access code, so that we can keep a daily
              cap. Like most hosts, ours may also keep ordinary request logs, such as the time and the address a request came from.
            </p>
          </Block>

          <Block id="age" title="Who it is for">
            <p>{DISCLAIMERS.adults} Anyone can explore the demo faces, which show everything the product does.</p>
          </Block>

          <Block id="not-advice" title="What the numbers are, and are not">
            <p>{DISCLAIMERS.notHealth} Arm&rsquo;s Length measures how visible a feature is from a distance. It says nothing about how your skin is doing.</p>
            <p>{DISCLAIMERS.estimate}</p>
            <p>{MARK_SAFETY_LINE}</p>
          </Block>

          <Block id="help" title="Help and contact">
            <p>
              The{" "}
              <Link href="/how-it-works" className="link text-ink">
                how it works
              </Link>{" "}
              page explains the method, and the{" "}
              <Link href="/self-test" className="link text-ink">
                self-test
              </Link>{" "}
              lets you check a prediction yourself.
            </p>
            <p>
              A question, a bug, or a result that looks wrong? Open an issue at{" "}
              <a href="https://github.com/ethanrom/arms-length/issues" className="link text-ink" rel="noopener noreferrer" target="_blank">
                github.com/ethanrom/arms-length/issues
              </a>
              . Because we hold no photos, there is nothing on our side to remove. To ask YouCam to remove something sooner, use the contact route in Perfect Corp&rsquo;s privacy policy.
            </p>
          </Block>
        </div>
      </div>
    </main>
  );
}
