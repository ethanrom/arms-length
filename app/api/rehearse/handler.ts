// POST /api/rehearse: the guards, the face, and the NDJSON stream of one agent run. Kept out of route.ts so tests can inject the
// model, the engine and the environment. Bedrock is only ever called from here, server-side. Never logs request bodies.
import fs from "node:fs";
import path from "node:path";
import { EXAMPLE_DAYS, type DayPlan, type RehearseEvent, type RehearseFace, type RunStats, type ToolName } from "@/lib/contracts";
import { buildFallbackPlan } from "@/lib/agent/fallback";
import { createBedrockClient } from "@/lib/agent/llm";
import { runAgent } from "@/lib/agent/loop";
import { faceFromBundle, realEngine } from "@/lib/agent/realEngine";
import { MAX_BODY_BYTES, describeZodIssue, rehearseRequestSchema, type ParsedRehearseRequest } from "@/lib/agent/schemas";
import { LlmError, type LlmClient, type RehearseEngine } from "@/lib/agent/types";
import { loadBundle } from "@/lib/integration/demo";
import { configFromEnv } from "@/lib/youcam/budget";
import { readBoundedText } from "@/lib/youcam/http";
import { createLimiter } from "@/lib/youcam/ratelimit";

type Env = Record<string, string | undefined>;
type ErrorEvent = Extract<RehearseEvent, { type: "error" }>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 10 runs per address per day and 100 in all: the model costs a few cents a run. Best effort, per warm instance. */
export const IP_LIMIT = { max: 10, windowMs: DAY_MS } as const;
export const GLOBAL_LIMIT = { max: 100, windowMs: DAY_MS } as const;
const ipLimiter = createLimiter(IP_LIMIT);
const globalLimiter = createLimiter(GLOBAL_LIMIT);

export function resetRehearseLimits(): void {
  ipLimiter.reset();
  globalLimiter.reset();
}

/** maxDuration is 60 s; the loop's budget leaves room to deliver the fallback inside it. */
const RUN_BUDGET_MS = 50_000;

