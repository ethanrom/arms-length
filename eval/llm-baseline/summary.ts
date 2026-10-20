/** Builds results/summary.json from the raw cache and the deterministic model. No network. */
import { createHash } from "node:crypto";
import { parseTestA, parseTestB, readRun } from "./answers";
import { allRecordFiles, PRICE_PER_M, readRecord, spendSoFar } from "./bedrock";
import { ourPersona, diskTruth, type OurConcern, type OurPersona } from "./ours";
import { patchSpecs, renderPatchRaw } from "./patches";
import { MODEL_ID, TEST_A_CONCERNS } from "./prompts";
import { factor, factorOutside, geometricMean, median, spread, type Spread } from "./stats";

const PERSONAS = ["p1a", "p2b", "p3a", "p5a"] as const;
const RUNS = 5;

export interface LlmCell extends Spread {
  /** Runs that answered null ("not present"). */
  nulls: number;
  /** Runs with a readable reply. */
  runs: number;
  values: (number | null)[];
}

export interface TestACell {
  persona: string;
  concern: string;
  llm: LlmCell;
  /** Our model on the same face; null if the concern has no targets on this face (not measured). */
  ours: OurConcern | null;
}

export interface TestBPatch {
  id: string;
  diameterMm: number;
  weberPct: number;
  realisedWeberPct: number;
  truth: { nominalM: number; boundM: number };
  llm: Spread & { values: number[]; maxOverMin: number };
  /** Median answer over the model's nominal distance (1 = exact; 2 = twice as far as the model says). */
  medianOverNominal: number;
  medianOverBound: number;
  /** Factor by which the median misses the nominal-to-bound range (1 = inside). */
  medianFactorOutsideRange: number;
  answersInsideRange: number;
}

export interface ScalingRow {
  weberPct: number;
  /** Ratio of median answers, 2 mm over 1 mm, and 4 mm over 2 mm. */
  llm2over1: number | null;
  llm4over2: number | null;
  /** Min and max over all 25 pairs (one answer from each size). */
  llm2over1Range: [number, number] | null;
  llm4over2Range: [number, number] | null;
  ours2over1: number;
  ours4over2: number;
}

