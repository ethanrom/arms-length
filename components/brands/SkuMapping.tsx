import { loadBundle } from "@/lib/integration/demo";
import { concernTitle } from "@/lib/copy";
import type { ConcernId } from "@/lib/contracts";

/**
 * A brand's side of "where a change would actually be noticed": the reading comes from the analysis, the wording and the
 * product slot are the brand's own. The brand and products are fictional (no trademarks); the left-hand sentences are the
 * real "Worth it?" headlines of a recorded face.
 */
const ROWS: { concern: ConcernId; wording: string; sku: string; product: string }[] = [
  { concern: "dark_circle", wording: "A little concealer goes a long way under the eyes.", sku: "SKU 1001", product: "Brightening concealer, 3 shades" },
  { concern: "age_spot", wording: "Evening out your tone would be noticed across a table.", sku: "SKU 2040", product: "Tone-evening serum" },
  { concern: "pore", wording: "A softer finish is one to enjoy at the mirror.", sku: "SKU 3110", product: "Smoothing primer" },
];

export function SkuMapping({ face = "p1a" }: { face?: string }) {
  const bundle = loadBundle(face);
  if (!bundle) return null;
  return (
    <figure>
      <div className="border border-ink bg-paper">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-5 py-3">
          <span className="serif text-[1.25rem]" style={{ fontWeight: 420 }}>
            Your brand
          </span>
          <span className="text-[0.875rem] text-muted">Consultation set-up</span>
        </div>
        <ul>
          {ROWS.map((r) => {
            const reading = bundle.sentences.worthIt[r.concern]?.headline;
            if (!reading) return null;
            return (
              <li key={r.concern} className="grid gap-x-6 gap-y-3 border-b border-rule px-5 py-4 last:border-b-0 md:grid-cols-3">
                <div>
                  <p className="text-[0.875rem] text-muted">What the reading says</p>
                  <p className="mt-1 text-[0.9375rem] leading-snug text-ink">
                    <span className="font-medium">{concernTitle(r.concern)}.</span> {reading}
                  </p>
                </div>
                <div>
                  <p className="text-[0.875rem] text-muted">Your wording</p>
                  <p className="serif mt-1 text-[1.0625rem] leading-snug">{r.wording}</p>
                </div>
                <div>
                  <p className="text-[0.875rem] text-muted">Your product</p>
                  <p className="mt-1 text-[0.9375rem] leading-snug">
                    <span className="num font-mono text-[0.875rem] text-muted">{r.sku}</span>
                    <br />
                    {r.product}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <figcaption className="mt-4 max-w-[34rem] text-[0.875rem] leading-relaxed text-muted">
        A fictional brand with fictional products. The reading is a real one from a synthetic face; the wording and the product slot are the brand&rsquo;s to set. A reading never says
        &ldquo;don&rsquo;t buy&rdquo;, only where a change would be noticed.
      </figcaption>
    </figure>
  );
}
