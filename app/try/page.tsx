import type { Metadata } from "next";
import { CheckMine } from "@/components/try/CheckMine";
import { PersonaCard } from "@/components/try/PersonaCard";
import { Section } from "@/components/ui/Section";
import { DEMO_IDS, loadBundle } from "@/lib/integration/demo";

export const metadata: Metadata = {
  title: "Try it",
  description: "Choose a synthetic demo face, or check your own.",
};

export default function TryPage() {
  const bundles = DEMO_IDS.map((id) => loadBundle(id)).filter((b) => b !== null);

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-6 pt-10 md:pt-16">
        <p className="eyebrow">Try it</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          Whose skin should <em className="font-normal italic">we step back</em> from?
        </h1>
        <p className="lede mt-6 max-w-[36rem]">
          Pick a demo face to see the full reading at once, or check your own photo. Demo faces are synthetic (AI-generated), so there is nobody to be kind about but you.
        </p>
      </div>

      <Section id="faces" eyebrow="Demo faces" title="Four synthetic faces" lede="Each one is a recorded YouCam analysis, measured by the same model that reads your photo. No account, no upload." className="!border-t-0 !pt-6 md:!pt-10">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {bundles.map((b) => (
            <li key={b.id}>
              <PersonaCard
                persona={b}
                alt={b.alt}
                frame={b.frame}
                position={b.frame.height / b.frame.width > 1.4 ? "50% 30%" : "50% 38%"}
                teaser={b.sentences.summary}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="camera-section" eyebrow="Your own photo" title="Or use my camera" lede="Your photo is analysed by YouCam and deleted from YouCam when you leave the page. We don't store it.">
        <CheckMine />
      </Section>
    </main>
  );
}
