import { buildChecks } from "@/lib/science/checks";
import { codeUrl, REFERENCES, refNumber } from "@/lib/science/refs";
import { Cite } from "./kit";

/** "How we checked it": one row per check with its result, where it comes from and the command that reproduces it. */
export function ChecksTable() {
  const rows = buildChecks();
  return (
    <div className="relative overflow-x-auto" tabIndex={0} aria-label="Checks table, scrolls sideways on small screens">
      <table className="w-full min-w-[56rem] border-collapse text-left text-[0.9375rem] leading-relaxed">
        <caption className="sr-only">Each check of the model: what it shows, its source, and the command that reproduces it</caption>
        <thead>
          <tr className="border-y border-ink text-[0.875rem]">
            <th scope="col" className="w-[16%] py-3 pr-5 font-medium">
              Check
            </th>
            <th scope="col" className="w-[42%] py-3 pr-5 font-medium">
              Result
            </th>
            <th scope="col" className="w-[19%] py-3 pr-5 font-medium">
              Source
            </th>
            <th scope="col" className="w-[23%] py-3 font-medium">
              Reproduce
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} id={`check-${r.id}`} className="border-b border-rule align-top">
              <th scope="row" className="serif py-4 pr-5 text-[1.125rem] font-normal text-ink">
                {r.check}
                {r.cites.length > 0 && (
                  <>
                    {" "}
                    <Cite k={r.cites} />
                  </>
                )}
              </th>
              <td className="num py-4 pr-5 text-ink-soft">{r.result}</td>
              <td className="py-4 pr-5">
                <ul className="space-y-1">
                  {r.sources.map((s) => (
                    <li key={s.label}>
                      {s.href ? (
                        <a href={s.href} className="link text-ink" target="_blank" rel="noopener noreferrer">
                          {s.label}
                          <span aria-hidden="true"> ↗</span>
                          <span className="sr-only"> (opens GitHub in a new tab)</span>
                        </a>
                      ) : (
                        <span className="text-ink-soft">{s.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="py-4">
                {r.command ? (
                  <code className="block break-words rounded-sm bg-paper-deep px-2 py-1.5 font-mono text-[0.8125rem] leading-snug text-ink">{r.command}</code>
                ) : (
                  <span className="text-[0.875rem] text-ink-soft">Needs the paper&rsquo;s stimulus images, which we do not redistribute. The ModelFest row reproduces the same comparison from the definitions.</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The numbered reference list: authors, year, title, venue, links, and what we take from each. */
export function ReferenceList() {
  return (
    <ol className="max-w-[52rem] border-t border-ink">
      {REFERENCES.map((r) => {
        const n = refNumber(r.key);
        return (
          <li key={r.key} id={`ref-${n}`} className="grid scroll-mt-6 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 border-b border-rule py-4 text-[0.9375rem] leading-relaxed">
            <span className="num font-mono text-[0.875rem] text-ink-soft">[{n}]</span>
            <div>
              <p className="text-ink">
                {r.authors.replace(/\.$/, "")}
                {r.year ? ` (${r.year}).` : "."} {r.title ? <em>{r.title}.</em> : null} {r.venue}.
              </p>
              <p className="mt-1 text-ink-soft">{r.used}</p>
              {r.links.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {r.links.map((l) => (
                    <a key={l.href} href={l.href} className="link text-ink" target="_blank" rel="noopener noreferrer">
                      {l.label}
                      <span aria-hidden="true"> ↗</span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ))}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const DOCS = [
  { path: "docs/MODEL.md", name: "MODEL.md", text: "The model in full: every step, every constant, with its source. A test fails if the table and the code disagree." },
  { path: "docs/EVAL.md", name: "EVAL.md", text: "How we check it: ModelFest, the planted-feature oracles, the properties the tests enforce, the AI head-to-head." },
  { path: "docs/NUMBERS.md", name: "NUMBERS.md", text: "Every number quoted in the README, the video and the entry text, each with the file or command it comes from." },
] as const;

const COMMANDS = [
  ["npm ci", "install the dependencies"],
  ["npx tsx eval/run.ts --detector=standard", "re-run ModelFest with the production detector (about 10 s); rewrites eval/results/modelfest.json"],
  ["npm test", "every check on this page, offline: recorded YouCam responses only, no live calls"],
] as const;

/** Links to the docs and the repository, and the commands that reproduce the numbers above. */
export function Reproduce() {
  return (
    <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
      <div>
        <p className="eyebrow !text-ink">Read</p>
        <ul className="mt-3 border-t border-ink">
          {DOCS.map((d) => (
            <li key={d.path} className="border-b border-rule py-4">
              <a href={codeUrl(d.path)} className="link serif text-[1.375rem] text-ink" target="_blank" rel="noopener noreferrer">
                {d.name}
                <span aria-hidden="true"> ↗</span>
                <span className="sr-only"> (opens GitHub in a new tab)</span>
              </a>
              <p className="mt-1 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">{d.text}</p>
            </li>
          ))}
          <li className="py-4">
            <a href="https://github.com/ethanrom/arms-length" className="link serif text-[1.375rem] text-ink" target="_blank" rel="noopener noreferrer">
              The repository
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> (opens GitHub in a new tab)</span>
            </a>
            <p className="mt-1 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">
              github.com/ethanrom/arms-length. The widgets above are in <code className="font-mono text-[0.875rem]">components/science</code>; the helpers behind them are in{" "}
              <code className="font-mono text-[0.875rem]">lib/science</code>, covered by unit tests.
            </p>
          </li>
        </ul>
      </div>
      <div>
        <p className="eyebrow !text-ink">Run</p>
        <ul className="mt-3 border-t border-ink">
          {COMMANDS.map(([cmd, text]) => (
            <li key={cmd} className="border-b border-rule py-4">
              <code className="block break-words rounded-sm bg-paper-deep px-3 py-2 font-mono text-[0.9375rem] text-ink">{cmd}</code>
              <p className="mt-2 max-w-[34rem] text-[0.9375rem] leading-relaxed text-ink-soft">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[34rem] text-[0.875rem] leading-relaxed text-ink-soft">
          The output is deterministic: running the evaluation again leaves the committed files unchanged.
        </p>
      </div>
    </div>
  );
}