const HEADERS = { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" };

export interface RehearseDeps {
  env: Env;
  llm: () => LlmClient;
  engine: RehearseEngine;
  /** A demo face, or null for an unknown id. */
  loadFace: (demoId: string) => RehearseFace | null;
  /** Where recorded plans live (replay mode). */
  fixturesDir: string;
  now: () => number;
}

let bedrock: LlmClient | null = null;
const faces = new Map<string, RehearseFace>();

export function defaultDeps(): RehearseDeps {
  return {
    env: process.env,
    llm: () => (bedrock ??= createBedrockClient(process.env)),
    engine: realEngine,
    loadFace(demoId) {
      const cached = faces.get(demoId);
      if (cached) return cached;
      const bundle = loadBundle(demoId);
      if (!bundle) return null;
      const face = faceFromBundle(bundle);
      faces.set(demoId, face);
      return face;
    },
    fixturesDir: path.join(process.cwd(), "fixtures", "rehearse"),
    now: Date.now,
  };
}

const line = (event: RehearseEvent) => `${JSON.stringify(event)}\n`;

function failure(code: ErrorEvent["code"], message: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(line({ type: "error", code, message }), { status, headers: { ...HEADERS, ...extra } });
}

const tooBig = () => new Error("too_large");

export async function handleRehearse(request: Request, ip: string, deps: RehearseDeps = defaultDeps()): Promise<Response> {
  const { env } = deps;
  const replay = env.AGENT_MODE?.trim().toLowerCase() === "replay";

  if (env.AGENT_ENABLED?.trim() !== "1") return failure("disabled", "Rehearse your day is switched off on this deployment.", 503);
  if (configFromEnv(env).killSwitch) return failure("kill_switch", "Rehearse your day is paused for now. Please try again later.", 503);

  // Recordings cost nothing, so only a real model call is counted.
  if (!replay) {
    const wait = ipLimiter.hit(ip) || globalLimiter.hit("all");
    if (wait > 0) {
      return failure("rate_limited", "That is today's limit for Rehearse your day. Please try again tomorrow.", 429, { "retry-after": String(wait) });
    }
  }

  let text: string;
  try {
    text = await readBoundedText(request, MAX_BODY_BYTES, tooBig);
  } catch {
    return failure("too_large", `That request is larger than the ${MAX_BODY_BYTES / 1_000_000} MB this endpoint takes.`, 413);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return failure("bad_request", "That request was not valid JSON.", 400);
  }
  const parsed = rehearseRequestSchema.safeParse(json);
  if (!parsed.success) return failure("bad_request", `That request is not valid: ${describeZodIssue(parsed.error)}.`, 400);
  const body = parsed.data;

  let face: RehearseFace;
  if ("live" in body.face) face = body.face.live;
  else {
    const demo = deps.loadFace(body.face.demoId);
    if (!demo) return failure("unknown_face", "That demo face is not available.", 404);
    face = demo;
  }

  return stream(request, body, face, replay, deps);
}

function stream(request: Request, body: ParsedRehearseRequest, face: RehearseFace, replay: boolean, deps: RehearseDeps): Response {
  const cancelled = new AbortController();
  request.signal?.addEventListener("abort", () => cancelled.abort(), { once: true });
  const encoder = new TextEncoder();

  const body$ = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const emit = (event: RehearseEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          open = false;
          cancelled.abort();
        }
      };
      const run = async () => {
        try {
          const plan = replay ? await replayPlan(body, face, deps, emit, cancelled.signal) : await runAgent({ face, request: body, llm: deps.llm(), engine: deps.engine, emit, signal: cancelled.signal, budgetMs: RUN_BUDGET_MS, now: deps.now });
          emit({ type: "plan", plan });
        } catch (error) {
          if (!cancelled.signal.aborted) {
            // Only the error's class is logged, never the request.
            console.error(`[rehearse] run failed: ${error instanceof Error ? error.name : typeof error}`);
            const timeout = error instanceof LlmError && error.kind === "timeout";
            emit({ type: "error", code: timeout ? "timeout" : "upstream", message: "Rehearse your day could not finish. Please try again." });
          }
        } finally {
          open = false;
          try {
            controller.close();
          } catch {
            /* already closed by a cancel */
          }
        }
      };
      void run();
    },
    cancel() {
      cancelled.abort();
    },
  });
  return new Response(body$, { headers: HEADERS });
}

// ---------------------------------------------------------------------------------------------------------------
// Replay (AGENT_MODE=replay): recorded plans for the example days, the deterministic fallback for everything else.
// ---------------------------------------------------------------------------------------------------------------

export interface RehearseFixture {
  steps: { tool: ToolName; label: string }[];
  plan: DayPlan;
}

const ZERO_STATS: RunStats = { ms: 0, turns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, repairs: 0 };
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

export function readFixture(dir: string, demoId: string, exampleId: string): RehearseFixture | null {
  const file = path.join(dir, demoId, `${exampleId}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RehearseFixture>;
    return parsed.plan && Array.isArray(parsed.plan.moments) && Array.isArray(parsed.steps) ? (parsed as RehearseFixture) : null;
  } catch {
    return null;
  }
}

async function replayPlan(body: ParsedRehearseRequest, face: RehearseFace, deps: RehearseDeps, emit: (e: RehearseEvent) => void, signal: AbortSignal): Promise<DayPlan> {
  const example = "demoId" in body.face && !body.followUp ? EXAMPLE_DAYS.find((e) => e.day === body.day) : undefined;
  const fixture = example && "demoId" in body.face ? readFixture(deps.fixturesDir, body.face.demoId, example.id) : null;
  if (fixture) {
    const delay = Number(deps.env.AGENT_REPLAY_DELAY_MS ?? 150);
    for (const step of fixture.steps) {
      emit({ type: "step", tool: step.tool, label: step.label });
      await sleep(Number.isFinite(delay) ? Math.min(delay, 1000) : 150, signal);
    }
    return fixture.plan;
  }
  return buildFallbackPlan({ request: body, face, engine: deps.engine, stats: ZERO_STATS, emit });
}
