import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  /** Chapter number shown in the eyebrow: "02". */
  index?: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Heading level for the title (the page h1 is separate). */
  as?: "h2" | "h3";
  /** A slim header for the first chapter, so the content starts higher on the page. */
  compact?: boolean;
}

/** A chapter of a long page: hairline rule, mono eyebrow, serif title, optional lede, then content. */
export function Section({ id, index, eyebrow, title, lede, children, className, as: Heading = "h2", compact }: SectionProps) {
  if (compact) {
    return (
      <section id={id} aria-labelledby={`${id}-title`} className={`rule-top scroll-mt-4 py-8 md:py-10 ${className ?? ""}`}>
        <div className="page">
          <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-2 md:mb-8">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {index && <span className="num font-mono text-[0.875rem]">{index}</span>}
              <Heading id={`${id}-title`} className="title text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)]">
                {title}
              </Heading>
              <span className="eyebrow hidden sm:inline">{eyebrow}</span>
            </div>
            {lede && <p className="max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">{lede}</p>}
          </header>
          {children}
        </div>
      </section>
    );
  }

  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`rule-top scroll-mt-4 py-16 md:py-24 ${className ?? ""}`}>
      <div className="page">
        <header className="mb-10 grid gap-x-12 gap-y-4 md:mb-14 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-end">
          <div>
            <p className="eyebrow flex items-center gap-3">
              {index && <span className="num text-ink">{index}</span>}
              {index && <span aria-hidden="true" className="h-px w-8 bg-ink/40" />}
              <span>{eyebrow}</span>
            </p>
            <Heading id={`${id}-title`} className="display mt-4 text-[clamp(2.25rem,1.4rem+3.6vw,4.25rem)]">
              {title}
            </Heading>
          </div>
          {lede && <p className="lede max-w-[30rem] md:justify-self-end md:pb-2">{lede}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}
