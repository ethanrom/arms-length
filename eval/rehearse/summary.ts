/**
 * Builds results/summary.json from the raw cache, the recorded agent plans and our model. No network.
 *
 * Two arms, the same faces and days:
 *   with     the agent (lib/agent). Its verdicts are read from the plan it shipped: a concern named in `notice` is "noticeable", one
 *            named in `outOfSight` is "not noticeable", "cover" is a lightest_touch action on that concern.
 *   without  the same model given the photo and the day, no tools. Its verdicts are its own JSON.
 * Both are scored on the scene, light and viewer they chose, against observeScene on the face's measurements.
 */
import fs from "node:fs";
import path from "node:path";
import type { ConcernId } from "../../lib/contracts/concerns";
import type { ConcernAtScene, DayPlan, VerifierIssue } from "../../lib/contracts/rehearse";
import { isLightestTouch } from "../../lib/agent/results";
import { numbersIn, verifyPlan } from "../../lib/agent/verify";
import { DAYS, FACES, HIGH_EFFORT_DAYS, type EvalDay } from "./days";
import { CONCERN_IDS, parseReply, type ParsedMoment } from "./prompts";
import {
  clusterBootstrap, consistency, judgeMoment, pearson, planVerdicts, rates, sumConsistency, tally, truthOf,
  type Consistency, type Judgment, type MomentChoice, type Rates, type Stand, type Tally,
} from "./score";
import { MAX_CALLS, MAX_COST_USD, PRICE_PER_M, RAW_DIR, readJson, spendSoFar, withPath, withoutPath, type Arm, type Meter, type Outcome, type WithRecord, type WithoutRecord } from "./store";
import { faceOf, sceneInputOf, truthFor } from "./truth";

const ROOT = path.join(import.meta.dirname, "../..");
export const THRESHOLDS = [0.05, 0.1, 0.25, 0.5] as const;
const HEADLINE_THRESHOLD = 0.1;
const BOOT = { reps: 2000, seed: 20260101 } as const;

// ---------------------------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------------------------

interface AgentRun {
  face: string;
  day: EvalDay;
  source: "fixture" | "run";
  plan: DayPlan;
  outcome: Outcome;
  requests: number;
  toolCalls: number;
  ms: number;
  /** Prompt tokens processed (cached or not) and output tokens, as RunStats counts them. */
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recheck: VerifierIssue[];
}

interface FixtureFile {
  recordedAt: string;
  plan: DayPlan;
}
interface UsageAttempt {
  at: string;
  demoId: string;
  exampleId: string;
  costUsd: number;
}

function loadAgentRuns(): { runs: AgentRun[]; missing: string[] } {
  const usage = readJson<{ attempts: UsageAttempt[] }>(path.join(ROOT, "fixtures/rehearse/usage.json")).attempts;
  const runs: AgentRun[] = [];
  const missing: string[] = [];
  for (const face of FACES) {
    for (const day of DAYS) {
      const prefs = { callDevice: day.callDevice, noMakeup: false };
      let plan: DayPlan;
      let source: AgentRun["source"];
      let costUsd: number;
      let requests: number;
      let toolCalls: number;
      let inputTokens: number;
      let outputTokens: number;
      let ms: number;
      if (day.recorded) {
        const f = readJson<FixtureFile>(path.join(ROOT, "fixtures/rehearse", face, `${day.id}.json`));
        const attempt = usage.find((a) => a.demoId === face && a.exampleId === day.id && a.at === f.recordedAt);
        plan = f.plan;
        source = "fixture";
        costUsd = attempt?.costUsd ?? 0;
        ({ turns: requests, toolCalls, inputTokens, outputTokens, ms } = plan.stats);
      } else {
        const file = withPath(face, day.id);
        if (!fs.existsSync(file)) {
          missing.push(`${face}/${day.id}`);
          continue;
        }
        const r = readJson<WithRecord>(file);
        plan = r.plan;
        source = "run";
        costUsd = r.costUsd;
        requests = r.requests;
        toolCalls = r.toolCalls;
        ({ inputTokens, outputTokens, ms } = plan.stats);
      }
      const recheck = verifyPlan({ moments: plan.moments, summary: plan.summary }, plan.results, prefs);
      const outcome: Outcome = !plan.verified ? "fallback" : plan.stats.repairs > 0 ? "repaired" : "verified";
      runs.push({ face, day, source, plan, outcome, requests, toolCalls, ms, inputTokens, outputTokens, costUsd, recheck });
    }
  }
  return { runs, missing };
}

