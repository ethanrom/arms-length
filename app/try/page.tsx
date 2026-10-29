import type { Metadata } from "next";
import { CheckMine } from "@/components/try/CheckMine";
import { PersonaCard } from "@/components/try/PersonaCard";
import { loadBundle } from "@/lib/integration/demo";

export const metadata: Metadata = {
  title: "Try it",
  description: "Choose one of four synthetic demo faces, or use your own photo.",
};

/** The relief-friendly face first (it is also the landing page's), then the others as they were recorded. */
const FACE_ORDER = ["p1a", "p2b", "p3a", "p5a"] as const;

export default function TryPage() {
  const bundles = FACE_ORDER.map((id) => loadBundle(id)).filter((b) => b !== null);

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-5 pt-6 md:pb-6 md:pt-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between xl:gap-12">
          <h1 className="display text-[clamp(2rem,1.2rem+2.6vw,3.25rem)]">
            Whose skin should <em className="font-normal italic">we step back</em> from?
          </h1>
          <p className="max-w-[28rem] text-balance text-[1rem] leading-relaxed text-ink-soft xl:pb-1">Pick a face for the full reading, or use your own photo.</p>
        </div>
      </div>

      <section id="faces" aria-labelledby="faces-title" className="page scroll-mt-4">
        <h2 id="faces-title" className="sr-only">
          Four synthetic demo faces
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-5">
          {bundles.map((b) => (
            <li key={b.id}>
              <PersonaCard persona={b} frame={b.frame} position={b.frame.height / b.frame.width > 1.4 ? "50% 38%" : "50% 36%"} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
          AI-generated faces with recorded YouCam analyses, so nobody real is on show. No account, no upload.
        </p>
      </section>

      <section id="camera-section" aria-labelledby="camera-title" className="page pb-8 pt-6 md:pb-10 md:pt-8">
        <CheckMine />
      </section>
    </main>
  );
}
