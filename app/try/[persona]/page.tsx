import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ResultsExperience } from "@/components/results/ResultsExperience";
import { MOCK_PERSONA_IDS, getMockResults } from "@/lib/mock/personas";

export function generateStaticParams() {
  return MOCK_PERSONA_IDS.map((persona) => ({ persona }));
}

export async function generateMetadata({ params }: PageProps<"/try/[persona]">): Promise<Metadata> {
  const { persona } = await params;
  const data = getMockResults(persona);
  return { title: data ? `What others see: ${data.persona.label}` : "Not found" };
}

export default function PersonaPage({ params }: PageProps<"/try/[persona]">) {
  return (
    <Suspense fallback={<Preparing />}>
      <Results params={params} />
    </Suspense>
  );
}

async function Results({ params }: { params: PageProps<"/try/[persona]">["params"] }) {
  const { persona } = await params;
  // INTEGRATION: replace with the recorded persona bundle + lib/copy sentences (and live results behind the access code).
  const data = getMockResults(persona);
  if (!data) notFound();
  return <ResultsExperience data={data} />;
}

/** Shown for a moment on client navigation, before the recorded analysis is in hand. */
function Preparing() {
  return (
    <main id="main" className="page py-12" aria-busy="true">
      <p className="eyebrow">Preparing</p>
      <h1 className="display mt-4 text-[clamp(2.5rem,1.4rem+4.6vw,5.5rem)]">
        Bringing the face <em className="font-normal italic">into focus</em>
      </h1>
      <div className="stage mt-10 h-[40svh] max-w-5xl" />
    </main>
  );
}