interface WithoutRun {
  face: string;
  day: EvalDay;
  run: number;
  /** Calls spent on this run (1, or 2 when the first reply could not be read). */
  attempts: number;
  moments: ParsedMoment[] | null;
  records: WithoutRecord[];
}

function loadWithoutRuns(arm: Arm = "without"): WithoutRun[] {
  const out: WithoutRun[] = [];
  for (const face of FACES)
    for (const day of DAYS)
      for (let run = 1; run <= 2; run++) {
        const records: WithoutRecord[] = [];
        for (let k = 1; k <= 2; k++) {
          const f = withoutPath(face, day.id, run, k, arm);
          if (fs.existsSync(f)) records.push(readJson<WithoutRecord>(f));
        }
        if (records.length === 0) continue;
        let moments: ParsedMoment[] | null = null;
        for (const r of records) {
          moments = parseReply(r.text);
          if (moments) break;
        }
        out.push({ face, day, run, attempts: records.length, moments, records });
      }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Cases: one moment of one reply, with the concerns the model says are there and what the system said about each
// ---------------------------------------------------------------------------------------------------------------

type Kind = "inPerson" | "call";

interface Case {
  system: "with" | "without" | "high";
  face: string;
  day: string;
  run: number;
  index: number;
  scene: string;
  light: string;
  viewer: string;
  kind: Kind;
  distanceM: number;
  concerns: ConcernAtScene[];
  stands: Partial<Record<ConcernId, Stand>>;
  /** with: concerns the plan names both as noticeable and as out of sight. */
  both: ConcernId[];
  /** without: concerns the system called noticeable where the model finds no targets on the face. */
  claimedNotOnFace: ConcernId[];
  /** with: the sentences that name each concern, for the audit. */
  texts: Partial<Record<ConcernId, string[]>>;
}

function withoutCases(runs: WithoutRun[], system: "without" | "high" = "without"): { cases: Case[]; unscorable: { face: string; day: string; run: number; scene: string; light: string; viewer: string }[] } {
  const cases: Case[] = [];
  const unscorable: { face: string; day: string; run: number; scene: string; light: string; viewer: string }[] = [];
  for (const r of runs) {
    if (!r.moments) continue;
    const face = faceOf(r.face);
    r.moments.forEach((m, index) => {
      const input = sceneInputOf(m, r.day.callDevice);
      if (!input) {
        unscorable.push({ face: r.face, day: r.day.id, run: r.run, scene: m.scene, light: m.light, viewer: m.viewer });
        return;
      }
      const truth = truthFor(face, input);
      const present = new Set(truth.concerns.filter((c) => c.targetCount > 0).map((c) => c.concern));
      cases.push({
        system, face: r.face, day: r.day.id, run: r.run, index,
        scene: m.scene, light: m.light, viewer: m.viewer, kind: m.scene === "video_call" ? "call" : "inPerson",
        distanceM: truth.distanceM, concerns: truth.concerns, stands: m.stands, both: [], texts: {},
        claimedNotOnFace: CONCERN_IDS.filter((id) => !present.has(id) && m.stands[id]?.noticeable === true),
      });
    });
  }
  return { cases, unscorable };
}

function withCases(runs: AgentRun[]): { cases: Case[]; mismatches: number } {
  const cases: Case[] = [];
  let mismatches = 0;
  for (const r of runs) {
    const face = faceOf(r.face);
    r.plan.moments.forEach((m, index) => {
      const truth = truthFor(face, m.scene);
      const cited = r.plan.results[m.observeRef];
      if (cited && "concerns" in cited && cited.concerns.some((c) => {
        const t = truth.concerns.find((x) => x.concern === c.concern);
        return !t || Math.abs(t.typicalShare - c.typicalShare) > 1e-9 || t.targetCount !== c.targetCount;
      })) mismatches++;
      const notice = m.notice.map((c) => c.text);
      const out = m.outOfSight.map((c) => c.text);
      const verdicts = planVerdicts(notice, out);
      const cover = m.action.kind === "lightest_touch" ? r.plan.results[m.action.ref] : undefined;
      const covered = cover && isLightestTouch(cover) ? cover.concern : null;
      const stands: Partial<Record<ConcernId, Stand>> = {};
      const both: ConcernId[] = [];
      const texts: Partial<Record<ConcernId, string[]>> = {};
      for (const c of truth.concerns) {
        if (c.targetCount === 0) continue;
        const v = verdicts.get(c.concern);
        if (v === "both") both.push(c.concern);
        stands[c.concern] = { noticeable: v === "noticeable" ? true : v === "outOfSight" ? false : null, share: null, advice: covered === c.concern ? "cover" : "nothing" };
        if (v) texts[c.concern] = [...notice, ...out].filter((t) => planVerdicts([t], []).has(c.concern));
      }
      cases.push({
        system: "with", face: r.face, day: r.day.id, run: 1, index,
        scene: m.scene.scene, light: truth.input.light, viewer: truth.input.viewer, kind: m.scene.scene === "video_call" ? "call" : "inPerson",
        distanceM: truth.distanceM, concerns: truth.concerns, stands, both, claimedNotOnFace: [], texts,
      });
    });
  }
  return { cases, mismatches };
}

// ---------------------------------------------------------------------------------------------------------------
// Judging and aggregating
// ---------------------------------------------------------------------------------------------------------------

type Row = Judgment & { case: Case };

function judgeCases(cases: readonly Case[], threshold: number): Row[] {
  return cases.flatMap((c) => judgeMoment(truthOf(c.concerns, threshold), c.stands).map((j): Row => ({ ...j, case: c })));
}

const round = (x: number | null, digits = 4): number | null => (x === null ? null : Number(x.toFixed(digits)));
const roundRates = (r: Rates): Record<keyof Rates, number | null> => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round(v as number | null)])) as Record<keyof Rates, number | null>;

