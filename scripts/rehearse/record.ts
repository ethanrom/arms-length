/**
 * Records the replay fixtures for "Rehearse your day": the real agent loop (Claude Sonnet 5.5 on Bedrock, the real tools) on
 * each demo face for each example day. Writes fixtures/rehearse/<demoId>/<exampleId>.json (steps + the verified plan) and
 * appends every attempt to fixtures/rehearse/usage.json (tokens, estimated cost, latency, verifier outcome).
 *
 * Run: npm run spike -- scripts/rehearse/record.ts [--faces p2b,p3a] [--days workday,presenting] [--force]
 * Budget: at most 20 real runs and $1.50 in total, counted across invocations from usage.json. It stops at either cap.
 * A run that ends in the deterministic fallback is not written as a fixture; its plan goes to the friction folder to read.
 * Never prints credentials or environment values.
 */
import fs from "node:fs";
import path from "node:path";
import { EXAMPLE_DAYS, type DayPlan, type ToolName } from "@/lib/contracts";
import { bedrockConfigured, createBedrockClient } from "@/lib/agent/llm";
import { runAgent } from "@/lib/agent/loop";
import { faceFromBundle, realEngine } from "@/lib/agent/realEngine";
import { DEMO_IDS, loadBundle } from "@/lib/integration/demo";
import type { LlmClient } from "@/lib/agent/types";
import { verifyPlan } from "@/lib/agent/verify";

const MAX_RUNS = 20;
const MAX_COST_USD = 1.5;
/**
 * Claude Sonnet 5.5 on Bedrock, USD per million tokens: the brief's $2 in and $10 out, and Anthropic's standard prompt-cache
 * multipliers (a read is 0.1x the input price, a write 1.25x). The adapter caches the tools, system prompt and history.
 */
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
/** Stop before a run that could take the total past the cap: one run costs about this much at most. */
const RUN_MARGIN_USD = 0.12;

const root = process.cwd();
const fixtureDir = path.join(root, "fixtures", "rehearse");
const usageFile = path.join(fixtureDir, "usage.json");
const failedDir = "E:/hackathons/youcam-api/internal/friction/rehearse-agent-failed";

interface Attempt {
  at: string;
  demoId: string;
  exampleId: string;
  ms: number;
  turns: number;
  toolCalls: number;
  repairs: number;
  /** Every prompt token processed, cached or not. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  verified: boolean;
  issues: number;
  written: boolean;
}

interface Usage {
  attempts: Attempt[];
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface Meter {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const cost = (m: Meter) => (m.input * PRICE.input + m.output * PRICE.output + m.cacheRead * PRICE.cacheRead + m.cacheWrite * PRICE.cacheWrite) / 1_000_000;

function readUsage(): Usage {
  try {
    return JSON.parse(fs.readFileSync(usageFile, "utf8")) as Usage;
  } catch {
    return { attempts: [] };
  }
}

function summarise(usage: Usage) {
  const runs = usage.attempts.length;
  const spent = usage.attempts.reduce((sum, a) => sum + a.costUsd, 0);
  const verified = usage.attempts.filter((a) => a.verified).length;
  const ms = usage.attempts.map((a) => a.ms).sort((a, b) => a - b);
  const median = ms.length ? ms[Math.floor((ms.length - 1) / 2)] : 0;
  return { runs, spent: Number(spent.toFixed(4)), verified, fallback: runs - verified, medianMs: median };
}

function show(plan: DayPlan): void {
  for (const m of plan.moments) {
    console.log(`  [${m.id}] ${m.time ?? "-"} | ${m.title} | ${m.scene.scene}/${m.scene.light ?? "default"}${m.scene.call ? ` call ${m.scene.call.device} ${m.scene.call.cameraDistanceCm}cm ${m.scene.call.layout}` : ""}`);
    for (const a of m.assumptions) console.log(`      assumes: ${a}`);
    for (const c of m.outOfSight) console.log(`      OUT  ${c.text}  <${c.refs.join(",")}>`);
    for (const c of m.notice) console.log(`      SEE  ${c.text}  <${c.refs.join(",")}>`);
    console.log(`      ACT  ${m.action.kind}${"ref" in m.action ? `(${m.action.ref})` : ""}: ${m.action.claim.text}  <${m.action.claim.refs.join(",")}>`);
  }
  console.log(`  SUMMARY ${plan.summary.text}  <${plan.summary.refs.join(",")}>`);
}

async function main(): Promise<void> {
  if (!bedrockConfigured(process.env)) {
    console.error("CLAUDE_AWS_* is not set in .env (region, access key, secret key, model). Nothing was run.");
    process.exit(1);
  }
  const faces = (arg("faces")?.split(",") ?? [...DEMO_IDS]).filter((id) => (DEMO_IDS as readonly string[]).includes(id));
  const days = EXAMPLE_DAYS.filter((d) => !arg("days") || arg("days")?.split(",").includes(d.id));
  const force = process.argv.includes("--force");
  /** --only p5a/wedding,p3a/workday: exactly these combinations. */
  const only = arg("only")?.split(",");

  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.mkdirSync(failedDir, { recursive: true });
  const usage = readUsage();
  const bedrock = createBedrockClient(process.env);
  const meter: Meter = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const llm: LlmClient = {
    async converse(request) {
      const res = await bedrock.converse(request);
      meter.input += res.usage.inputTokens;
      meter.output += res.usage.outputTokens;
      meter.cacheRead += res.usage.cacheReadTokens ?? 0;
      meter.cacheWrite += res.usage.cacheWriteTokens ?? 0;
      return res;
    },
  };

