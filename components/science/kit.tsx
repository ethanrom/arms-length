import type { ReactNode } from "react";
import { codeUrl, refNumber } from "@/lib/science/refs";

/** Ink tones for SVG and canvas, the same values as the site tokens in app/globals.css. */
export const INK = "#161513";
export const INK_SOFT = "#3a3833";
export const MUTED = "#5f5c56";
export const FAINT = "#8a867c";
export const RULE = "#d8d4cb";
export const PAPER = "#f5f3ef";
export const PAPER_DEEP = "#ebe8e1";
export const SVG_FONT = "var(--font-geist-sans), system-ui, sans-serif";

/** A chapter of the explainer: hairline rule, number, serif title, a short lede, then the live widget. */
export function Chapter({
  id,
  n,
  kicker,
  title,
  lede,
  children,
}: {
  id: string;
  n: string;
  kicker: string;
  title: ReactNode;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t border-ink pt-6 md:pt-8">
      <header className="grid gap-x-14 gap-y-5 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end">
        <div>
          <p className="eyebrow flex items-center gap-3">
            <span className="num text-ink">{n}</span>
            <span aria-hidden="true" className="h-px w-8 bg-ink/40" />
            <span>{kicker}</span>
          </p>
          <h2 id={`${id}-h`} className="display mt-3 text-[clamp(2rem,1.3rem+2.8vw,3.5rem)]">
            {title}
          </h2>
        </div>
        <div className="space-y-3 text-[1.0625rem] leading-[1.65] text-ink-soft [&>p]:max-w-[36rem] [&>p]:text-pretty">{lede}</div>
      </header>
      <div className="mt-8 md:mt-10">{children}</div>
    </section>
  );
}

/** A link to a file in the repository, in code type, with a clear cue that it leaves the site. */
export function CodeLink({ path, label }: { path: string; label?: string }) {
  return (
    <a href={codeUrl(path)} className="link whitespace-nowrap text-ink" target="_blank" rel="noopener noreferrer">
      <code className="font-mono text-[0.875rem]">{label ?? path}</code>
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens GitHub in a new tab)</span>
    </a>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.875rem] text-ink">{children}</code>;
}

/** "On this widget": exactly which function computes what the reader sees, with links to the code. */
export function OnWidget({ children, files }: { children: ReactNode; files: (string | { path: string; label: string })[] }) {
  return (
    <p className="mt-3 max-w-[60rem] text-[0.875rem] leading-relaxed text-ink-soft">
      <span className="eyebrow mr-2 !text-ink">On this widget</span>
      {children}{" "}
      {files.map((f, i) => {
        const file = typeof f === "string" ? { path: f, label: f } : f;
        return (
          <span key={file.path}>
            {i > 0 && ", "}
            <CodeLink path={file.path} label={file.label} />
          </span>
        );
      })}
      .
    </p>
  );
}

/** A widget: tape strip, the live content, then its caption (what it says) and the "On this widget" note. */
export function Plate({
  label,
  caption,
  on,
  children,
  className,
}: {
  /** Accessible name of the figure. */
  label: string;
  caption: ReactNode;
  on: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure aria-label={label} className={`sci-plate ${className ?? ""}`}>
      <div aria-hidden="true" className="sci-tape" />
      <div className="px-4 py-6 md:px-8 md:py-8">{children}</div>
      <figcaption className="border-t border-rule px-4 py-4 md:px-8 md:py-5">
        <p className="max-w-[60rem] text-[0.9375rem] leading-relaxed text-ink-soft">{caption}</p>
        {on}
      </figcaption>
    </figure>
  );
}

/** A numbered citation that links to the reference list: [3]. */
export function Cite({ k }: { k: string | string[] }) {
  const keys = Array.isArray(k) ? k : [k];
  return (
    <sup className="num whitespace-nowrap text-[0.75rem] font-medium leading-none">
      {keys.map((key, i) => {
        const n = refNumber(key);
        return (
          <span key={key}>
            {i === 0 ? "[" : ""}
            <a href={`#ref-${n}`} className="link px-px text-ink" aria-label={`Reference ${n}`}>
              {n}
            </a>
            {i < keys.length - 1 ? ", " : "]"}
          </span>
        );
      })}
    </sup>
  );
}

/** A figure's data as a table behind a disclosure: charts are decoration, the caption and the table are the content. */
export function DataTable({ label, head, rows }: { label: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3">
      <summary className="inline-flex min-h-10 cursor-pointer items-center text-[0.875rem] font-medium underline underline-offset-4">Show the data</summary>
      <div className="relative mt-1 max-h-[22rem] overflow-auto" tabIndex={0} aria-label={`${label} (scrolls)`}>
        <table className="w-full max-w-[44rem] border-collapse text-left text-[0.875rem] leading-snug">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="sticky top-0 border-b border-ink bg-paper py-2 pr-4 align-bottom font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="num border-b border-rule py-2 pr-4 align-top font-normal">
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="num border-b border-rule py-2 pr-4 align-top">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** A big serif number with a small unit and a caption: the way a reading is shown across the page. */
export function Reading({ value, unit, caption, size = "lg" }: { value: string; unit?: string; caption?: ReactNode; size?: "md" | "lg" | "xl" }) {
  const cls = size === "xl" ? "text-[clamp(3.5rem,2.6rem+3.6vw,5.5rem)]" : size === "lg" ? "text-[clamp(2.5rem,2rem+1.8vw,3.5rem)]" : "text-[2rem]";
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className={`serif num ${cls} font-light leading-none tracking-[-0.03em]`} style={{ fontWeight: 320 }}>
        {value}
      </span>
      {unit && <span className="serif text-[1.25rem] text-ink-soft">{unit}</span>}
      {caption && <span className="ml-1 text-[0.875rem] text-ink-soft">{caption}</span>}
    </p>
  );
}
