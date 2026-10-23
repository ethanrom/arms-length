import type { DayPlan, PlannedMoment, ReceiptResult } from "@/lib/contracts/rehearse";
import { citedRefs, isCallFrame, isFreeFix, isLightestTouch, isObserve, isReceipt, isWorthIt, receiptFacts, type AnyResult } from "./results";

function headingOf(r: AnyResult): string {
  if (isReceipt(r)) return `One mark in detail: ${receiptFacts(r).concern.toLowerCase()}`;
  if (isObserve(r)) return "The scene";
  if (isCallFrame(r)) return "The video call";
  if (isFreeFix(r)) return "The change we tried";
  if (isLightestTouch(r)) return "The measured coverage";
  if (isWorthIt(r)) return "The simulated change";
  return "From the model";
}

/**
 * What a moment's sentences rest on: what was assumed, then each model result they cite with its own assumptions, and the
 * receipt numbers (size, contrast, angle, both thresholds) for any single mark that was looked at in detail.
 */
export function HowWeKnow({ plan, moment }: { plan: DayPlan; moment: PlannedMoment }) {
  const results = citedRefs(moment).flatMap((ref) => {
    const r = plan.results[ref];
    return r ? [r] : [];
  });
  // The same assumption often backs several results; say it once, where it first appears.
  const said = new Set<string>(moment.assumptions);
  const blocks = results.map((r) => {
    const fresh = r.assumptions.filter((a) => !said.has(a));
    fresh.forEach((a) => said.add(a));
    return { r, assumptions: fresh };
  });

  return (
    <div className="space-y-5 text-[0.9375rem] leading-relaxed">
      {moment.assumptions.length > 0 && (
        <section>
          <h4 className="eyebrow">What we assumed</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft marker:text-ink">
            {moment.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      {blocks.map(({ r, assumptions }) => (
        <section key={r.ref}>
          <h4 className="eyebrow">{headingOf(r)}</h4>
          {isReceipt(r) && <ReceiptNumbers result={r} />}
          {assumptions.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft marker:text-ink">
              {assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {blocks.length === 0 && moment.assumptions.length === 0 && <p className="text-ink-soft">The numbers on this card come straight from the model.</p>}
    </div>
  );
}

function ReceiptNumbers({ result }: { result: ReceiptResult }) {
  const facts = receiptFacts(result);
  return (
    <>
      <dl className="mt-2 grid max-w-md grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 border-y border-rule py-2">
        {facts.rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-ink-soft">{row.label}</dt>
            <dd className="num text-right text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-ink">{facts.verdict}</p>
    </>
  );
}
