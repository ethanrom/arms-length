/**
 * Writes README.md from results/summary.json, so every number in it is the summary's and the prompts are the ones sent.
 * The prose is fixed text around the numbers; if a rebuild changes the pattern the prose describes, read it again.
 */
import { CONCERN_COPY } from "../../lib/copy/concerns";
import { DAYS } from "./days";
import { systemPrompt, userText } from "./prompts";
import type { Summary } from "./summary";

const pct = (x: number | null | undefined, digits = 0): string => (x === null || x === undefined ? "-" : `${(100 * x).toFixed(digits)}%`);
/** One decimal under 10%, none above. */
const pctSmart = (x: number | null | undefined): string => (x === null || x === undefined ? "-" : pct(x, Math.abs(x) < 0.095 && x !== 0 ? 1 : 0));
const frac = (a: number, b: number): string => `${a} of ${b}`;
const usd = (x: number | null | undefined, digits = 2): string => (x === null || x === undefined ? "-" : `$${x.toFixed(digits)}`);
const fix = (x: number | null | undefined, d = 2): string => (x === null || x === undefined ? "-" : x.toFixed(d));
const secs = (ms: number | null | undefined): string => (ms === null || ms === undefined ? "-" : `${(ms / 1000).toFixed(1)} s`);
const int = (n: number): string => n.toLocaleString("en-US");

