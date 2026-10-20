/**
 * One Converse call to the model under test, cached on disk, under a hard call and cost budget.
 * Credentials are read from the environment and passed explicitly; nothing here logs them.
 *
 * Record layout: results/raw/<test>/<item>/run<N>.a<K>.json, one file per HTTP call (K = 1, or 2 for the single allowed
 * retry). A run is finished when some attempt parsed, or when two attempts exist. Finished runs are never called again.
 */
import { BedrockRuntimeClient, ConverseCommand, type ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MODEL_ID, SYSTEM_PROMPT } from "./prompts";

export const RAW_DIR = path.join(import.meta.dirname, "results", "raw");

/** Hard limits from the task: at most 80 calls in total, stop if the list-price estimate passes $5. */
export const MAX_CALLS = 80;
export const MAX_COST_USD = 5;
/** List price assumed (Bedrock may differ): dollars per million tokens. */
export const PRICE_PER_M = { input: 4, output: 20 } as const;
const MAX_TOKENS = 4000;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RawRecord {
  test: "A" | "B";
  item: string;
  run: number;
  attempt: number;
  modelId: string;
  region: string;
  at: string;
  latencyMs: number;
  imageSha256: string;
  imageFormat: "jpeg" | "png";
  prompt: string;
  stopReason?: string;
  usage?: Usage;
  /** The text blocks of the reply, joined. */
  text?: string;
  /** Content block kinds in the reply, e.g. ["reasoningContent", "text"]. */
  blocks?: string[];
  error?: string;
}

export const costOf = (u: Usage | undefined): number =>
  u ? (u.inputTokens * PRICE_PER_M.input + u.outputTokens * PRICE_PER_M.output) / 1e6 : 0;

export function recordPath(test: string, item: string, run: number, attempt: number): string {
  return path.join(RAW_DIR, test, item, `run${run}.a${attempt}.json`);
}

export function readRecord(file: string): RawRecord {
  return JSON.parse(fs.readFileSync(file, "utf8")) as RawRecord;
}

export function allRecordFiles(): string[] {
  if (!fs.existsSync(RAW_DIR)) return [];
  const out: string[] = [];
  for (const t of fs.readdirSync(RAW_DIR))
    for (const item of fs.readdirSync(path.join(RAW_DIR, t)))
      for (const f of fs.readdirSync(path.join(RAW_DIR, t, item))) if (f.endsWith(".json")) out.push(path.join(RAW_DIR, t, item, f));
  return out.sort();
}

export function spendSoFar(): { calls: number; costUsd: number; usage: Usage } {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let calls = 0;
  let costUsd = 0;
  for (const f of allRecordFiles()) {
    const r = readRecord(f);
    calls++;
    costUsd += costOf(r.usage);
    if (r.usage) {
      usage.inputTokens += r.usage.inputTokens;
      usage.outputTokens += r.usage.outputTokens;
      usage.totalTokens += r.usage.totalTokens;
    }
  }
  return { calls, costUsd, usage };
}

let client: BedrockRuntimeClient | null = null;

function bedrock(): { client: BedrockRuntimeClient; region: string } {
  const region = process.env.CLAUDE_AWS_REGION;
  const accessKeyId = process.env.CLAUDE_AWS_ACCESS_KEY;
  const secretAccessKey = process.env.CLAUDE_AWS_SECRET_KEY;
  if (!region || !accessKeyId || !secretAccessKey) throw new Error("CLAUDE_AWS_REGION, CLAUDE_AWS_ACCESS_KEY and CLAUDE_AWS_SECRET_KEY must be set (npm run spike -- ...)");
  client ??= new BedrockRuntimeClient({ region, credentials: { accessKeyId, secretAccessKey } });
  return { client, region };
}

export interface CallInput {
  test: "A" | "B";
  item: string;
  run: number;
  attempt: number;
  image: Buffer;
  imageFormat: "jpeg" | "png";
  prompt: string;
}

/** Makes the call and writes its record (also on failure). Never throws on an API error: the error is in the record. */
export async function callOnce(input: CallInput): Promise<RawRecord> {
  const { client: c, region } = bedrock();
  const base = {
    test: input.test,
    item: input.item,
    run: input.run,
    attempt: input.attempt,
    modelId: MODEL_ID,
    region,
    at: new Date().toISOString(),
    imageSha256: createHash("sha256").update(input.image).digest("hex"),
    imageFormat: input.imageFormat,
    prompt: input.prompt,
  };
  const content: ContentBlock[] = [
    { image: { format: input.imageFormat, source: { bytes: new Uint8Array(input.image) } } },
    { text: input.prompt },
  ];
  const t0 = Date.now();
  let rec: RawRecord;
  try {
    // No temperature, topP, thinking or budget settings: this model rejects sampling parameters and always thinks.
    const res = await c.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: "user", content }],
        inferenceConfig: { maxTokens: MAX_TOKENS },
      }),
    );
    const blocks = res.output?.message?.content ?? [];
    rec = {
      ...base,
      latencyMs: Date.now() - t0,
      stopReason: res.stopReason,
      usage: res.usage
        ? { inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0, totalTokens: res.usage.totalTokens ?? 0 }
        : undefined,
      text: blocks.map((b) => b.text ?? "").join(""),
      blocks: blocks.map((b) => Object.keys(b).find((k) => k !== "$unknown") ?? "unknown"),
    };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    rec = { ...base, latencyMs: Date.now() - t0, error: `${err.name ?? "Error"}: ${(err.message ?? "").slice(0, 400)}` };
  }
  const file = recordPath(input.test, input.item, input.run, input.attempt);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n");
  return rec;
}