function block(rows: readonly Judgment[]) {
  const t = tally(rows);
  return { tally: t, rates: roundRates(rates(t)) };
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return m;
}

const pairKey = (c: { face: string; day: string }) => `${c.face}/${c.day}`;

type Metric = "contradiction" | "miss" | "falseAlarm" | "overCover" | "underWarning" | "meanAbsShareError";

interface Interval {
  without: [number, number] | null;
  with: [number, number] | null;
  diff: [number, number] | null;
}
type Intervals = { pairs: number } & Record<Metric, Interval>;

function intervals(rowsBy: (system: "with" | "without") => Row[], metrics: Metric[]): Intervals {
  const withRows = groupBy(rowsBy("with"), (r) => pairKey(r.case));
  const withoutRows = groupBy(rowsBy("without"), (r) => pairKey(r.case));
  const keys = [...withRows.keys()].filter((k) => withoutRows.has(k));
  const clusters = keys.map((k) => ({ with: withRows.get(k)!, without: withoutRows.get(k)! }));
  const stat = (m: Metric, which: "with" | "without") => (sample: readonly (typeof clusters)[number][]) => rates(tally(sample.flatMap((c) => c[which])))[m];
  const out: Partial<Record<Metric, Interval>> = {};
  for (const m of metrics) {
    const ci = (v: [number, number] | null) => (v ? ([round(v[0])!, round(v[1])!] as [number, number]) : null);
    out[m] = {
      without: ci(clusterBootstrap(clusters, stat(m, "without"), BOOT)),
      with: ci(clusterBootstrap(clusters, stat(m, "with"), BOOT)),
      diff: ci(clusterBootstrap(clusters, (s) => {
        const [a, b] = [stat(m, "without")(s), stat(m, "with")(s)];
        return a === null || b === null ? null : a - b;
      }, BOOT)),
    };
  }
  // A metric not asked for is absent; the callers read only the ones they asked for.
  return { pairs: clusters.length, ...out } as Intervals;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const a = [...xs].sort((p, q) => p - q);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------------------------------------------

export async function buildSummary() {
  const spend = spendSoFar();
  const { runs: agentRuns, missing } = loadAgentRuns();
  const withoutRuns = loadWithoutRuns();
  const { cases: woCases, unscorable } = withoutCases(withoutRuns);
  const { cases: wCases, mismatches } = withCases(agentRuns);
  const highRuns = loadWithoutRuns("without-high").filter((r) => HIGH_EFFORT_DAYS.includes(r.day.id));
  const { cases: hiCases } = withoutCases(highRuns, "high");
  const allCases = [...woCases, ...wCases];

  const rowsAt = (threshold: number) => judgeCases(allCases, threshold);
  const rows = rowsAt(HEADLINE_THRESHOLD);
  const withRows = rows.filter((r) => r.case.system === "with");
  const withoutRows = rows.filter((r) => r.case.system === "without");
  const withoutJudged = withoutRows.filter((r) => !r.absent);

  // ---- headline: every concern, and the marks that are not large soft areas (pores, dark spots, breakouts, fine lines, and redness where it is not one broad area)
  const scope = (keep: (r: Row) => boolean) => ({
    without: block(withoutRows.filter(keep)),
    withoutJudgedOnly: block(withoutJudged.filter(keep)),
    with: block(withRows.filter(keep)),
    intervals: intervals((s) => (s === "with" ? withRows : withoutRows).filter(keep), ["contradiction", "miss", "falseAlarm", "overCover", "underWarning", "meanAbsShareError"]),
    intervalsJudgedOnly: intervals((s) => (s === "with" ? withRows : withoutJudged).filter(keep), ["contradiction", "miss", "falseAlarm", "overCover", "underWarning"]),
  });
  const shareRows = withoutRows.filter((r) => !r.soft && r.shareSaid !== null);
  const headline = {
    threshold: HEADLINE_THRESHOLD,
    ...scope(() => true),
    /** Large soft areas are left out: the model calls them in sight at every distance in the table, so they are a one-word question. */
    marksOnly: scope((r) => !r.soft),
    /** The unaided model's share estimates against the model's shares, marks only. */
    shareCorrelation: {
      all: round(pearson(shareRows.map((r) => r.shareSaid!), shareRows.map((r) => r.truthShare))),
      judgedOnly: round(pearson(shareRows.filter((r) => !r.absent).map((r) => r.shareSaid!), shareRows.filter((r) => !r.absent).map((r) => r.truthShare))),
      n: shareRows.length,
    },
  };

  // ---- the high-effort check: the same pairs, run 1 at the default effort against run 1 at high effort
  const highPairs = new Set(highRuns.filter((r) => r.moments).map((r) => pairKey({ face: r.face, day: r.day.id })));
  const hiRows = judgeCases(hiCases, HEADLINE_THRESHOLD);
  const lowRows = withoutRows.filter((r) => r.case.run === 1 && highPairs.has(pairKey(r.case)));
  const effortCheck = {
    pairs: highPairs.size,
    calls: highRuns.reduce((n, r) => n + r.records.length, 0),
    low: { ...block(lowRows), judgedOnly: block(lowRows.filter((r) => !r.absent)) },
    high: { ...block(hiRows), judgedOnly: block(hiRows.filter((r) => !r.absent)) },
    meanOutputTokens: {
      low: round(mean(highRuns.flatMap((r) => { const l = withoutRuns.find((x) => x.face === r.face && x.day.id === r.day.id && x.run === 1); return l ? l.records.map((x) => x.meter?.output ?? 0) : []; })), 0),
      high: round(mean(highRuns.flatMap((r) => r.records.map((x) => x.meter?.output ?? 0))), 0),
    },
    saidAbsentFound: { low: lowRows.filter((r) => r.absent).length, high: hiRows.filter((r) => r.absent).length },
    covers: { low: lowRows.filter((r) => r.advice === "cover").length, high: hiRows.filter((r) => r.advice === "cover").length },
    costUsd: round(sum(highRuns.flatMap((r) => r.records.map((x) => x.costUsd))), 4),
  };

  // ---- the other views of the same rows
  const view = (key: (r: Row) => string) =>
    [...groupBy(rows.filter((r) => r.case.system !== "high"), (r) => `${r.case.system}|${key(r)}`).entries()].map(([k, js]) => {
      const cut = k.indexOf("|");
      const [system, group] = [k.slice(0, cut), k.slice(cut + 1)];
      return { system, group, ...block(js) };
    });
  const byConcern = view((r) => `${r.concern}|${r.case.kind}`).map((x) => {
    const [concern, kind] = x.group.split("|");
    return { system: x.system, concern, kind, tally: x.tally, rates: x.rates };
  });
  const byConcernAll = view((r) => r.concern).map((x) => ({ system: x.system, concern: x.group, tally: x.tally, rates: x.rates }));
  const byScene = view((r) => r.case.scene).map((x) => ({ system: x.system, scene: x.group, tally: x.tally, rates: x.rates }));
  const byKind = view((r) => r.case.kind).map((x) => ({ system: x.system, kind: x.group, tally: x.tally, rates: x.rates }));
  const byFace = view((r) => r.case.face).map((x) => ({ system: x.system, face: x.group, tally: x.tally, rates: x.rates }));

  // ---- sensitivity of the truth line
  const sensitivity = THRESHOLDS.map((threshold) => {
    const rs = rowsAt(threshold);
    const wo = rs.filter((r) => r.case.system === "without");
    const wi = rs.filter((r) => r.case.system === "with");
    return { threshold, without: block(wo).rates, withoutJudgedOnly: block(wo.filter((r) => !r.absent)).rates, with: block(wi).rates };
  });

  // ---- the unaided model, in more detail
  const present = (faceId: string) => new Set(truthFor(faceOf(faceId), { scene: "conversation" }).concerns.filter((c) => c.targetCount > 0).map((c) => c.concern));
  const consistencies: Consistency[] = [];
  const consistencyByFace = new Map<string, Consistency[]>();
  for (const face of FACES)
    for (const day of DAYS) {
      const [a, b] = [1, 2].map((n) => withoutRuns.find((r) => r.face === face && r.day.id === day.id && r.run === n)?.moments);
      if (!a || !b) continue;
      const toChoice = (ms: ParsedMoment[]): MomentChoice[] => ms;
      const c = consistency(toChoice(a), toChoice(b), [...present(face)]);
      consistencies.push(c);
      consistencyByFace.set(face, [...(consistencyByFace.get(face) ?? []), c]);
    }
  const cons = sumConsistency(consistencies);
  const consRate = (n: number, d: number) => round(d > 0 ? n / d : null);

  const absentRows = withoutRows.filter((r) => r.absent);
  const unaided = {
    runsReadable: withoutRuns.filter((r) => r.moments).length,
    runsUnreadable: withoutRuns.filter((r) => !r.moments).length,
    retriesUsed: withoutRuns.filter((r) => r.attempts > 1).length,
    apiErrors: withoutRuns.flatMap((r) => r.records).filter((r) => r.error).length,
    momentsScored: woCases.length,
    momentsPerRun: round(woCases.length / Math.max(1, withoutRuns.filter((r) => r.moments).length), 2),
    unscorableMoments: unscorable,
    blurryChosen: woCases.filter((c) => c.viewer === "blurry").length,
    sceneChoices: Object.fromEntries([...groupBy(woCases, (c) => c.scene).entries()].map(([k, v]) => [k, v.length])),
    /** Judgments where it said the mark is not on this face but our masks found it. */
    saidAbsentButFound: absentRows.length,
    saidAbsentByConcern: Object.fromEntries([...groupBy(absentRows, (r) => r.concern).entries()].map(([k, v]) => [k, v.length])),
    claimedMarksNotOnFace: sum(woCases.map((c) => c.claimedNotOnFace.length)),
    consistency: {
      ...cons,
      sameMomentCountRate: consRate(cons.sameMomentCount, cons.pairs),
      sameChoiceRate: consRate(cons.sameChoice, cons.alignedMoments),
      noticeableDisagreementSameChoice: consRate(cons.disagreeSame, cons.comparedSame),
      noticeableDisagreementAnyChoice: consRate(cons.disagreeAll, cons.comparedAll),
      adviceDisagreementSameChoice: consRate(cons.adviceDisagreeSame, cons.adviceComparedSame),
      meanAbsShareDifferenceSameChoice: round(cons.shareComparedSame > 0 ? cons.shareAbsDiffSame / cons.shareComparedSame : null),
      byFace: Object.fromEntries([...consistencyByFace.entries()].map(([f, cs]) => {
        const s = sumConsistency(cs);
        return [f, { pairs: s.pairs, noticeableDisagreementSameChoice: consRate(s.disagreeSame, s.comparedSame), compared: s.comparedSame }];
      })),
    },
    perf: {
      calls: withoutRuns.reduce((n, r) => n + r.records.length, 0),
      medianLatencyMs: median(withoutRuns.flatMap((r) => r.records.map((x) => x.latencyMs))),
      meanOutputTokens: round(mean(withoutRuns.flatMap((r) => r.records.map((x) => x.meter?.output ?? 0))), 0),
      costUsdTotal: round(sum(withoutRuns.flatMap((r) => r.records.map((x) => x.costUsd))), 4),
      costUsdMean: round(mean(withoutRuns.flatMap((r) => r.records.map((x) => x.costUsd))), 4),
    },
  };

  // ---- the agent
  const outcomes = { verified: 0, repaired: 0, fallback: 0 };
  for (const r of agentRuns) outcomes[r.outcome]++;
  const issuesBy = (code: VerifierIssue["code"]) => sum(agentRuns.map((r) => r.recheck.filter((i) => i.code === code).length));
  const claimTexts = (p: DayPlan): string[] => [p.summary.text, ...p.moments.flatMap((m) => [...m.notice, ...m.outOfSight, m.action.claim].map((c) => c.text))];
  const actionKinds = Object.fromEntries([...groupBy(agentRuns.flatMap((r) => r.plan.moments), (m) => m.action.kind).entries()].map(([k, v]) => [k, v.length]));
  const agentMoments = agentRuns.flatMap((r) => r.plan.moments);
  const bothMentions = wCases.flatMap((c) => c.both.map((concern) => ({ face: c.face, day: c.day, moment: c.index + 1, concern, sentences: c.texts[concern] ?? [] })));
  const silent = withRows.filter((r) => r.said === null).length;
  const agent = {
    plans: agentRuns.length,
    fixturesReused: agentRuns.filter((r) => r.source === "fixture").length,
    newRuns: agentRuns.filter((r) => r.source === "run").length,
    missing,
    outcomes,
    verifier: {
      recheckedPlans: agentRuns.length,
      plansWithAnyIssue: agentRuns.filter((r) => r.recheck.length > 0).length,
      issuesTotal: sum(agentRuns.map((r) => r.recheck.length)),
      unverifiedNumbersShipped: issuesBy("stray_number"),
      boundWordingIssues: issuesBy("bound_wording"),
      otherIssues: sum(agentRuns.map((r) => r.recheck.filter((i) => i.code !== "stray_number" && i.code !== "bound_wording").length)),
      numbersShipped: sum(agentRuns.map((r) => sum(claimTexts(r.plan).map((t) => numbersIn(t).length)))),
      claimsShipped: sum(agentRuns.map((r) => claimTexts(r.plan).length)),
      cachedResultMismatches: mismatches,
    },
    misreadAsNotice: withRows.filter((r) => r.contradiction && r.said === true && (r.case.texts[r.concern] ?? []).some((t) => /\b(out of sight|lost)\b/i.test(t))).length,
    moments: agentMoments.length,
    momentsPerPlan: round(agentMoments.length / Math.max(1, agentRuns.length), 2),
    actions: actionKinds,
    sceneChoices: Object.fromEntries([...groupBy(agentMoments, (m) => m.scene.scene).entries()].map(([k, v]) => [k, v.length])),
    concernMomentsSilent: silent,
    concernMomentsBoth: bothMentions.length,
    bothMentions,
    perf: {
      runs: agentRuns.length,
      medianMs: median(agentRuns.map((r) => r.ms)),
      meanMs: round(mean(agentRuns.map((r) => r.ms)), 0),
      medianRequests: median(agentRuns.map((r) => r.requests)),
      meanRequests: round(mean(agentRuns.map((r) => r.requests)), 2),
      medianToolCalls: median(agentRuns.map((r) => r.toolCalls)),
      promptTokensProcessed: sum(agentRuns.map((r) => r.inputTokens)),
      outputTokens: sum(agentRuns.map((r) => r.outputTokens)),
      costUsdTotal: round(sum(agentRuns.map((r) => r.costUsd)), 4),
      costUsdMean: round(mean(agentRuns.map((r) => r.costUsd)), 4),
      costUsdMedian: round(median(agentRuns.map((r) => r.costUsd)), 4),
    },
    pairs: agentRuns.map((r) => ({
      face: r.face, day: r.day.id, source: r.source, outcome: r.outcome, moments: r.plan.moments.length, requests: r.requests,
      toolCalls: r.toolCalls, ms: r.ms, repairs: r.plan.stats.repairs, costUsd: round(r.costUsd), issues: r.recheck.length,
    })),
    disagreementKinds: {
      /** The plan names it as picked out, with a quoted fraction at or under the 10% line ("about 1 in 13"): a true statement the line calls out of sight. */
      fewPickedOut: withRows.filter((r) => r.contradiction && r.said === true).length,
      /** The plan lists it as out of sight where more than 10% can be picked out. */
      outOfSightOverLine: withRows.filter((r) => r.contradiction && r.said === false).length,
    },
    /** Plan claims that disagree with the model's own answer at the same moment (strict, 10%). Empty when the plan says what the tool said. */
    disagreements: withRows.filter((r) => r.contradiction).map((r) => ({
      face: r.case.face, day: r.case.day, moment: r.case.index + 1, scene: r.case.scene, concern: r.concern,
      planSaid: r.said ? "noticeable" : "out of sight", modelShare: round(r.truthShare, 3), sentences: r.case.texts[r.concern] ?? [],
      /** The sentence sits under notice but says the group is out of sight or lost: the name matching reads it as noticing. */
      readAsNoticeButSaysOutOfSight: r.said === true && (r.case.texts[r.concern] ?? []).some((t) => /\b(out of sight|lost)\b/i.test(t)),
    })),
  };

  // ---- what the two arms cost per moment, in effort
  const perMoment = (cs: Case[], rs: Row[]) => ({
    moments: cs.length,
    coversAdvised: rs.filter((r) => r.advice === "cover").length,
    coversPerMoment: round(rs.filter((r) => r.advice === "cover").length / Math.max(1, cs.length), 2),
    needlessCoversPerMoment: round(rs.filter((r) => r.overCover).length / Math.max(1, cs.length), 2),
    noticeablePerMoment: round(rs.filter((r) => r.truthNoticeable).length / Math.max(1, cs.length), 2),
  });

  const models = [...new Set([...withoutRuns.flatMap((r) => r.records.map((x) => x.modelId)), ...(fs.existsSync(path.join(RAW_DIR, "with")) ? agentRunsModel() : [])])].filter(Boolean);
  const efforts = [...new Set(withoutRuns.flatMap((r) => r.records.map((x) => x.effort)))];
  const targetCounts = Object.fromEntries(FACES.map((f) => [f, Object.fromEntries(truthFor(faceOf(f), { scene: "conversation" }).concerns.map((c) => [c.concern, c.targetCount]))]));
  const fixtureCost = sum(agentRuns.filter((r) => r.source === "fixture").map((r) => r.costUsd));

  return {
    meta: {
      model: models[0] ?? null,
      modelsSeen: models.length,
      effort: efforts.join(", "),
      faces: [...FACES],
      days: DAYS.map((d) => ({ id: d.id, text: d.text, callDevice: d.callDevice, agentPlan: d.recorded ? "recorded fixture" : "run here" })),
      truthThreshold: HEADLINE_THRESHOLD,
      concerns: CONCERN_IDS,
      /** Targets our model has for each concern on each face (the marks YouCam's masks found). */
      targetCounts,
      repeatsPerPair: 2,
      /** Calls in the 70-call cap: an agent run or an unaided call, plus cache-rejection repeats. */
      calls: spend.calls,
      agentRunsHere: spend.withRuns,
      unaidedCalls: spend.withoutCalls,
      cacheRejectionRepeats: spend.extraHttp,
      /** Every model request: the agent's turns count one each. */
      modelRequests: spend.requests,
      tokens: spend.tokens,
      estimatedCostUsd: round(spend.costUsd, 4),
      priceAssumptionUsdPerMillion: PRICE_PER_M,
      caps: { calls: MAX_CALLS, usd: MAX_COST_USD },
      reusedFixtureCostUsd: round(fixtureCost, 4),
    },
    headline,
    effortCheck,
    perMoment: { without: perMoment(woCases, withoutRows), with: perMoment(wCases, withRows) },
    byConcern,
    byConcernAll,
    byScene,
    byKind,
    byFace,
    sensitivity,
    unaided,
    agent,
  };
}

/** The model id the agent runs recorded (the fixtures do not carry one). */
function agentRunsModel(): string[] {
  const out: string[] = [];
  for (const face of FACES)
    for (const day of DAYS) {
      const f = withPath(face, day.id);
      if (fs.existsSync(f)) out.push(readJson<WithRecord>(f).modelId);
    }
  return out;
}

export type Summary = Awaited<ReturnType<typeof buildSummary>>;
export type { Meter };