export async function buildSummary() {
  const spend = spendSoFar();
  const failures = allFailures();

  // ---- Test A
  const ours1: Record<string, OurPersona> = {};
  const ours2: Record<string, OurPersona> = {};
  for (const p of PERSONAS) ours1[p] = await ourPersona(p);
  for (const p of PERSONAS) ours2[p] = await ourPersona(p);
  const j1 = JSON.stringify(ours1);
  const j2 = JSON.stringify(ours2);

  const testA: TestACell[] = [];
  for (const persona of PERSONAS) {
    for (const c of TEST_A_CONCERNS) {
      const runs = Array.from({ length: RUNS }, (_, i) => readRun("A", persona, i + 1, parseTestA)).filter((r) => r.value);
      const values = runs.map((r) => r.value![c.key]);
      const nums = values.filter((v): v is number => v !== null);
      testA.push({
        persona,
        concern: c.key,
        llm: { ...spread(nums), nulls: values.length - nums.length, runs: runs.length, values },
        ours: ours1[persona][c.ours] ?? null,
      });
    }
  }
  const cvs = testA.filter((c) => c.llm.n >= 2 && Number.isFinite(c.llm.cv)).map((c) => c.llm.cv);
  const mixedPresence = testA.filter((c) => c.llm.nulls > 0 && c.llm.n > 0).length;
  const ratios = testA.filter((c) => c.llm.n >= 2 && c.llm.min > 0).map((c) => c.llm.max / c.llm.min);

  // ---- Test B
  const specs = patchSpecs();
  const patches: TestBPatch[] = specs.map((s) => {
    const truth = diskTruth(s.diameterMm, s.contrast);
    const values = Array.from({ length: RUNS }, (_, i) => readRun("B", s.id, i + 1, parseTestB))
      .filter((r) => r.value)
      .map((r) => r.value!.distanceM);
    const sp = spread(values);
    return {
      id: s.id,
      diameterMm: s.diameterMm,
      weberPct: Math.round(s.contrast * 100),
      realisedWeberPct: Math.round(-renderPatchRaw(s).realisedWeber * 1e4) / 100,
      truth,
      llm: { ...sp, values, maxOverMin: sp.min > 0 ? sp.max / sp.min : NaN },
      medianOverNominal: factor(sp.median, truth.nominalM),
      medianOverBound: factor(sp.median, truth.boundM),
      medianFactorOutsideRange: factorOutside(sp.median, truth.nominalM, truth.boundM),
      answersInsideRange: values.filter((v) => v >= truth.nominalM && v <= truth.boundM).length,
    };
  });

  const byId = new Map(patches.map((p) => [p.id, p]));
  const pairRange = (a: number[], b: number[]): [number, number] | null => {
    const r = a.flatMap((x) => b.map((y) => y / x)).filter(Number.isFinite);
    return r.length ? [Math.min(...r), Math.max(...r)] : null;
  };
  const scaling: ScalingRow[] = [5, 15, 30].map((c) => {
    const p1 = byId.get(`d1mm_c${c}`)!;
    const p2 = byId.get(`d2mm_c${c}`)!;
    const p4 = byId.get(`d4mm_c${c}`)!;
    const r = (num: TestBPatch, den: TestBPatch) => (den.llm.median > 0 && num.llm.n ? num.llm.median / den.llm.median : null);
    return {
      weberPct: c,
      llm2over1: r(p2, p1),
      llm4over2: r(p4, p2),
      llm2over1Range: pairRange(p1.llm.values, p2.llm.values),
      llm4over2Range: pairRange(p2.llm.values, p4.llm.values),
      ours2over1: p2.truth.nominalM / p1.truth.nominalM,
      ours4over2: p4.truth.nominalM / p2.truth.nominalM,
    };
  });

  const all = patches.flatMap((p) => p.llm.values.map((v) => ({ v, p })));
  const readable = patches.filter((p) => p.llm.n > 0 && p.llm.median > 0);
  const answerFactors = all.filter((a) => a.v > 0).map((a) => Math.max(a.v / a.p.truth.nominalM, a.p.truth.nominalM / a.v));

  return {
    meta: {
      model: MODEL_ID,
      platform: "Amazon Bedrock Converse API, maxTokens 4000, no sampling or thinking parameters",
      calls: spend.calls,
      unreadableRuns: failures,
      tokens: { input: spend.usage.inputTokens, output: spend.usage.outputTokens },
      estimatedCostUsd: Math.round(spend.costUsd * 1000) / 1000,
      priceAssumptionUsdPerMillion: PRICE_PER_M,
      note: "Cost uses list price; Bedrock billing may differ.",
    },
    groundTruth:
      "Published Watson & Ahumada (2005) Standard A model, validated against ModelFest observers (0.69 dB RMS over 41 analytic stimuli), via lib/vision with DEFAULT_VIEWING (45 cd/m2, 20/20). nominal = average observer (marginDb 0); bound = one-sided bound (marginDb 6, luminance factor max(1, g)). Not capped at the 10 m contract limit. The luminance factor that moves the 30 cd/m2 ModelFest thresholds to 45 cd/m2 is an unverified heuristic in the model.",
    testA: {
      cells: testA,
      oursDeterminism: { rerunIdentical: j1 === j2, sha256: createHash("sha256").update(j1).digest("hex") },
      aggregate: {
        cellsWithSpread: cvs.length,
        medianCv: median(cvs),
        meanCv: cvs.reduce((a, b) => a + b, 0) / cvs.length,
        medianMaxOverMin: median(ratios),
        worstMaxOverMin: Math.max(...ratios),
        cellsWhereRunsDisagreeOnPresence: mixedPresence,
      },
    },
    testB: {
      patches,
      scaling,
      aggregate: {
        patchesAnswered: readable.length,
        geometricMeanFactorOfMedianVsNominal: geometricMean(readable.map((p) => Math.max(p.medianOverNominal, 1 / p.medianOverNominal))),
        geometricMeanFactorOfAnswersVsNominal: answerFactors.length ? geometricMean(answerFactors) : NaN,
        worstFactorOfMedianVsNominal: Math.max(...readable.map((p) => Math.max(p.medianOverNominal, 1 / p.medianOverNominal))),
        answersInsideModelRange: all.filter((a) => a.v >= a.p.truth.nominalM && a.v <= a.p.truth.boundM).length,
        answersTotal: all.length,
        medianCv: median(patches.filter((p) => Number.isFinite(p.llm.cv)).map((p) => p.llm.cv)),
        meanScalingRatio: {
          llm2over1: mean(scaling.map((s) => s.llm2over1)),
          llm4over2: mean(scaling.map((s) => s.llm4over2)),
          ideal: 2,
        },
      },
    },
  };
}

const mean = (xs: (number | null)[]): number => {
  const v = xs.filter((x): x is number => x !== null);
  return v.reduce((a, b) => a + b, 0) / v.length;
};

/** Runs whose replies could not be read (after the one allowed retry), and every API error, for transparency. */
function allFailures(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of allRecordFiles()) {
    const r = readRecord(f);
    if (r.error) out.push(`${r.test}/${r.item}/run${r.run}/a${r.attempt}: ${r.error}`);
    const key = `${r.test}/${r.item}/${r.run}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const run = r.test === "A" ? readRun("A", r.item, r.run, parseTestA) : readRun("B", r.item, r.run, parseTestB);
    if (!run.value) out.push(`${key}: no readable answer after ${run.attempts} call(s)`);
  }
  return out;
}

export type Summary = Awaited<ReturnType<typeof buildSummary>>;
