import Image from "next/image";
import Link from "next/link";
import type { PersonaBundle } from "@/lib/contracts";

interface PersonaCardProps {
  persona: Pick<PersonaBundle, "id" | "label" | "description" | "image">;
  frame: { width: number; height: number };
  /** Where to centre the crop, as CSS object-position. */
  position?: string;
}

/** "Light olive skin, about 30. A few breakouts…" splits into a title and the rest. */
function splitDescription(description: string): { title: string; rest: string } {
  const at = description.indexOf(". ");
  return at === -1 ? { title: description.replace(/\.$/, ""), rest: "" } : { title: description.slice(0, at), rest: description.slice(at + 2) };
}

/** A compact card for the chooser row: the face, who it is, one short line. The whole card is the link. */
export function PersonaCard({ persona, frame, position = "50% 35%" }: PersonaCardProps) {
  const { title, rest } = splitDescription(persona.description);
  return (
    <Link
      href={`/try/${persona.id}`}
      className="group flex h-full flex-col border border-rule bg-paper transition-colors duration-300 hover:border-ink"
    >
      <div className="stage on-stage relative aspect-square overflow-hidden lg:aspect-[7/6]">
        <Image
          src={persona.image}
          alt=""
          width={frame.width}
          height={frame.height}
          sizes="(min-width: 1024px) 22vw, (min-width: 768px) 24vw, 46vw"
          className="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-calm)] group-hover:scale-[1.03]"
          style={{ objectPosition: position }}
        />
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] border border-ink/15 bg-paper px-2 py-1 text-[0.875rem] font-medium leading-tight">
          <span className="block lg:inline">Synthetic face</span> <span className="block lg:inline">(AI-generated)</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3 lg:p-4">
        <h3 className="title flex items-start justify-between gap-2 text-[1.0625rem] lg:text-[1.25rem]">
          {title}
          <span className="arrow mt-0.5 shrink-0 text-[1rem] transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
            &rarr;
          </span>
        </h3>
        {rest && <p className="mt-1.5 line-clamp-4 text-[0.875rem] leading-snug text-muted lg:text-[0.9375rem]">{rest}</p>}
      </div>
    </Link>
  );
}
