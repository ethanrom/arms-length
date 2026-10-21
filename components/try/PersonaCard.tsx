import Image from "next/image";
import Link from "next/link";
import type { PersonaBundle } from "@/lib/contracts";

interface PersonaCardProps {
  persona: Pick<PersonaBundle, "id" | "label" | "description" | "image">;
  frame: { width: number; height: number };
  /** Where to centre the crop, as CSS object-position. */
  position?: string;
  /** One line of what the reading will show; supplied with the persona data. */
  teaser?: string;
}

/** "Light olive skin, about 30. A few breakouts…" splits into a title and the rest. */
function splitDescription(description: string): { title: string; rest: string } {
  const at = description.indexOf(". ");
  return at === -1 ? { title: description.replace(/\.$/, ""), rest: "" } : { title: description.slice(0, at), rest: description.slice(at + 2) };
}

export function PersonaCard({ persona, frame, position = "50% 35%", teaser }: PersonaCardProps) {
  const { title, rest } = splitDescription(persona.description);
  return (
    <Link
      href={`/try/${persona.id}`}
      className="group flex h-full flex-col border border-rule bg-paper transition-colors duration-300 hover:border-ink"
    >
      <div className="stage on-stage relative aspect-[4/5] overflow-hidden">
        <Image
          src={persona.image}
          alt=""
          width={frame.width}
          height={frame.height}
          sizes="(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 92vw"
          className="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-calm)] group-hover:scale-[1.03]"
          style={{ objectPosition: position }}
        />
        <span className="absolute left-3 top-3 border border-ink/15 bg-paper px-2.5 py-1.5 text-[0.875rem] font-medium leading-none">Synthetic face (AI-generated)</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="title text-[1.5rem]">
          {title}
        </h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          {rest}
          {teaser && <span className="mt-3 block text-ink-soft">{teaser}</span>}
        </p>
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
