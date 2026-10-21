import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DEMO_IDS, loadBundle } from "@/lib/integration/demo";
import { reliefShareLines, shareLineText } from "@/lib/integration/shareLines";

export function generateStaticParams() {
  return DEMO_IDS.map((persona) => ({ persona }));
}

export async function generateMetadata({ params }: PageProps<"/share/[persona]">): Promise<Metadata> {
  const { persona } = await params;
  const bundle = loadBundle(persona);
  return {
    title: bundle ? "From where others stand" : "Not found",
    description: "Which parts of a face are out of sight at a distance, worked out with a model of human vision.",
  };
}

export default function SharePage({ params }: PageProps<"/share/[persona]">) {
  return (
    <Suspense fallback={<main id="main" className="page py-12" aria-busy="true" />}>
      <Shared params={params} />
    </Suspense>
  );
}

async function Shared({ params }: { params: PageProps<"/share/[persona]">["params"] }) {
  const { persona } = await params;
  const bundle = loadBundle(persona);
  if (!bundle) notFound();
  const lines = reliefShareLines(bundle.report)
    .slice(0, 3)
    .map(shareLineText);
  const alt = `A share card. From where others stand. ${lines.length ? lines.join(". ") + "." : ""} For a typical sharp-eyed person looking right at it, in indoor light. An estimate. Synthetic face (AI-generated).`;

  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page grid gap-10 py-10 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
        <div>
          <p className="eyebrow !text-[0.875rem]">A shared reading</p>
          <h1 className="display mt-4 text-[clamp(2.5rem,1.4rem+4vw,4.5rem)]">
            From where <em className="font-normal italic">others stand</em>
          </h1>
          <p className="lede mt-6 max-w-[30rem]">
            Someone checked which parts of a face are out of sight at a distance, and chose the lines they wanted to share. Distances, not scores, from a model of human vision checked against a published eye study.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={`/try/${persona}`} className="btn btn-primary">
              See the whole reading <span className="arrow" aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/try" className="btn btn-ghost">
              Try a face
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[28rem]">
          <Image
            src={`/share/${persona}/card?format=4x5`}
            alt={alt}
            width={1080}
            height={1350}
            unoptimized
            preload
            className="h-auto w-full border border-rule"
          />
        </div>
      </div>
    </main>
  );
}
