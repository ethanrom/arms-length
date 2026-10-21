import type { ReactNode } from "react";

interface ChartFigureProps {
  /** The sentence that says what the chart says, with the "at most" wording. Always visible. */
  caption: string;
  /** What the table is called, for assistive tech. */
  tableLabel: string;
  head: string[];
  rows: string[][];
  children: ReactNode;
}

/** A chart with its words and its data: the chart is decoration, the caption and the table are the content. */
export function ChartFigure({ caption, tableLabel, head, rows, children }: ChartFigureProps) {
  return (
    <figure>
      {children}
      <figcaption className="mt-1 max-w-[36rem] text-[0.875rem] leading-relaxed text-ink-soft">{caption}</figcaption>
      <details className="mt-1">
        <summary className="inline-flex min-h-10 cursor-pointer items-center text-[0.875rem] font-medium underline underline-offset-4">Show the data</summary>
        <table className="mt-1 w-full max-w-[36rem] border-collapse text-left text-[0.875rem] leading-snug">
          <caption className="sr-only">{tableLabel}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="border-b border-ink py-2 pr-4 align-bottom font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="border-b border-rule py-2 pr-4 align-top font-normal">
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="border-b border-rule py-2 pr-4 align-top">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
