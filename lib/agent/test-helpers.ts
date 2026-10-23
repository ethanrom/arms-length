/** Test helpers only: a scripted model, hand-made tool results with known quotes, and the real demo faces. Never imported by app code. */
import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import type { FreeFixResult, LightestTouchResult, ObserveResult, RehearseFace, SceneInput, WorthItResult } from "@/lib/contracts";
import { DEMO_IDS, loadBundle } from "@/lib/integration/demo";
import { faceFromBundle } from "@/lib/rehearse";
import { LlmError, type LlmClient, type LlmMessage, type LlmRequest, type LlmResponse } from "./types";
import type { PlanDraft } from "./verify";

// ---------------------------------------------------------------------------------------------------------------
// A scripted model
// ---------------------------------------------------------------------------------------------------------------

export interface Reply {
  content: ContentBlock[];
  stopReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export type Script = (turn: { index: number; request: LlmRequest; last: Record<string, unknown>[] }) => Reply | Promise<Reply>;

export interface FakeLlm extends LlmClient {
  /** Errors thrown inside the script (a failed expect): the loop would swallow them into a fallback, so check() rethrows. */
  errors: unknown[];
  check(): void;
  calls: LlmRequest[];
  /** Deep copies of each request's messages as they were when sent (the loop's array keeps growing). */
  sent: LlmMessage[][];
}

let counter = 0;
export const toolUse = (name: string, input: unknown): ContentBlock => ({ toolUse: { toolUseId: `tu${++counter}`, name, input: input as never } });

/** The parsed JSON of every toolResult in the last user message of a request, in order. */
export function lastResults(messages: LlmMessage[]): Record<string, unknown>[] {
  const last = messages[messages.length - 1];
  return (last?.content ?? []).flatMap((b) => (b.toolResult ? [JSON.parse(b.toolResult.content?.[0]?.text ?? "{}") as Record<string, unknown>] : []));
}

export function fakeLlm(script: Script | Script[]): FakeLlm {
  const calls: LlmRequest[] = [];
  const sent: LlmMessage[][] = [];
  const errors: unknown[] = [];
  return {
    calls,
    sent,
    errors,
    check() {
      if (errors.length) throw errors[0];
    },
    async converse(request: LlmRequest): Promise<LlmResponse> {
      const index = calls.length;
      calls.push(request);
      sent.push(structuredClone(request.messages));
      const step = Array.isArray(script) ? script[Math.min(index, script.length - 1)] : script;
      let reply: Reply;
      try {
        reply = await step({ index, request, last: lastResults(request.messages) });
      } catch (error) {
        if (!(error instanceof LlmError)) errors.push(error);
        throw error;
      }
      const hasTools = reply.content.some((b) => b.toolUse);
      return { content: reply.content, stopReason: reply.stopReason ?? (hasTools ? "tool_use" : "end_turn"), usage: reply.usage ?? { inputTokens: 1000, outputTokens: 100 } };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Hand-made results with quotes we control
// ---------------------------------------------------------------------------------------------------------------

export function stubObserve(ref: string, scene: SceneInput["scene"] = "dinner_table"): ObserveResult {
  return {
    ref,
    quotes: {
      distance: "1.5 m",
      light: "indoor light",
      viewer: "typical eyes (20/20)",
      "pore.typical": "about 1 in 12",
      "pore.typicalCount": "54 of 650",
      "pore.bound": "at most 1 in 8",
      "pore.boundCount": "at most 81 of 650",
      "acne.typical": "none",
      "acne.typicalCount": "0 of 30",
      "acne.bound": "at most 1 in 6",
      "acne.boundCount": "at most 5 of 30",
    },
    assumptions: [],
    input: { scene, light: "indoor", viewer: "typical" },
    distanceM: 1.5,
    luminanceCdM2: 45,
    acuityScale: 1,
    concerns: [
      { concern: "pore", targetCount: 650, typicalShare: 0.083, typicalCount: 54, boundShare: 0.125, boundCount: 81, soft: false },
      { concern: "acne", targetCount: 30, typicalShare: 0, typicalCount: 0, boundShare: 0.17, boundCount: 5, soft: false },
    ],
  };
}

export function stubFreeFix(ref: string, reachable: boolean, scene: SceneInput["scene"] = "dinner_table"): FreeFixResult {
  const from: SceneInput = { scene };
  return {
    ref,
    quotes: reachable ? { change: "sit or stand about 30 cm further away", to: "about 1.8 m apart" } : { change: "no free change is enough to reach that here" },
    assumptions: [],
    reachable,
    lever: reachable ? "distance" : null,
    from,
    to: reachable ? { scene, distanceM: 1.8 } : null,
    after: { ...stubObserve(`${ref}.after`, scene), quotes: { distance: "1.8 m", light: "indoor light", "pore.typical": "about 1 in 40", "pore.bound": "at most 1 in 15" } },
  };
}

export function stubTouch(ref: string, status: LightestTouchResult["status"]): LightestTouchResult {
  return {
    ref,
    concern: "acne",
    status,
    coveragePct: status === "met" || status === "not_met" ? 75 : null,
    measuredAtM: 1.5,
    baselineShare: 0.3,
    afterShare: 0.08,
    quotes: status === "met" || status === "not_met" ? { coverage: "75% coverage", measuredAt: "measured in indoor light at 1.5 m", before: "at most 1 in 3", after: "at most 1 in 12" } : {},
    assumptions: [],
  };
}

export function stubWorth(ref: string, simulated: boolean): WorthItResult {
  return {
    ref,
    concern: "pore",
    simulated,
    distanceM: 1.5,
    typicalShareOfChange: simulated ? 0.1 : null,
    boundShareOfChange: simulated ? 0.2 : null,
    quotes: simulated ? { distance: "1.5 m", "change.typical": "about 1 in 10", "change.bound": "at most 1 in 5", measuredAt: "measured on YouCam Skin Simulation at half strength, in indoor light" } : {},
    assumptions: [],
  };
}

/** A one-moment draft that passes against stubObserve("r1"). */
export function goodDraft(): PlanDraft {
  return {
    moments: [
      {
        time: "7pm",
        title: "Dinner date",
        scene: { scene: "dinner_table", light: "indoor", viewer: "typical" },
        observeRef: "r1",
        assumptions: ["I took dinner as a table across from each other."],
        notice: [{ text: "A typical viewer could pick out about 1 in 12 of your pores.", refs: ["r1"] }],
        outOfSight: [{ text: "Breakouts stay out of sight for a typical viewer.", refs: ["r1"] }],
        action: { kind: "none", claim: { text: "Nothing needs doing here.", refs: [] } },
      },
    ],
    summary: { text: "Your dinner keeps most marks out of sight.", refs: ["r1"] },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------------------------------------------

const faces = new Map<string, RehearseFace>();
export function demoFace(id: (typeof DEMO_IDS)[number]): RehearseFace {
  let face = faces.get(id);
  if (!face) {
    const bundle = loadBundle(id);
    if (!bundle) throw new Error(`demo bundle ${id} is missing`);
    faces.set(id, (face = faceFromBundle(bundle)));
  }
  return face;
}
export { DEMO_IDS };
