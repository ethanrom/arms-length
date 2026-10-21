/**
 * Head-to-head: Claude Opus 5.5 on Amazon Bedrock versus our visibility model.
 *
 *   npm run spike -- eval/llm-baseline/run.ts                 call the model for every uncached item, then write results
 *   npm run spike -- eval/llm-baseline/run.ts --limit=3       make at most 3 new calls (smoke test)
 *   npm run spike -- eval/llm-baseline/run.ts --only=B        only Test B (or A)
 *   npx tsx eval/llm-baseline/run.ts --offline                no network: rebuild summary.json, chart.svg, ai-comparison.svg, prompts.md from the cache
 *   npx tsx eval/llm-baseline/run.ts --prompts                write prompts.md only
 *
 * Idempotent: every reply is cached under results/raw/ and an item with a cached reply is never called again. Budget:
 * at most 80 calls and an estimated $5 at list price, checked before every call; at most one retry per run.
 */
import fs from "node:fs";
import path from "node:path";
import { nextAttempt, parseTestA, parseTestB } from "./answers";
import { callOnce, costOf, MAX_CALLS, MAX_COST_USD, spendSoFar } from "./bedrock";
import { patchSpecs, renderPatchPng, type PatchSpec } from "./patches";
import { promptsMarkdown, testAPrompt, testBPrompt } from "./prompts";
import { buildSummary } from "./summary";
import { renderChart, RESEARCH_LABELS, SITE_LABELS } from "./chart";

export const PERSONAS = ["p1a", "p2b", "p3a", "p5a"] as const;
export const RUNS = 5;
const OUT = path.join(import.meta.dirname, "results");
/** The copy /how-it-works shows. It carries a generic model label; the research chart in results/ names the model. */
const SITE_CHART = path.join(import.meta.dirname, "../../public/charts/ai-comparison.svg");
/** Worst case for one call at list price: ~3k input tokens and the full 4000 output tokens. Used to hold budget for calls in flight. */
const WORST_CASE_USD = (3000 * 4 + 4000 * 20) / 1e6;
const CONCURRENCY = 3;
/** Errors that mean the setup is wrong, so a second try would waste a call. */
const SETUP_ERRORS = /ValidationException|AccessDenied|UnrecognizedClient|ResourceNotFound|ExpiredToken|InvalidSignature/;

interface Task {
  test: "A" | "B";
  item: string;
  run: number;
  imageFormat: "jpeg" | "png";
  prompt: string;
  image: () => Promise<Buffer>;
}

function buildTasks(only?: string): Task[] {
  const tasks: Task[] = [];
  const specs = patchSpecs();
  // Run-major order, so a budget stop leaves every item with the same number of runs.
  for (let run = 1; run <= RUNS; run++) {
    if (only !== "B")
      for (const p of PERSONAS)
        tasks.push({ test: "A", item: p, run, imageFormat: "jpeg", prompt: testAPrompt(), image: async () => fs.readFileSync(path.join("fixtures/youcam", p, "input.jpg")) });
    if (only !== "A")
      for (const s of specs) tasks.push(patchTask(s, run));
  }
  return tasks;
}

function patchTask(s: PatchSpec, run: number): Task {
  return {
    test: "B",
    item: s.id,
    run,
    imageFormat: "png",
    prompt: testBPrompt(s.diameterMm, Math.round(s.contrast * 100)),
    image: () => renderPatchPng(s),
  };
}

const parserOf = (t: Task): ((text: string | undefined) => object | null) => (t.test === "A" ? parseTestA : parseTestB);

async function callModel(limit: number, only?: string): Promise<void> {
  const todo = buildTasks(only);
  let made = 0;
  let inflight = 0;
  let aborted = false;
  let cursor = 0;

  const budgetOk = (): boolean => {
    const { calls, costUsd } = spendSoFar();
    if (calls + inflight >= MAX_CALLS) return false;
    if (costUsd + (inflight + 1) * WORST_CASE_USD > MAX_COST_USD) return false;
    return made < limit;
  };

  async function worker(): Promise<void> {
    while (!aborted) {
      const t = todo[cursor++];
      if (!t) return;
      let attempt = nextAttempt(t.test, t.item, t.run, parserOf(t));
      while (attempt > 0 && !aborted) {
        if (!budgetOk()) {
          aborted = true;
          console.log("stopping: call or cost budget (or --limit) reached");
          return;
        }
        inflight++;
        made++;
        const rec = await callOnce({ test: t.test, item: t.item, run: t.run, attempt, image: await t.image(), imageFormat: t.imageFormat, prompt: t.prompt });
        inflight--;
        const ok = parserOf(t)(rec.text) !== null;
        console.log(
          `${t.test} ${t.item} run${t.run} a${attempt}: ${rec.error ? `ERROR ${rec.error}` : `${rec.stopReason} in=${rec.usage?.inputTokens} out=${rec.usage?.outputTokens} $${costOf(rec.usage).toFixed(4)} ${rec.latencyMs}ms ${ok ? "ok" : "UNREADABLE"}`}`,
        );
        if (rec.error && SETUP_ERRORS.test(rec.error)) {
          aborted = true;
          console.log("stopping: setup error, not retrying");
          return;
        }
        attempt = nextAttempt(t.test, t.item, t.run, parserOf(t));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const s = spendSoFar();
  console.log(`calls so far: ${s.calls}/${MAX_CALLS}, tokens in ${s.usage.inputTokens} out ${s.usage.outputTokens}, estimated $${s.costUsd.toFixed(3)} at list price`);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  fs.mkdirSync(OUT, { recursive: true });

  fs.writeFileSync(path.join(import.meta.dirname, "prompts.md"), promptsMarkdown());
  if (args.includes("--prompts")) return;

  if (!args.includes("--offline")) {
    const limit = flag("limit") ? parseInt(flag("limit")!, 10) : Infinity;
    await callModel(limit, flag("only"));
  }

  const summary = await buildSummary();
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "chart.svg"), renderChart(summary, RESEARCH_LABELS));
  fs.writeFileSync(SITE_CHART, renderChart(summary, SITE_LABELS));
  fs.mkdirSync(path.join(OUT, "patches"), { recursive: true });
  for (const s of patchSpecs()) fs.writeFileSync(path.join(OUT, "patches", `${s.id}.png`), await renderPatchPng(s));
  console.log("wrote summary.json, chart.svg, public/charts/ai-comparison.svg, patches/ and prompts.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
