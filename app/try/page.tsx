import type { Metadata } from "next";
import { CaptureSlot } from "@/components/CaptureSlot";
import { PersonaCard } from "@/components/try/PersonaCard";
import { Section } from "@/components/ui/Section";
import { MOCK_PERSONA_IDS, getMockResults } from "@/lib/mock/personas";

export const metadata: Metadata = {
  title: "Try it",
  description: "Choose a synthetic demo face, or check your own.",
};

export default function TryPage() {
  // INTEGRATION: read the persona list from the recorded bundles (PersonaBundle[]).
  const personas = MOCK_PERSONA_IDS.map((id) => getMockResults(id)).filter((d) => d !== null);

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

      <Section id="faces" eyebrow="Demo faces" title="Three synthetic faces" lede="Each one is a recorded analysis, replayed. No account, no upload." className="!border-t-0 !pt-6 md:!pt-10">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {personas.map((d) => (
            <li key={d.persona.id}>
              <PersonaCard
                persona={d.persona}
                alt={d.alt}
                frame={d.frame}
                position={d.persona.id === "p3a" ? "50% 30%" : "50% 38%"}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="camera-section" eyebrow="Your own photo" title="Or use my camera" lede="Your photo is processed by YouCam for the analysis and deleted after the session.">
        <CaptureSlot />
      </Section>
    </main>
  );
}
