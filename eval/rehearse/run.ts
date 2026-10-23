/**
 * Does the model need our numbers? The same model, with and without them, on the same days, scored against our model.
 *
 *   npm run spike -- eval/rehearse/run.ts                 call the model for every uncached item, then write results
 *   npm run spike -- eval/rehearse/run.ts --limit=3       make at most 3 new calls (smoke test)
 *   npm run spike -- eval/rehearse/run.ts --only=with     only the agent runs (or --only=without, or --only=high)
 *   npx tsx eval/rehearse/run.ts --offline                no network: rebuild summary.json, prompts.md and README.md from the cache
 *   npx tsx eval/rehearse/run.ts --prompts                write prompts.md only
 *
 * Idempotent: every finished item is cached under results/raw/ and never called again. Hard caps, checked before every call:
 * 70 calls (one agent run or one unaided-model call each; see store.ts) and an estimated $5. A cap stops the run and leaves
 * what it has. The 12 agent plans for the example days are not run: they are read from fixtures/rehearse/.
 */
import fs from "node:fs";
import path from "node:path";
import { effortOf, callWithout, modelId, runWith } from "./call";
import { DAYS, FACES, HIGH_EFFORT_DAYS, type EvalDay } from "./days";
import { parseReply, promptsMarkdown, systemPrompt, userText } from "./prompts";
import { MAX_CALLS, MAX_COST_USD, spendSoFar, withPath, withoutPath, writeJson, type Arm } from "./store";

const OUT = path.join(import.meta.dirname, "results");
const PHOTO = (face: string) => path.join("public", "demo", face, "photo.jpg");
/** Worst case for one unit at the assumed prices, held for every call in flight. */
const WORST_CASE_USD = { with: 0.25, without: 0.12, high: 0.2 } as const;
const CONCURRENCY = 3;
const RUNS = 2;
/** Errors that mean the setup is wrong, so another try would waste a call. */
const SETUP_ERRORS = /ValidationException|AccessDenied|UnrecognizedClient|ResourceNotFound|ExpiredToken|InvalidSignature|not set/;

interface Task {
  kind: "with" | "without" | "high";
  face: string;
  day: EvalDay;
  run: number;
}

const label = (t: Task) => `${t.kind} ${t.face}/${t.day.id}${t.kind === "with" ? "" : ` run${t.run}`}`;
const armOf = (t: Task): Arm => (t.kind === "high" ? "without-high" : "without");

function buildTasks(only?: string): Task[] {
  const tasks: Task[] = [];
  if (only !== "without")
    for (const face of FACES) for (const day of DAYS) if (!day.recorded) tasks.push({ kind: "with", face, day, run: 1 });
  if (!only || only === "without") for (const face of FACES) for (const day of DAYS) for (let run = 1; run <= RUNS; run++) tasks.push({ kind: "without", face, day, run });
  if (!only || only === "high") for (const face of FACES) for (const day of DAYS) if (HIGH_EFFORT_DAYS.includes(day.id)) tasks.push({ kind: "high", face, day, run: 1 });
  return tasks;
}

/** 0: finished (a readable reply, or two attempts); otherwise the number of the next attempt. */
function nextAttempt(face: string, dayId: string, run: number, arm: Arm = "without"): number {
  let attempts = 0;
  for (let k = 1; k <= 2; k++) {
    const f = withoutPath(face, dayId, run, k, arm);
    if (!fs.existsSync(f)) continue;
    attempts++;
    const rec = JSON.parse(fs.readFileSync(f, "utf8")) as { text?: string };
    if (parseReply(rec.text)) return 0;
  }
  return attempts >= 2 ? 0 : attempts + 1;
}

const done = (t: Task): boolean => (t.kind === "with" ? fs.existsSync(withPath(t.face, t.day.id)) : nextAttempt(t.face, t.day.id, t.run, armOf(t)) === 0);

