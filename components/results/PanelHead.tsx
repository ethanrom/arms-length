import type { ReactNode } from "react";

/** The heading of a tab's panel: a small eyebrow, the serif title the section always had, and its lede. */
export function PanelHead({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="mb-5">
      <p className="eyebrow !text-[0.875rem]">{eyebrow}</p>
      <h2 className="title mt-1.5 text-[clamp(1.5rem,1.25rem+0.9vw,2rem)]">{title}</h2>
      {lede && <p className="mt-2 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">{lede}</p>}
    </header>
  );
}
