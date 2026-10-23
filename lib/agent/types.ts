/**
 * Shared types for the Rehearse agent: the engine the tools call (injectable, so tests use a fake and the route uses
 * lib/agent/realEngine.ts), the LLM adapter, and the run-level shapes. The contract itself is lib/contracts/rehearse.ts.
 */
import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import type {
  CallFrameResult,
  CallGeometry,
  ConcernId,
  DayPlan,
  FreeFixInput,
  FreeFixResult,
  LightestTouchResult,
  LightId,
  ObserveResult,
  PlannedMoment,
  ReceiptInput,
  ReceiptResult,
  RehearseEvent,
  RehearseFace,
  RehearsePrefs,
  SceneInput,
  WorthItResult,
} from "@/lib/contracts";

/** The deterministic functions of lib/rehearse (agent A), as the tools need them. */
export interface RehearseEngine {
  lightLuminance(light: LightId): number;
  /** The default call for a device: its typical camera distance, in the given layout (speaker unless said). */
  defaultCall(device: CallGeometry["device"], layout?: CallGeometry["layout"]): CallGeometry;
  videoCallFrame(call: CallGeometry, ref: string): CallFrameResult;
  observeScene(face: RehearseFace, input: SceneInput, ref: string): ObserveResult;
  findFreeFix(face: RehearseFace, input: FreeFixInput, ref: string): FreeFixResult;
  lightestTouch(face: RehearseFace, concern: ConcernId, ref: string): LightestTouchResult;
  worthIt(face: RehearseFace, concern: ConcernId, distanceM: number, ref: string): WorthItResult;
  receiptAt(face: RehearseFace, input: ReceiptInput, ref: string): ReceiptResult | null;
}

/** A SceneError from the engine (code "bad_scene"), tested by shape so a fake engine needs no import of the real one. */
export function isSceneError(error: unknown): error is Error & { code: "bad_scene" } {
  return error instanceof Error && (error as { code?: unknown }).code === "bad_scene";
}

export type AnyResult = DayPlan["results"][string];

// ---------------------------------------------------------------------------------------------------------------
// The LLM adapter. Messages and blocks are the Bedrock Converse shapes, so assistant turns (reasoning blocks
// included) can be passed back untouched.
// ---------------------------------------------------------------------------------------------------------------

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema of the input. */
  inputSchema: Record<string, unknown>;
}

export interface LlmMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmTool[];
  /** Aborts the call (turn budget, client gone). */
  signal?: AbortSignal;
}

export interface LlmResponse {
  /** The assistant message's content blocks, exactly as the model produced them. */
  content: ContentBlock[];
  /** "tool_use", "end_turn", "max_tokens", or anything else the provider reports (refusal, content filter). */
  stopReason: string;
  /** inputTokens excludes prompt-cache reads and writes, which are counted apart (and priced apart). */
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
}

export interface LlmClient {
  converse(request: LlmRequest): Promise<LlmResponse>;
}

/** The model call failed (network, auth, throttling, a refusal). The message is safe to log; it carries no secrets. */
export class LlmError extends Error {
  constructor(
    readonly kind: "upstream" | "timeout" | "aborted",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------------------------

/** The part of a RehearseRequest the agent reads. A follow-up needs only the earlier moments' words and scenes. */
export interface AgentRequest {
  day: string;
  prefs: RehearsePrefs;
  followUp?: {
    question: string;
    previous: { day: string; moments: Pick<PlannedMoment, "title" | "time" | "scene">[] };
  };
}

export interface RunAgentOptions {
  face: RehearseFace;
  request: AgentRequest;
  llm: LlmClient;
  engine: RehearseEngine;
  emit: (event: RehearseEvent) => void;
  signal?: AbortSignal;
  /** Total wall-clock budget, ms. Default 60 000. */
  budgetMs?: number;
  /** Model turns allowed. Default 12. */
  maxTurns?: number;
  /** Clock, for tests. */
  now?: () => number;
}