async function callModel(limit: number, only?: string): Promise<void> {
  const todo = buildTasks(only).filter((t) => !done(t));
  console.log(`${todo.length} items to call (${todo.filter((t) => t.kind === "with").length} agent runs, ${todo.filter((t) => t.kind !== "with").length} unaided calls)`);
  let made = 0;
  let inflight = 0;
  let inflightUsd = 0;
  let aborted = false;
  const system = systemPrompt();

  const budgetOk = (kind: Task["kind"]): boolean => {
    const { calls, costUsd } = spendSoFar();
    if (calls + inflight >= MAX_CALLS) return false;
    if (costUsd + inflightUsd + WORST_CASE_USD[kind] > MAX_COST_USD) return false;
    return made < limit;
  };

  async function runOne(t: Task): Promise<void> {
    if (t.kind === "with") {
      if (!budgetOk("with")) return void (aborted = true, console.log("stopping: call or cost cap (or --limit) reached"));
      inflight++;
      inflightUsd += WORST_CASE_USD.with;
      made++;
      try {
        const rec = await runWith(t.face, t.day);
        console.log(`${label(t)}: ${rec.outcome} in ${(rec.ms / 1000).toFixed(1)}s, ${rec.requests} requests, ${rec.toolCalls} tool calls, repairs ${rec.plan.stats.repairs}, in ${rec.meter.input} cacheR ${rec.meter.cacheRead} cacheW ${rec.meter.cacheWrite} out ${rec.meter.output}, $${rec.costUsd.toFixed(4)}, recheck issues ${rec.recheck.length}`);
        if (rec.requests === 0) {
          aborted = true;
          console.log("stopping: the agent made no model request, so nothing was recorded (setup problem)");
        } else writeJson(withPath(t.face, t.day.id), rec);
      } finally {
        inflight--;
        inflightUsd -= WORST_CASE_USD.with;
      }
      return;
    }
    let attempt = nextAttempt(t.face, t.day.id, t.run, armOf(t));
    while (attempt > 0 && !aborted) {
      if (!budgetOk(t.kind)) return void (aborted = true, console.log("stopping: call or cost cap (or --limit) reached"));
      inflight++;
      inflightUsd += WORST_CASE_USD[t.kind];
      made++;
      let rec;
      try {
        rec = await callWithout({ face: t.face, day: t.day.id, run: t.run, attempt, image: fs.readFileSync(PHOTO(t.face)), system, text: userText(t.day.text, t.day.callDevice), ...(t.kind === "high" ? { effort: "high" as const } : {}) });
      } finally {
        inflight--;
        inflightUsd -= WORST_CASE_USD[t.kind];
      }
      writeJson(withoutPath(t.face, t.day.id, t.run, attempt, armOf(t)), rec);
      const parsed = parseReply(rec.text);
      console.log(
        `${label(t)} a${attempt}: ${rec.error ? `ERROR ${rec.error}` : `${rec.stopReason} in ${rec.meter?.input} cacheR ${rec.meter?.cacheRead} cacheW ${rec.meter?.cacheWrite} out ${rec.meter?.output} $${rec.costUsd.toFixed(4)} ${(rec.latencyMs / 1000).toFixed(1)}s ${parsed ? `ok, ${parsed.length} moments` : "UNREADABLE"}`}`,
      );
      if (rec.error && SETUP_ERRORS.test(rec.error)) {
        aborted = true;
        console.log("stopping: setup error, not retrying");
        return;
      }
      attempt = nextAttempt(t.face, t.day.id, t.run, armOf(t));
    }
  }

  // The first item of each (kind, face) group goes alone so the prompt cache is written before the others read it.
  const groups = new Map<string, Task[]>();
  for (const t of todo) {
    const key = `${t.kind}:${t.kind === "with" ? "all" : t.face}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  for (const tasks of groups.values()) {
    if (aborted) break;
    const [first, ...rest] = tasks;
    await runOne(first);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (!aborted) {
          const t = rest[cursor++];
          if (!t) return;
          await runOne(t);
        }
      }),
    );
  }
  const s = spendSoFar();
  console.log(`calls so far: ${s.calls}/${MAX_CALLS} (${s.withRuns} agent runs, ${s.withoutCalls} unaided calls, ${s.extraHttp} cache-rejection repeats), ${s.requests} model requests, estimated $${s.costUsd.toFixed(3)} of $${MAX_COST_USD}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  fs.mkdirSync(OUT, { recursive: true });

  fs.writeFileSync(path.join(import.meta.dirname, "prompts.md"), promptsMarkdown("Claude Sonnet 5.5 (the model in `CLAUDE_AWS_MODEL`)"));
  if (args.includes("--prompts")) return;

  if (!args.includes("--offline")) {
    const limit = flag("limit") ? parseInt(flag("limit")!, 10) : Infinity;
    console.log(`model ${modelId() ? "configured" : "NOT configured"}, effort ${effortOf()}`);
    await callModel(limit, flag("only"));
  }
  if (args.includes("--calls-only")) return;

  const { buildSummary } = await import("./summary");
  const { renderReadme } = await import("./readme");
  const summary = await buildSummary();
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(path.join(import.meta.dirname, "README.md"), renderReadme(summary));
  console.log("wrote summary.json, prompts.md and README.md");
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
