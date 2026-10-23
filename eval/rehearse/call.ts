/**
 * The two model calls of the experiment. Credentials come from the environment (npm run spike loads .env) and are passed
 * explicitly to the SDK; nothing here prints them.
 *
 *   callWithout   one Converse call of the unaided model: the photo, the day, the tables, no tools. Mirrors the agent's adapter
 *                 (lib/agent/llm.ts): same model, same effort, same 8000-token ceiling, cache points when the account takes them.
 *   runWith       the real agent (runAgent with createBedrockClient and the real engine) on one face and one day.
 */
import { BedrockRuntimeClient, ConverseCommand, type ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { createHash } from "node:crypto";
import type { ToolName } from "../../lib/contracts/rehearse";
import { bedrockConfigured, createBedrockClient } from "../../lib/agent/llm";
import { runAgent } from "../../lib/agent/loop";
import { faceFromBundle, realEngine } from "../../lib/agent/realEngine";
import type { LlmClient } from "../../lib/agent/types";
import { verifyPlan } from "../../lib/agent/verify";
import { loadBundle } from "../../lib/integration/demo";
import type { EvalDay } from "./days";
import { emptyMeter, costOf, type Meter, type Outcome, type WithRecord, type WithoutRecord } from "./store";

const MAX_OUTPUT_TOKENS = 8000;
const CACHE_POINT = { cachePoint: { type: "default" as const } };
const CALL_TIMEOUT_MS = 150_000;
/** The agent loop's own wall-clock budget; record.ts uses 55 s too. */
const AGENT_BUDGET_MS = 55_000;

export const effortOf = (env: Record<string, string | undefined> = process.env): "low" | "medium" | "high" =>
  (["low", "medium", "high"] as const).find((e) => e === env.CLAUDE_AWS_EFFORT?.trim()) ?? "low";

/** The model's name for the record. CLAUDE_AWS_MODEL may be an inference-profile ARN (with an account id and a region): only its last segment is kept. */
export const modelId = (): string => (process.env.CLAUDE_AWS_MODEL ?? "").split("/").pop() ?? "";

let client: BedrockRuntimeClient | null = null;
let caching = process.env.CLAUDE_AWS_CACHE?.trim() !== "0";

function bedrock(): BedrockRuntimeClient {
  if (!bedrockConfigured(process.env)) throw new Error("CLAUDE_AWS_REGION, CLAUDE_AWS_ACCESS_KEY, CLAUDE_AWS_SECRET_KEY and CLAUDE_AWS_MODEL must be set (run with: npm run spike -- eval/rehearse/run.ts)");
  client ??= new BedrockRuntimeClient({
    region: process.env.CLAUDE_AWS_REGION,
    credentials: { accessKeyId: process.env.CLAUDE_AWS_ACCESS_KEY ?? "", secretAccessKey: process.env.CLAUDE_AWS_SECRET_KEY ?? "" },
    maxAttempts: 2,
  });
  return client;
}

export interface WithoutInput {
  face: string;
  day: string;
  run: number;
  attempt: number;
  image: Buffer;
  system: string;
  text: string;
  /** Default: the agent adapter's effort (CLAUDE_AWS_EFFORT, low unless set). */
  effort?: "low" | "medium" | "high";
}

/** Makes the call and returns its record (also on failure: an API error is data). The caller writes it. */
export async function callWithout(input: WithoutInput): Promise<WithoutRecord> {
  const c = bedrock();
  const effort = input.effort ?? effortOf();
  const t0 = Date.now();
  const send = (cache: boolean) => {
    const content: ContentBlock[] = [{ image: { format: "jpeg", source: { bytes: new Uint8Array(input.image) } } }, ...(cache ? [CACHE_POINT] : []), { text: input.text }];
    return c.send(
      new ConverseCommand({
        modelId: process.env.CLAUDE_AWS_MODEL,
        system: cache ? [{ text: input.system }, CACHE_POINT] : [{ text: input.system }],
        messages: [{ role: "user", content }],
        inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS },
        additionalModelRequestFields: { output_config: { effort } },
      }),
      { abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
    );
  };
  const base = {
    kind: "without" as const,
    face: input.face,
    day: input.day,
    run: input.run,
    attempt: input.attempt,
    modelId: modelId(),
    effort,
    at: new Date().toISOString(),
    imageSha256: createHash("sha256").update(input.image).digest("hex"),
  };
  let used = caching;
  let httpCalls = 1;
  try {
    let res;
    try {
      res = await send(caching);
    } catch (error) {
      if (!caching || (error as { name?: string }).name !== "ValidationException") throw error;
      caching = false;
      used = false;
      httpCalls = 2;
      res = await send(false);
    }
    const blocks = res.output?.message?.content ?? [];
    const meter: Meter = {
      input: res.usage?.inputTokens ?? 0,
      output: res.usage?.outputTokens ?? 0,
      cacheRead: res.usage?.cacheReadInputTokens ?? 0,
      cacheWrite: res.usage?.cacheWriteInputTokens ?? 0,
    };
    return {
      ...base,
      latencyMs: Date.now() - t0,
      cache: used,
      httpCalls,
      stopReason: res.stopReason,
      meter,
      costUsd: Number(costOf(meter).toFixed(5)),
      text: blocks.map((b) => b.text ?? "").join(""),
      blocks: blocks.map((b) => Object.keys(b).find((k) => k !== "$unknown") ?? "unknown"),
    };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return { ...base, latencyMs: Date.now() - t0, cache: used, httpCalls, costUsd: 0, error: `${err.name ?? "Error"}: ${(err.message ?? "").slice(0, 300)}` };
  }
}

export async function runWith(face: string, day: EvalDay): Promise<WithRecord> {
  const bundle = loadBundle(face);
  if (!bundle) throw new Error(`no demo bundle for ${face}`);
  const faceData = faceFromBundle(bundle);
  const prefs = { callDevice: day.callDevice, noMakeup: false };
  const meter = emptyMeter();
  let requests = 0;
  const inner = createBedrockClient(process.env);
  const llm: LlmClient = {
    async converse(request) {
      const res = await inner.converse(request);
      requests++;
      meter.input += res.usage.inputTokens;
      meter.output += res.usage.outputTokens;
      meter.cacheRead += res.usage.cacheReadTokens ?? 0;
      meter.cacheWrite += res.usage.cacheWriteTokens ?? 0;
      return res;
    },
  };
  const steps: { tool: ToolName; label: string }[] = [];
  const at = new Date().toISOString();
  const plan = await runAgent({
    face: faceData,
    request: { day: day.text, prefs },
    llm,
    engine: realEngine,
    emit: (e) => {
      if (e.type === "step") steps.push({ tool: e.tool, label: e.label });
    },
    budgetMs: AGENT_BUDGET_MS,
  });
  const recheck = verifyPlan({ moments: plan.moments, summary: plan.summary }, plan.results, prefs);
  const outcome: Outcome = !plan.verified ? "fallback" : plan.stats.repairs > 0 ? "repaired" : "verified";
  return {
    kind: "with",
    face,
    day: day.id,
    dayText: day.text,
    callDevice: day.callDevice,
    modelId: modelId(),
    effort: effortOf(),
    at,
    ms: plan.stats.ms,
    requests,
    toolCalls: plan.stats.toolCalls,
    meter,
    costUsd: Number(costOf(meter).toFixed(5)),
    outcome,
    steps,
    plan,
    recheck,
  };
}