function table(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

const title = (concern: string): string => CONCERN_COPY[concern as keyof typeof CONCERN_COPY]?.title ?? concern;
const CONCERN_ORDER = ["pore", "age_spot", "acne", "wrinkle", "dark_circle", "eye_bag", "redness"];

export function renderReadme(s: Summary): string {
  const h = s.headline;
  const m = h.marksOnly;
  const wo = h.without;
  const wi = h.with;
  const ag = s.agent;
  const un = s.unaided;
  const c = un.consistency;
  const ci = (r: [number, number] | null | undefined): string => (r ? `${pct(r[0])} to ${pct(r[1])}` : "-");
  const ci1 = (r: [number, number] | null | undefined): string => (r ? `${pctSmart(r[0])} to ${pctSmart(r[1])}` : "-");
  const fence = "```";
  const noticeableAll = wo.tally.noticeable;
  const absentTotal = un.saidAbsentButFound;
  const e = s.effortCheck;

  const dayRows = DAYS.map((d) => [`\`${d.id}\``, d.text, d.callDevice, d.recorded ? "recorded fixture" : "run for this experiment"]);

  const headlineRows = (b: typeof h.marksOnly): (string | number)[][] => {
    const w = b.without.rates;
    const j = b.withoutJudgedOnly.rates;
    const a = b.with.rates;
    const iv = b.intervals;
    const ivj = b.intervalsJudgedOnly;
    return [
      ["Concern-moments scored", b.without.tally.claims, b.withoutJudgedOnly.tally.claims, b.with.tally.claims],
      ["**Contradiction rate** (noticeable yes/no differs from the model)", `**${pct(w.contradiction)}** (${ci(iv.contradiction.without)})`, `${pct(j.contradiction)} (${ci(ivj.contradiction.without)})`, `**${pctSmart(a.contradiction)}** (${ci1(iv.contradiction.with)})`],
      ["Missed: said not noticeable where the model says a typical viewer can pick it out", `${pct(w.miss)} (${ci(iv.miss.without)})`, `${pct(j.miss)} (${ci(ivj.miss.without)})`, `${pctSmart(a.miss)} (${ci1(iv.miss.with)})`],
      ["False alarm: said noticeable where the model says it is not", pct(w.falseAlarm), pct(j.falseAlarm), `${pct(a.falseAlarm)} (${ci(iv.falseAlarm.with)}; see below)`],
      ["**Over-cover rate**: \"cover\" advised where the model says out of sight", `**${pct(w.overCover)}** (${b.without.tally.overCovers} of ${b.without.tally.advisedOutOfSight})`, `${pct(j.overCover)} (${b.withoutJudgedOnly.tally.overCovers} of ${b.withoutJudgedOnly.tally.advisedOutOfSight})`, `**${pct(a.overCover)}** (${b.with.tally.overCovers} of ${b.with.tally.advisedOutOfSight})`],
      ["Under-warning: advice \"nothing\" where the model says noticeable", `${pct(w.underWarning)} (${frac(b.without.tally.underWarns, b.without.tally.advisedNoticeable)})`, `${pct(j.underWarning)} (${frac(b.withoutJudgedOnly.tally.underWarns, b.withoutJudgedOnly.tally.advisedNoticeable)})`, `not comparable (${pct(a.underWarning)}): the plan offers a free change first and says what is in sight`],
      ["Mean absolute share error (0 to 1)", fix(w.meanAbsShareError), fix(j.meanAbsShareError), "no number: the plan quotes the model's"],
      ["Cover advised, as a share of concern-moments", pct(w.coverRate), pct(j.coverRate), pct(a.coverRate)],
    ];
  };

  const byConcernRows = CONCERN_ORDER.map((id) => {
    const w = s.byConcernAll.find((x) => x.system === "without" && x.concern === id);
    const a = s.byConcernAll.find((x) => x.system === "with" && x.concern === id);
    if (!w || !a) return null;
    const inP = s.byConcern.find((x) => x.system === "without" && x.concern === id && x.kind === "inPerson");
    const call = s.byConcern.find((x) => x.system === "without" && x.concern === id && x.kind === "call");
    const missTxt = (b: typeof inP): string => (b ? (b.tally.noticeable > 0 ? `${b.tally.misses} of ${b.tally.noticeable}` : "none noticeable") : "-");
    return [
      title(id),
      w.tally.claims,
      frac(w.tally.noticeable, w.tally.claims),
      missTxt(inP),
      missTxt(call),
      un.saidAbsentByConcern[id] ?? 0,
      w.tally.falseAlarms,
      w.tally.covers,
      pctSmart(a.rates.contradiction),
    ];
  }).filter((r): r is (string | number)[] => r !== null);

  const sensRows = s.sensitivity.map((x) => [
    `> ${pct(x.threshold)}`,
    pct(x.without.contradiction),
    pct(x.without.miss),
    pct(x.without.falseAlarm),
    `${pct(x.without.overCover)}`,
    pct(x.withoutJudgedOnly.contradiction),
    pct(x.with.contradiction),
    pct(x.with.falseAlarm),
  ]);

  const outcomeRows = [
    ["Plans shipped (24 = 4 faces x 6 days)", ag.plans],
    ["...of which recorded fixtures reused / run here", `${ag.fixturesReused} / ${ag.newRuns}`],
    ["Verified on the first try", ag.outcomes.verified],
    ["Verified after one repair round", ag.outcomes.repaired],
    ["Deterministic fallback shipped", ag.outcomes.fallback],
    ["Numbers written in the shipped claims (clock times excluded)", ag.verifier.numbersShipped],
    ["...not in a quote of the result the claim cites (`verifyPlan` re-run on each shipped plan)", `**${ag.verifier.unverifiedNumbersShipped}**`],
    ["Other `verifyPlan` issues on shipped plans (wording, refs, actions)", ag.verifier.issuesTotal - ag.verifier.unverifiedNumbersShipped],
    ["Moments whose cited observation differs from `observeScene` run again", ag.verifier.cachedResultMismatches],
    ["Moments in the 24 plans (about 2.3 per plan)", ag.moments],
    ["Actions: none / lightest_touch / free_fix", `${ag.actions.none ?? 0} / ${ag.actions.lightest_touch ?? 0} / ${ag.actions.free_fix ?? 0}`],
  ];

  const disagreementRows = ag.disagreements.map((d) => [`${d.face} ${d.day} #${d.moment}`, d.scene, title(d.concern), d.readAsNoticeButSaysOutOfSight ? "noticeable (misread: the sentence says out of sight or lost)" : d.planSaid, pct(d.modelShare, 1), d.sentences[0] ?? ""]);

  const costRows = [
    ["Agent run (with numbers), 24 plans", secs(ag.perf.medianMs), `${fix(ag.perf.meanRequests, 1)} model requests, ${fix(ag.perf.medianToolCalls, 0)} tool calls (median)`, usd(ag.perf.costUsdMean, 3), usd(ag.perf.costUsdTotal)],
    ["Unaided call (without numbers), 48 calls", secs(un.perf.medianLatencyMs), "1 request, no tools", usd(un.perf.costUsdMean, 3), usd(un.perf.costUsdTotal)],
  ];

  return `# Do the numbers matter?

The same model, **Claude Sonnet 5.5 on Amazon Bedrock** (the model the Rehearse agent uses, effort \`${s.meta.effort}\`), asked about the same ${s.meta.faces.length} faces and ${s.meta.days.length} days twice: once through our agent, which calls the deterministic vision model for every number it writes, and once on its own, given the photo and the day. Both are scored against our model. This is the Rehearse counterpart of [llm-baseline](../llm-baseline/README.md), which asks the same kind of question about single distances.

## Short version

The question we expected to answer was "does the unaided model make people cover things nobody can see?". It does not. **The data say the opposite, and the more useful finding is a different one.**

- **No needless covering, from either arm.** Of the ${wo.tally.advisedOutOfSight} concern-moments our model puts out of sight for the viewer the model chose, the unaided model advised "cover" on **${wo.tally.overCovers}**; the agent, of ${wi.tally.advisedOutOfSight}, on **${wi.tally.overCovers}**. The unaided model advises covering in only ${pct(wo.rates.coverRate)} of its answers. The "effort the numbers save" is not in over-cover.
- **The unaided model under-reports.** Our model says a typical viewer can pick out something in ${int(noticeableAll)} of ${int(wo.tally.claims)} concern-moments. The unaided model called ${pct(wo.rates.miss)} of those "not noticeable" (${ci(h.intervals.miss.without)}). It contradicts our model on **${pct(wo.rates.contradiction)}** of concern-moments (${ci(h.intervals.contradiction.without)}), against **${pctSmart(wi.rates.contradiction)}** for the agent's plans (${ci1(h.intervals.contradiction.with)}). Resampling whole face-and-day pairs, the gap is ${ci(h.intervals.contradiction.diff)} (95%).
- **Much of that is not seeing the marks.** ${absentTotal} times (${pct(absentTotal / wo.tally.claims)}) it said a kind of mark is not on the face where our masks found it (${Object.entries(un.saidAbsentByConcern).map(([k, v]) => `${title(k).toLowerCase()} ${v}`).join(", ")}). Leave those out and count only where it gave a judgment: it still contradicts our model on ${pct(h.withoutJudgedOnly.rates.contradiction)}.
- **It is not noisy; relative to our model it leans.** Asked the same thing twice, its \`noticeable\` answers differ on ${pctSmart(c.noticeableDisagreementSameChoice)} of concern-moments where it picked the same scene, light and viewer (${c.disagreeSame} of ${c.comparedSame}); it picked the same scene, light and viewer for ${pct(c.sameChoiceRate)} of moments. So the gap above is a consistent lean toward "not noticeable", not run-to-run scatter. That weakens a "the AI is unstable" argument; it does not weaken "the AI is not anchored to the measurements".
- **Share estimates are loose.** On pores, dark spots, breakouts and fine lines its mean absolute error against our share is ${fix(m.without.rates.meanAbsShareError)} (0 to 1) and the correlation is ${fix(h.shareCorrelation.all)} (${fix(h.shareCorrelation.judgedOnly)} where it gave a judgment).
- **The agent's plans carry the numbers without drifting.** ${ag.outcomes.verified} of ${ag.plans} plans passed the verifier first time and ${ag.outcomes.repaired} after one repair; ${ag.outcomes.fallback} fell back to the deterministic plan. Re-running \`verifyPlan\` on every shipped plan against its own results finds **${ag.verifier.unverifiedNumbersShipped} unverified numbers of ${ag.verifier.numbersShipped}** shipped. Its sentences disagree with our model on ${pctSmart(wi.rates.contradiction)} of concern-moments; ${ag.disagreementKinds.fewPickedOut} of the ${ag.disagreements.length} are a plan naming a small quoted fraction ("about 1 in 13") as picked out, which is true and sits under the 10% line (${ag.misreadAsNotice} of those are sentences that call the group out of sight or lost, which my name matching reads as noticing; see the list).
- **The price:** ${usd(ag.perf.costUsdMean, 3)} and ${secs(ag.perf.medianMs)} per plan against ${usd(un.perf.costUsdMean, 3)} and ${secs(un.perf.medianLatencyMs)} for an unaided answer.

**What this does not show.** The truth here is our own model, so the agent's low contradiction rate is close to guaranteed by construction: its tool hands it the same "needs a change" list (share above 10%) that the scoring uses. It measures faithfulness, not accuracy. Whether our model is closer to what real people pick out than the unaided model's judgment is not tested here; that rests on the ModelFest comparison and the walk-back self-test (see \`docs/EVAL.md\`). What this experiment does show is that the unaided model gives different answers from the model on most questions, by a wide margin and almost all in one direction (at the 10% line it never calls noticeable what the model puts out of sight), and that the plan the agent writes keeps to the model's answers and its numbers.

## Method

**Inputs.** The four demo faces (\`public/demo/{${s.meta.faces.join(",")}}\`, synthetic AI-generated portraits) and six days. The first three are the app's example days, for which recorded agent plans exist (\`fixtures/rehearse/<face>/<day>.json\`); the other three were written for this test.

${table(["Day", "Text", "Calls on", "Agent plan"], dayRows)}

**With our numbers.** \`runAgent\` (\`lib/agent/loop.ts\`) with the real Bedrock client and the real engine, exactly as the app runs it: the system prompt in \`lib/agent/prompt.ts\`, the tools in \`lib/agent/tools.ts\`, the verifier in \`lib/agent/verify.ts\`, \`prefs.callDevice\` as in the table, makeup allowed. The ${ag.fixturesReused} plans for the example days are the recorded fixtures, not re-run; the ${ag.newRuns} others were run for this experiment. Each shipped plan is checked again with \`verifyPlan\` against its own results.

**Without our numbers.** The same model, the same effort and output ceiling as the agent's adapter, the face photo (\`public/demo/<face>/photo.jpg\`, sent unchanged) and the day text, **no tools**. It sees the same scene, light and viewer ids and labels as the agent's prompt, the scene distances from the same table, the iris and pupil distance as a ruler, and the definition of "noticeable" the scoring uses, including the one-in-ten line. It sees no tool result: no share, no count, no distance in metres for a call. It answers in strict JSON: moments, each with a scene, light and viewer and, for each of the seven concerns, \`{ noticeable, share, advice }\` or \`null\` for "not on this face". Every face-and-day pair is asked **twice**. Prompt caching is on for the system prompt and the photo, as in the agent's adapter. Prompts, verbatim:

${fence}text
${systemPrompt()}
${fence}

The user message is the photo, then (for \`workday\`):

${fence}text
${userText(DAYS[0].text, DAYS[0].callDevice)}
${fence}

(The \`teaching\` day says "phone"; the others "laptop". The agent gets the same two lines as its user message.)

**Truth, and how a moment is scored.** Each arm is scored on the scene, light and viewer **it chose**, with \`observeScene(face, { scene, light, viewer })\`. A video call that has no geometry (every unaided call) is scored at \`defaultCall(device)\`: the camera distance a laptop or phone usually has, in speaker view. A concern is **noticeable** when the model's typical share (average observer, no safety margin) is above ${pct(s.meta.truthThreshold)}, the same line as \`FREE_FIX_GOAL\`, the lightest touch the app aims for; large soft areas have a share of 0 or 1. Concerns the face has no targets for are skipped. The unaided model is asked about all seven concerns; a "not on this face" answer counts as "not noticeable, nothing to do" and is shown separately.

The agent writes sentences, not flags, so its verdicts are read from them: a concern named in a moment's \`notice\` sentences is "noticeable", one named in \`outOfSight\` is "not noticeable" (${ag.concernMomentsBoth} named in both and ${ag.concernMomentsSilent} not named at all are left out); "cover" is a \`lightest_touch\` action on that concern. A change of distance or light (\`free_fix\`) is not "cover".

| Metric | Definition |
|---|---|
| Contradiction | the system's \`noticeable\` differs from the model's, over the concern-moments where it took a stand |
| Missed / false alarm | said "not noticeable" where it is / said "noticeable" where it is not |
| Over-cover (headline) | "cover" advised, among the concern-moments the model says are out of sight |
| Under-warning | advice "nothing", among the concern-moments the model says are noticeable (a person may sensibly choose to do nothing about something noticeable, so this is the softer measure; "missed" is the claim) |
| Mean absolute share error | \`|share said - model's typical share|\`; large soft areas are 0 or 1 in the model, so the table also gives marks only |
| Run-to-run | the two repeats' \`noticeable\` answers, moment by moment, where both chose the same scene, light and viewer |

Intervals are 95% percentile intervals from a bootstrap that resamples whole face-and-day pairs (${s.headline.intervals.pairs} of them; ${BOOT_NOTE}), because concern-moments inside one reply are not independent.

## Results

### The headline, every concern

${table(["", "Without: all answers", "Without: only where it gave a judgment", "With our numbers"], headlineRows(h as typeof h.marksOnly))}

"Only where it gave a judgment" leaves out the ${absentTotal} answers of "not on this face".

### The same, marks only (large soft areas left out)

The model calls under-eye shadows and puffiness, and broad redness, in sight at every distance in its scene table, so they are a one-word question and nearly all of the unaided model's misses on them are the same miss. This table drops them.

${table(["", "Without: all answers", "Without: only where it gave a judgment", "With our numbers"], headlineRows(m))}

### Where it goes wrong, by concern

${table(["Concern", "Moments", "Noticeable per model", "Missed, in person", "Missed, on video calls", "Said \"not on this face\"", "Said noticeable, model says not", "Covers advised", "Agent: contradiction"], byConcernRows)}

Reading it:${readingByConcern(s)}

### Run-to-run: the unaided model asked twice

${table(["", ""], [
    ["Pairs with two readable replies", c.pairs],
    ["Same number of moments", `${c.sameMomentCount} of ${c.pairs}`],
    ["Moments compared by position", c.alignedMoments],
    ["Same scene, light and viewer", `${c.sameChoice} of ${c.alignedMoments} (${pct(c.sameChoiceRate)})`],
    ["\`noticeable\` differs, same choice", `${c.disagreeSame} of ${c.comparedSame} (${pctSmart(c.noticeableDisagreementSameChoice)})`],
    ["\`noticeable\` differs, any choice", `${c.disagreeAll} of ${c.comparedAll} (${pctSmart(c.noticeableDisagreementAnyChoice)})`],
    ["\`advice\` differs, same choice", `${c.adviceDisagreeSame} of ${c.adviceComparedSame} (${pctSmart(c.adviceDisagreementSameChoice)})`],
    ["Mean absolute difference in \`share\`, same choice", fix(c.meanAbsShareDifferenceSameChoice, 3)],
  ])}

The agent was run once per pair, so it has no repeat to compare. Its tools are deterministic: the same scene on the same face gives the same numbers, byte for byte.

### Did we under-think the unaided model? Effort \`high\`

${e.calls} extra unaided calls at effort \`high\` (the \`${["workday", "beach"].join("` and `")}\` days on every face, one run each), against the first run at the default effort on the same ${e.pairs} pairs.

${table(["", "Default effort", "High effort"], [
    ["Concern-moments", e.low.tally.claims, e.high.tally.claims],
    ["Contradiction rate", pct(e.low.rates.contradiction), pct(e.high.rates.contradiction)],
    ["Missed rate", pct(e.low.rates.miss), pct(e.high.rates.miss)],
    ["Contradiction, only where it gave a judgment", pct(e.low.judgedOnly.rates.contradiction), pct(e.high.judgedOnly.rates.contradiction)],
    ["Said \"not on this face\"", e.saidAbsentFound.low, e.saidAbsentFound.high],
    ["Over-cover", `${e.low.tally.overCovers} of ${e.low.tally.advisedOutOfSight}`, `${e.high.tally.overCovers} of ${e.high.tally.advisedOutOfSight}`],
    ["Mean output tokens", int(e.meanOutputTokens.low ?? 0), int(e.meanOutputTokens.high ?? 0)],
  ])}

More thinking moves the numbers a little and the pattern not at all. Eight pairs is a small check, not a result.

### How much the 10% line matters

The same replies, scored with other lines for "noticeable" (the unaided model was told one in ten; the agent follows its own tool's 10%).

${table(["Noticeable if model share is", "Without: contradiction", "Without: missed", "Without: false alarm", "Without: over-cover", "Without, judged only: contradiction", "With: contradiction", "With: false alarm"], sensRows)}

A higher line lowers the unaided model's misses and raises its false alarms, and raises the agent's disagreements, since it keeps to 10%. The unaided model's contradiction rate stays above the agent's at every line tried, but the gap narrows to ${Math.round(100 * ((s.sensitivity[3].without.contradiction ?? 0) - (s.sensitivity[3].with.contradiction ?? 0)))} points at 50%, so the size of the gap depends on where "noticeable" is drawn.

### The agent's plans

${table(["", ""], outcomeRows)}

The plan sentences that disagree with the model at the 10% line (${ag.disagreements.length} concern-moments; ${ag.disagreementKinds.fewPickedOut} name a fraction under one in ten as picked out, ${ag.disagreementKinds.outOfSightOverLine} list as out of sight a concern with a little over a tenth in view):

${table(["Plan", "Scene", "Concern", "Plan says", "Model share", "Sentence"], disagreementRows)}

### Cost and time

${table(["", "Median time", "Requests", "Mean cost", "Total cost"], costRows)}

${s.meta.calls} calls were made for this experiment (cap ${s.meta.caps.calls}): ${s.meta.agentRunsHere} agent runs, ${s.meta.unaidedCalls} unaided calls (${e.calls} of them the high-effort check) and ${s.meta.cacheRejectionRepeats} cache-rejection repeats. The agent runs made ${s.meta.modelRequests - s.meta.unaidedCalls - s.meta.cacheRejectionRepeats - 0} model requests inside them, ${s.meta.modelRequests} in all. Estimated cost **${usd(s.meta.estimatedCostUsd)}** (cap ${usd(s.meta.caps.usd, 0)}) at \$${s.meta.priceAssumptionUsdPerMillion.input} in and \$${s.meta.priceAssumptionUsdPerMillion.output} out per million tokens, with cache reads at 0.1x and writes at 1.25x the input price; Bedrock billing may differ. The ${ag.fixturesReused} reused fixtures cost ${usd(s.meta.reusedFixtureCostUsd)} when they were recorded; the table above includes them. Tokens: ${int(s.meta.tokens.input)} uncached in, ${int(s.meta.tokens.cacheRead)} cache read, ${int(s.meta.tokens.cacheWrite)} cache written, ${int(s.meta.tokens.output)} out. No YouCam units were used.

## Honest limits

- **The truth is our model.** Both arms are scored against \`observeScene\`. It is validated on ModelFest (lab thresholds) and checked by the walk-back test, not against people looking at these faces. The agent's low disagreement is by construction (see above). A reader who doubts the model should read this as "the unaided model answers differently from the model", not "the unaided model is wrong".
- **Small and synthetic.** Four AI-generated faces, six days, ${un.momentsScored} unaided moments and ${ag.moments} planned ones. The intervals above resample ${s.headline.intervals.pairs} face-and-day pairs and do not cover a different prompt, a different face or a different model.
- **The 10% line is a convention.** It is the app's lightest-touch goal, and the unaided model was told it. The sensitivity table shows what other lines do; no line is right in any absolute sense.
- **"Noticeable" is detectability, not attention.** The model asks whether a typical viewer looking right at the mark could pick it out. People in a conversation do not always look that closely, and an unaided answer of "nobody will notice" may be a fair reading of attention rather than a wrong reading of sight. The prompt asked for the first; the model may have answered the second.
- **Soft areas.** Under-eye shadows, puffiness and broad redness are "in sight" at every scene distance in the model, so they are 3 of the 7 concerns and a large share of the misses. The marks-only table removes them.
- **Calls are scored loosely for the unaided model.** It has no camera geometry, so its video calls are scored at the speaker-view default for the device the day implies. The agent picks its own geometry (often a gallery tile) and is scored on that.
- **The unaided model cannot see the masks.** It was given the photo, not the YouCam masks, so some of its "not on this face" answers may be marks too small or faint to see in a 1,080-pixel photo. That is a real limit of asking without measurements; it is also a handicap this test did not try to remove.
- **Effort.** The default effort is the agent's. The high-effort check covers eight pairs.
- **Sentence reading.** The agent's verdicts are read from its sentences by concern name (\`planVerdicts\` in \`score.ts\`), so a sentence that mixes verdicts is read as one list's. The ${ag.concernMomentsBoth} named in both lists are left out and the ${ag.disagreements.length} disagreements are listed above to be read by eye.
- **One model, one prompt wording, two repeats.** A better prompt for the unaided model may do better.

## Reproduce

${fence}
npm run spike -- eval/rehearse/run.ts              # calls the model for every uncached item (needs CLAUDE_AWS_* in .env), then rewrites results/ and this file
npx tsx eval/rehearse/run.ts --offline             # no network: rebuild summary.json, prompts.md and README.md from the cache and the fixtures
npx tsx eval/rehearse/run.ts --prompts             # write prompts.md only
npx vitest run eval/rehearse                       # the scoring maths
${fence}

\`run.ts\` never calls a finished item again (one file per call under \`results/raw/\`), checks the ${s.meta.caps.calls}-call and ${usd(s.meta.caps.usd, 0)} caps before every call, and allows one retry per unaided run for an unreadable reply (none was needed).

| File | What |
|---|---|
| \`run.ts\` | the driver: tasks, caps, cache, offline rebuild |
| \`call.ts\`, \`store.ts\` | the two model calls, the raw cache and the spend ledger |
| \`prompts.ts\`, \`prompts.md\` | the unaided arm's prompts and reply parser (the markdown is generated) |
| \`truth.ts\` | our model's answer for a moment |
| \`score.ts\`, \`score.test.ts\` | the scoring maths and its tests |
| \`summary.ts\`, \`readme.ts\` | \`results/summary.json\` and this file |
| \`results/raw/with/\` | the ${ag.newRuns} agent runs made here (plan, steps, tokens, verifier re-check) |
| \`results/raw/without/\`, \`results/raw/without-high/\` | every unaided reply, as sent back |
`;
}

const BOOT_NOTE = "2,000 resamples, fixed seed";

/** Facts per concern, in plain sentences; no verdicts the numbers do not carry. */
function readingByConcern(s: Summary): string {
  const get = (id: string, kind: string) => s.byConcern.find((x) => x.system === "without" && x.concern === id && x.kind === kind);
  const all = (id: string) => s.byConcernAll.find((x) => x.system === "without" && x.concern === id);
  const found = (id: string) => s.meta.faces.map((f) => (s.meta.targetCounts as Record<string, Record<string, number>>)[f]?.[id] ?? 0).join(", ");
  const said = (id: string) => {
    const a = all(id);
    return a ? a.tally.noticeable - a.tally.misses : 0;
  };
  const lines: string[] = [];
  const bag = all("eye_bag");
  const shadow = all("dark_circle");
  if (bag && shadow)
    lines.push(
      `- **Under-eye puffiness and shadows** are in sight in every moment for the model. The unaided model called puffiness noticeable in ${said("eye_bag")} of ${bag.tally.claims} and shadows in ${said("dark_circle")} of ${shadow.tally.claims}; it said puffiness is not on the face ${s.unaided.saidAbsentByConcern.eye_bag ?? 0} times and shadows ${s.unaided.saidAbsentByConcern.dark_circle ?? 0} times.`,
    );
  const acne = all("acne");
  if (acne) lines.push(`- **Breakouts**: it said "not on this face" ${s.unaided.saidAbsentByConcern.acne ?? 0} times of ${acne.tally.claims}. The masks found ${found("acne")} breakouts on the four faces (p1a, p2b, p3a, p5a). It advised covering them ${acne.tally.covers} times.`);
  const spotIn = get("age_spot", "inPerson");
  const spotCall = get("age_spot", "call");
  if (spotIn && spotCall)
    lines.push(`- **Dark spots**: missed ${spotIn.tally.misses} of ${spotIn.tally.noticeable} in-person moments where the model has some in sight and ${spotCall.tally.misses} of ${spotCall.tally.noticeable} on calls; it said "not on this face" ${s.unaided.saidAbsentByConcern.age_spot ?? 0} times (found: ${found("age_spot")}).`);
  const poreIn = get("pore", "inPerson");
  const poreCall = get("pore", "call");
  if (poreIn && poreCall)
    lines.push(
      `- **Pores**: in person it missed ${poreIn.tally.misses} of ${poreIn.tally.noticeable} moments where the model has more than a tenth in sight. On calls the model has pores in sight in only ${poreCall.tally.noticeable} of ${poreCall.tally.claims} concern-moments (the video cannot carry them) and the unaided model agreed on ${poreCall.tally.claims - poreCall.tally.contradictions} of ${poreCall.tally.claims}.`,
    );
  const lineIn = get("wrinkle", "inPerson");
  if (lineIn) lines.push(`- **Fine lines**: missed ${lineIn.tally.misses} of ${lineIn.tally.noticeable} in-person moments; "not on this face" ${s.unaided.saidAbsentByConcern.wrinkle ?? 0} times.`);
  const red = all("redness");
  if (red) lines.push(`- **Redness** is where it agrees most (contradiction ${pct(red.rates.contradiction)}), and where it advises covering most often (${red.tally.covers} times).`);
  return "\n\n" + lines.join("\n");
}