  for (const demoId of faces) {
    const bundle = loadBundle(demoId);
    if (!bundle) continue;
    const face = faceFromBundle(bundle);
    for (const example of days) {
      if (only && !only.includes(`${demoId}/${example.id}`)) continue;
      const file = path.join(fixtureDir, demoId, `${example.id}.json`);
      if (!force && fs.existsSync(file)) {
        console.log(`skip ${demoId}/${example.id}: already recorded (use --force)`);
        continue;
      }
      const totals = summarise(usage);
      if (totals.runs >= MAX_RUNS || totals.spent + RUN_MARGIN_USD > MAX_COST_USD) {
        console.log(`STOP: cap reached (${totals.runs} runs, $${totals.spent} spent).`);
        return finish(usage);
      }

      const steps: { tool: ToolName; label: string }[] = [];
      const prefs = { callDevice: "laptop" as const, noMakeup: false };
      Object.assign(meter, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      const started = Date.now();
      const plan = await runAgent({
        face,
        request: { day: example.day, prefs },
        llm,
        engine: realEngine,
        emit: (e) => {
          if (e.type === "step") steps.push({ tool: e.tool, label: e.label });
        },
        budgetMs: 55_000,
      });
      const ms = Date.now() - started;
      const recheck = plan.verified ? verifyPlan({ moments: plan.moments, summary: plan.summary }, plan.results, prefs) : [];
      const ok = plan.verified && recheck.length === 0;
      const attempt: Attempt = {
        at: new Date().toISOString(),
        demoId,
        exampleId: example.id,
        ms,
        turns: plan.stats.turns,
        toolCalls: plan.stats.toolCalls,
        repairs: plan.stats.repairs,
        inputTokens: plan.stats.inputTokens,
        outputTokens: plan.stats.outputTokens,
        cacheReadTokens: meter.cacheRead,
        cacheWriteTokens: meter.cacheWrite,
        costUsd: Number(cost(meter).toFixed(4)),
        verified: ok,
        issues: plan.issues.length,
        written: false,
      };

      console.log(`\n== ${demoId} / ${example.id}: ${ok ? "VERIFIED" : "FALLBACK"} in ${(ms / 1000).toFixed(1)}s, ${attempt.turns} turns, ${attempt.toolCalls} tool calls, repairs ${attempt.repairs}, ${attempt.inputTokens} in (${attempt.cacheReadTokens} cache read, ${attempt.cacheWriteTokens} written) / ${attempt.outputTokens} out, ${attempt.costUsd}`);
      for (const issue of plan.issues) console.log(`  issue ${issue.momentId ?? "-"} [${issue.code}] ${issue.detail}`);
      show(plan);

      if (ok) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify({ recordedAt: attempt.at, model: "Claude Sonnet 5.5 via Amazon Bedrock", steps, plan }, null, 2)}\n`);
        attempt.written = true;
      } else {
        fs.writeFileSync(path.join(failedDir, `${demoId}-${example.id}.json`), JSON.stringify({ steps, plan }, null, 2));
      }
      usage.attempts.push(attempt);
      fs.writeFileSync(usageFile, `${JSON.stringify({ ...usage, totals: summarise(usage), prices: { inputPerMTokUsd: PRICE.input, outputPerMTokUsd: PRICE.output, cacheReadPerMTokUsd: PRICE.cacheRead, cacheWritePerMTokUsd: PRICE.cacheWrite } }, null, 2)}\n`);
    }
  }
  finish(usage);
}

function finish(usage: Usage): void {
  console.log(`\nTotals: ${JSON.stringify(summarise(usage))}`);
}

main().catch((error) => {
  console.error(`record failed: ${error instanceof Error ? error.name : typeof error}`);
  process.exit(1);
});
