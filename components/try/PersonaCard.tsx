import Image from "next/image";
import Link from "next/link";
import type { PersonaBundle } from "@/lib/contracts";

interface PersonaCardProps {
  persona: Pick<PersonaBundle, "id" | "label" | "description" | "image">;
  alt: string;
  frame: { width: number; height: number };
  /** Where to centre the crop, as CSS object-position. */
  position?: string;
  /** One line of what the reading will show; supplied with the persona data. */
  teaser?: string;
}

export function PersonaCard({ persona, alt, frame, position = "50% 35%", teaser }: PersonaCardProps) {
  return (
    <Link
      href={`/try/${persona.id}`}
      className="group flex h-full flex-col border border-rule bg-paper transition-colors duration-300 hover:border-ink"
    >
      <div className="stage on-stage relative aspect-[4/5] overflow-hidden">
        <Image
          src={persona.image}
          alt={alt}
          width={frame.width}
          height={frame.height}
          sizes="(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 92vw"
          className="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-calm)] group-hover:scale-[1.03]"
          style={{ objectPosition: position }}
        />
        <span className="absolute left-3 top-3 border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-[0.625rem] uppercase leading-none tracking-[0.12em]">
          Synthetic face
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="title text-[1.5rem]">{persona.label}</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{persona.description}</p>
        {teaser && <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">{teaser}</p>}
        <span className="mt-auto flex items-center justify-between gap-3 border-t border-rule pt-4 text-[0.9375rem] font-medium">
          See what others see
          <span className="arrow transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
            &rarr;
          </span>
        </span>
      </div>
    </Link>
  );
}
