import type { Metadata } from "next";
import { CheckMine } from "@/components/try/CheckMine";
import { PersonaCard } from "@/components/try/PersonaCard";
import { Section } from "@/components/ui/Section";
import { concernNoun, nominalFractionAt, shareWord, TABLE_M, type ShareWord } from "@/lib/copy";
import { hasProfile } from "@/lib/integration/copy";
import { loadBundle } from "@/lib/integration/demo";
import type { ReadingBundle } from "@/lib/integration/types";

export const metadata: Metadata = {
  title: "Try it",
  description: "Choose one of four synthetic demo faces, or use your own photo.",
};

/** The relief-friendly face first (it is also the landing page's), then the others as they were recorded. */
const FACE_ORDER = ["p1a", "p2b", "p3a", "p5a"] as const;

const FEWEST_FIRST: ShareWord[] = ["none", "a few", "a small share", "some", "about a third", "about half", "most", "nearly all", "all"];

/**
 * One line about what the reading shows, from this face's own numbers: the two many-mark concerns that fade soonest for a
 * typical sharp-eyed person. It differs from face to face, unlike the one-size summary line.
 */
function reliefTeaser(bundle: ReadingBundle): string {
  const fading = bundle.report.concerns
    .filter(hasProfile)
    .map((cv) => ({ noun: concernNoun(cv.concern), word: shareWord(nominalFractionAt(cv, TABLE_M)) }))
    .sort((a, b) => FEWEST_FIRST.indexOf(a.word) - FEWEST_FIRST.indexOf(b.word))
    .slice(0, 2);
  if (fading.length === 0) return "";
  const parts = fading.map((f) => `${f.word} of the ${f.noun}`);
  return `Across a table, ${parts.join(" and ")} can be picked out.`;
}

export default function TryPage() {
  const bundles = FACE_ORDER.map((id) => loadBundle(id)).filter((b) => b !== null);

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-6 pt-10 md:pt-16">
        <p className="eyebrow">Try it</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          Whose skin should <em className="font-normal italic">we step back</em> from?
        </h1>
        <p className="lede mt-6 max-w-[36rem]">
          Pick a demo face to see the full reading at once, or use your own photo. The demo faces are AI-generated, so nobody real is on show.
        </p>
      </div>

      <Section
        id="faces"
        eyebrow="Demo faces"
        title="Four synthetic faces"
        lede="Each one is a recorded YouCam analysis of an AI-generated face, measured by the same model that reads your photo. No account, no upload."
        className="!border-t-0 !pt-6 md:!pt-10"
      >
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {bundles.map((b) => (
            <li key={b.id}>
              <PersonaCard persona={b} frame={b.frame} position={b.frame.height / b.frame.width > 1.4 ? "50% 30%" : "50% 38%"} teaser={reliefTeaser(b)} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="camera-section" eyebrow="Your own photo" title="Use my photo" lede="For ages 18 and over. Your photo is analysed by YouCam, and we ask YouCam to delete it when you leave. We don't store it.">
        <CheckMine />
      </Section>
    </main>
  );
}
