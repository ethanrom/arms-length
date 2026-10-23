/**
 * The on-disk cache and the spend ledger. One file per finished unit of work, never called again once it exists:
 *
 *   results/raw/with/<face>/<day>.json                  one agent run (several model turns inside)
 *   results/raw/without/<face>/<day>/run<N>.a<K>.json   one call of the unaided model (K = 1, or 2 for the one retry)
 *   results/raw/without-high/<face>/<day>/run1.a<K>.json  the same at high effort, on a few pairs (the "did we under-think it?" check)
 *
 * A "call" in the 70-call cap is one agent run or one unaided-model call (plus any extra HTTP request a call needed because the
 * account rejected prompt-cache points). The model turns inside an agent run are counted separately as `requests`.
 */
import fs from "node:fs";
import path from "node:path";
import type { DayPlan, ToolName, VerifierIssue } from "../../lib/contracts/rehearse";

export const RAW_DIR = path.join(import.meta.dirname, "results", "raw");
export const MAX_CALLS = 70;
export const MAX_COST_USD = 5;

/**
 * Claude Sonnet 5.5 on Bedrock, dollars per million tokens: the brief's $2 in and $10 out, and Anthropic's standard prompt-cache
 * multipliers (a read is 0.1x the input price, a write 1.25x), as scripts/rehearse/record.ts uses. Bedrock billing may differ.
 */
export const PRICE_PER_M = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } as const;

export interface Meter {
  /** Input tokens not served from or written to the cache. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const emptyMeter = (): Meter => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
export const costOf = (m: Meter): number =>
  (m.input * PRICE_PER_M.input + m.output * PRICE_PER_M.output + m.cacheRead * PRICE_PER_M.cacheRead + m.cacheWrite * PRICE_PER_M.cacheWrite) / 1e6;

export type Outcome = "verified" | "repaired" | "fallback";

export interface WithRecord {
  kind: "with";
  face: string;
  day: string;
  dayText: string;
  callDevice: "laptop" | "phone";
  modelId: string;
  effort: string;
  at: string;
  ms: number;
  /** Model turns (HTTP requests) inside the run. */
  requests: number;
  toolCalls: number;
  meter: Meter;
  costUsd: number;
  outcome: Outcome;
  steps: { tool: ToolName; label: string }[];
  plan: DayPlan;
  /** verifyPlan run again on the plan as shipped, against the plan's own results. */
  recheck: VerifierIssue[];
}

export interface WithoutRecord {
  kind: "without";
  face: string;
  day: string;
  run: number;
  attempt: number;
  modelId: string;
  effort: string;
  at: string;
  latencyMs: number;
  imageSha256: string;
  cache: boolean;
  /** 2 when the first request was rejected for its cache points and repeated without them. */
  httpCalls: number;
  stopReason?: string;
  meter?: Meter;
  costUsd: number;
  text?: string;
  blocks?: string[];
  error?: string;
}

export const withPath = (face: string, day: string): string => path.join(RAW_DIR, "with", face, `${day}.json`);
export type Arm = "without" | "without-high";
export const withoutPath = (face: string, day: string, run: number, attempt: number, arm: Arm = "without"): string =>
  path.join(RAW_DIR, arm, face, day, `run${run}.a${attempt}.json`);

export const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : e.name.endsWith(".json") ? [path.join(dir, e.name)] : []));
}

export const allWith = (): WithRecord[] => filesUnder(path.join(RAW_DIR, "with")).sort().map((f) => readJson<WithRecord>(f));
export const allWithout = (arm: Arm = "without"): WithoutRecord[] => filesUnder(path.join(RAW_DIR, arm)).sort().map((f) => readJson<WithoutRecord>(f));

export interface Spend {
  calls: number;
  withRuns: number;
  withoutCalls: number;
  extraHttp: number;
  /** Model requests in total: agent turns plus unaided calls plus cache-rejection repeats. */
  requests: number;
  costUsd: number;
  tokens: Meter;
}

export function spendSoFar(): Spend {
  const s: Spend = { calls: 0, withRuns: 0, withoutCalls: 0, extraHttp: 0, requests: 0, costUsd: 0, tokens: emptyMeter() };
  const add = (m: Meter | undefined) => {
    if (!m) return;
    for (const k of Object.keys(s.tokens) as (keyof Meter)[]) s.tokens[k] += m[k];
  };
  for (const r of allWith()) {
    s.calls++;
    s.withRuns++;
    s.requests += r.requests;
    s.costUsd += r.costUsd;
    add(r.meter);
  }
  for (const r of [...allWithout(), ...allWithout("without-high")]) {
    s.calls += r.httpCalls;
    s.withoutCalls++;
    s.extraHttp += r.httpCalls - 1;
    s.requests += r.httpCalls;
    s.costUsd += r.costUsd;
    add(r.meter);
  }
  return s;
}
