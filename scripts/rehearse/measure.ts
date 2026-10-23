/**
 * Measures live Rehearse runs on custom days (not the example days, so the recordings never answer): latency, turns, tool calls,
 * tokens, repairs and outcome for each, the median, and the plans' headlines. Real Bedrock calls cost real money: keep the list short.
 *
 * Direct (exact cost, the loop with the real client):
 *   npm run spike -- scripts/rehearse/measure.ts [--only p1a/1,p2b/2]
 * Through a running server (end to end, cost estimated from tokens):
 *   AGENT_ENABLED=1 npx next start -p 3240   then   npm run spike -- scripts/rehearse/measure.ts --route http://localhost:3240 [--only p1a/1]
 * Never prints credentials or environment values.
 */
import type { DayPlan, RehearseEvent } from "@/lib/contracts";
import { bedrockConfigured, createBedrockClient } from "@/lib/agent/llm";
import { runAgent } from "@/lib/agent/loop";
import { faceFromBundle, realEngine } from "@/lib/agent/realEngine";
import type { LlmClient } from "@/lib/agent/types";
import { loadBundle } from "@/lib/integration/demo";

const DAYS: { id: string; face: string; day: string }[] = [
  { id: "p1a/1", face: "p1a", day: "Zoom with the design team at 10, a quiet coffee with an old friend at 3, and a family dinner at 8" },
  { id: "p1a/2", face: "p1a", day: "A job interview over video in the morning, a walking chat with my mentor in the park at noon, drinks with the team after work" },
  { id: "p2b/1", face: "p2b", day: "Standup on a video call first thing, lunch with a client by the window, then I present to the whole office at 3" },
  { id: "p2b/2", face: "p2b", day: "Video call with my landlord, coffee at the corner cafe with a friend, then dancing at a birthday party tonight" },
  { id: "p5a/1", face: "p5a", day: "Online class at 9, a business lunch with a new client, a quiet dinner at home with my partner" },
  { id: "p5a/2", face: "p5a", day: "A pitch to investors over Zoom, a catch-up coffee with my sister, and the wedding rehearsal dinner" },
];

/** USD per million tokens: the brief's $2 in, $10 out, and the standard prompt-cache factors. */
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const prefs = { callDevice: "laptop" as const, noMakeup: false };

interface Result {
  id: string;
  ms: number;
  plan: DayPlan;
  costUsd: number;
}

async function direct(id: string, face: string, day: string, llm: LlmClient, meter: { input: number; output: number; cacheRead: number; cacheWrite: number }): Promise<Result> {
  const bundle = loadBundle(face);
  if (!bundle) throw new Error(`no demo face ${face}`);
  Object.assign(meter, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  const started = Date.now();
  const plan = await runAgent({ face: faceFromBundle(bundle), request: { day, prefs }, llm, engine: realEngine, emit: () => undefined, budgetMs: 50_000 });
  const costUsd = (meter.input * PRICE.input + meter.output * PRICE.output + meter.cacheRead * PRICE.cacheRead + meter.cacheWrite * PRICE.cacheWrite) / 1_000_000;
  return { id, ms: Date.now() - started, plan, costUsd };
}

async function viaRoute(id: string, face: string, day: string, base: string): Promise<Result> {
  const started = Date.now();
  const res = await fetch(`${base}/api/rehearse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ face: { demoId: face }, day, prefs }) });
  const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as RehearseEvent);
  const last = events[events.length - 1];
  if (last?.type !== "plan") throw new Error(`${id}: ${last?.type === "error" ? last.code : "no plan"}`);
  const { inputTokens, outputTokens } = last.plan.stats;
  // Without the cache split, price every prompt token at the cache-read rate the loop mostly gets (about 85% reads) plus writes.
  const costUsd = (inputTokens * (0.85 * PRICE.cacheRead + 0.1 * PRICE.cacheWrite + 0.05 * PRICE.input) + outputTokens * PRICE.output) / 1_000_000;
  return { id, ms: Date.now() - started, plan: last.plan, costUsd };
}

async function main(): Promise<void> {
  const route = arg("route");
  if (!route && !bedrockConfigured(process.env)) {
    console.error("CLAUDE_AWS_* is not set in .env. Nothing was run.");
    process.exit(1);
  }
  const only = arg("only")?.split(",");
  const bedrock = createBedrockClient(process.env);
  const meter = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
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

  const results: Result[] = [];
  for (const { id, face, day } of DAYS) {
    if (only && !only.includes(id)) continue;
    const r = route ? await viaRoute(id, face, day, route) : await direct(id, face, day, llm, meter);
    results.push(r);
    const s = r.plan.stats;
    console.log(`\n== ${id}: ${r.plan.verified ? "VERIFIED" : "FALLBACK"} in ${(r.ms / 1000).toFixed(1)}s | ${s.turns} turns, ${s.toolCalls} tool calls, ${s.inputTokens} in / ${s.outputTokens} out, repairs ${s.repairs} | $${r.costUsd.toFixed(4)}`);
    console.log(`   day: ${day}`);
    for (const issue of r.plan.issues) console.log(`   issue ${issue.momentId ?? "-"} [${issue.code}] ${issue.detail.slice(0, 160)}`);
    for (const m of r.plan.moments) {
      console.log(`   [${m.id}] ${m.title} | ${m.scene.scene}/${m.scene.light ?? "-"}${m.scene.call ? ` (call ${m.scene.call.layout})` : ""} | ${m.action.kind}`);
      console.log(`       HEAD ${m.headline?.text ?? "(none)"}`);
      for (const c of m.outOfSight) console.log(`       OUT  ${c.text}`);
      for (const c of m.notice) console.log(`       SEE  ${c.text}`);
      console.log(`       ACT  ${m.action.claim.text}`);
    }
    console.log(`   SUMMARY ${r.plan.summary.text}`);
  }

  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const median = ms.length ? (ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2) : 0;
  const total = results.reduce((sum, r) => sum + r.costUsd, 0);
  console.log(`\nRuns ${results.length}: verified ${results.filter((r) => r.plan.verified).length}, fallback ${results.filter((r) => !r.plan.verified).length}, repairs used ${results.filter((r) => r.plan.stats.repairs).length}`);
  console.log(`Latency: median ${(median / 1000).toFixed(1)}s, min ${(ms[0] / 1000).toFixed(1)}s, max ${(ms[ms.length - 1] / 1000).toFixed(1)}s | cost $${total.toFixed(4)}`);
}

main().catch((error) => {
  console.error(`measure failed: ${error instanceof Error ? error.name : typeof error}`);
  process.exit(1);
});
