/**
 * The agent loop: Claude plans through tool calls, the deterministic tools answer, a checker verifies the plan, and a
 * deterministic fallback covers every failure. runAgent always returns a DayPlan (verified or fallback); it throws only when
 * the caller's own signal aborts (the visitor left).
 */
import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import type { DayPlan, RunStats, VerifierIssue } from "@/lib/contracts";
import { buildFallbackPlan, type FallbackMoment } from "./fallback";
import { NUDGE_MESSAGE, buildSystemPrompt, buildUserMessage, repairMessage } from "./prompt";
import { assemblePlan, polishDraft } from "./plan";
import { isObserve } from "./results";
import { describeZodIssue, dropNulls, finalAnswerInput, type FinalAnswerInput } from "./schemas";
import { TOOL_NAMES, cleanTitle, createToolbox, resolveToolName, stepEvent, toolSpecs } from "./tools";
import { LlmError, type AgentRequest, type LlmMessage, type RunAgentOptions } from "./types";
import { salvage } from "./salvage";
import { verifyLocated, type DraftMoment, type Located, type PlanDraft } from "./verify";

export const MAX_TURNS = 12;
export const BUDGET_MS = 60_000;
/** A runaway guard: a day has at most 8 moments, a few tools each. */
const MAX_TOOL_CALLS = 60;

type ToolUse = { toolUseId: string; name: string; input: unknown };

const resultBlock = (toolUseId: string, text: string, ok: boolean): ContentBlock => ({
  toolResult: { toolUseId, content: [{ text }], status: ok ? "success" : "error" },
});

function toDraft(parsed: FinalAnswerInput): PlanDraft {
  return {
    summary: parsed.summary,
    moments: parsed.moments.map((m) => ({
      ...m,
      time: m.time ?? null,
      action: (m.action.kind === "none" ? { kind: "none", claim: m.action.claim } : { kind: m.action.kind, ref: m.action.ref ?? "", claim: m.action.claim }) as DraftMoment["action"],
    })),
  };
}

export async function runAgent(options: RunAgentOptions): Promise<DayPlan> {
  const { face, request, llm, engine, emit, signal } = options;
  const now = options.now ?? Date.now;
  const maxTurns = options.maxTurns ?? MAX_TURNS;
  const startedAt = now();
  const deadline = startedAt + (options.budgetMs ?? BUDGET_MS);

  const toolbox = createToolbox({ face, engine, prefs: request.prefs });
  const system = buildSystemPrompt();
  const tools = toolSpecs();
  const messages: LlmMessage[] = [{ role: "user", content: [{ text: buildUserMessage(request) }] }];

  const stats: RunStats = { ms: 0, turns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, repairs: 0 };
  const seenMoments: FallbackMoment[] = [];
  let lastIssues: VerifierIssue[] = [];
  let lastDraft: PlanDraft | null = null;
  let nudged = false;

  const finish = (partial: Partial<RunStats> = {}): RunStats => ({ ...stats, ...partial, ms: now() - startedAt });
  const fallback = (): DayPlan => {
    const moments = lastDraft
      ? lastDraft.moments.map((m): FallbackMoment => ({ title: m.title, time: m.time, scene: m.scene }))
      : seenMoments;
    return buildFallbackPlan({ request, face, engine, moments, issues: lastIssues, stats: finish() });
  };

  for (;;) {
    if (signal?.aborted) throw new LlmError("aborted", "The request was cancelled.");
    const remaining = deadline - now();
    if (stats.turns >= maxTurns || remaining <= 0) return fallback();

    let response;
    try {
      const callSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(remaining)]) : AbortSignal.timeout(remaining);
      response = await llm.converse({ system, messages, tools, signal: callSignal });
    } catch (error) {
      if (signal?.aborted) throw error;
      return fallback();
    }
    stats.turns++;
    // RunStats counts every prompt token processed, cached or not; the cache split is in the LLM adapter's usage.
    stats.inputTokens += response.usage.inputTokens + (response.usage.cacheReadTokens ?? 0) + (response.usage.cacheWriteTokens ?? 0);
    stats.outputTokens += response.usage.outputTokens;
    // The whole assistant message goes back as it came, reasoning blocks included.
    messages.push({ role: "assistant", content: response.content });

    if (response.stopReason === "end_turn") {
      if (nudged) return fallback();
      nudged = true;
      messages.push({ role: "user", content: [{ text: NUDGE_MESSAGE }] });
      continue;
    }
    if (response.stopReason !== "tool_use") return fallback(); // max_tokens, a refusal, a content filter: not usable

    const uses: ToolUse[] = response.content.flatMap((b) => (b.toolUse?.toolUseId && b.toolUse.name ? [{ toolUseId: b.toolUse.toolUseId, name: b.toolUse.name, input: b.toolUse.input }] : []));
    if (uses.length === 0) return fallback();

    const results: ContentBlock[] = [];
    let accepted: PlanDraft | null = null;

    for (const use of uses) {
      stats.toolCalls++;
      const tool = resolveToolName(use.name);
      if (!tool) {
        results.push(resultBlock(use.toolUseId, JSON.stringify({ error: `There is no tool called "${use.name}". The tools are: ${TOOL_NAMES.join(", ")}.` }), false));
        continue;
      }
      if (stats.toolCalls > MAX_TOOL_CALLS) {
        results.push(resultBlock(use.toolUseId, JSON.stringify({ error: "Too many tool calls. Call final_answer now with what you have." }), false));
        continue;
      }
      // assess_moment emits the steps of the tools it runs, as it runs them.
      if (tool !== "assess_moment") emit(stepEvent(tool, use.input));

      if (tool !== "final_answer") {
        const outcome = toolbox.run(tool, use.input, emit);
        results.push(resultBlock(use.toolUseId, outcome.text, outcome.ok));
        if (outcome.ok && (tool === "observe_scene" || tool === "assess_moment") && isObserve(outcome.result) && seenMoments.length < 8) {
          const r = outcome.result;
          const named = use.input as { label?: unknown; title?: unknown } | null;
          const label = named?.label ?? named?.title;
          seenMoments.push({
            title: cleanTitle(label),
            time: null,
            scene: r.input.call ? { scene: r.input.scene, light: r.input.light, viewer: r.input.viewer, call: r.input.call } : { scene: r.input.scene, light: r.input.light, viewer: r.input.viewer, distanceM: r.distanceM },
          });
        }
        continue;
      }

      // final_answer
      if (uses.length > 1) {
        results.push(resultBlock(use.toolUseId, JSON.stringify({ error: "Call final_answer on its own, after the other tool results are in. Call it again now, alone." }), false));
        continue;
      }
      const parsed = finalAnswerInput.safeParse(dropNulls(use.input));
      const issues: VerifierIssue[] = parsed.success
        ? []
        : [{ momentId: null, code: "schema", detail: describeZodIssue(parsed.error) }];
      let draft: PlanDraft | null = null;
      let located: Located[] = [];
      const known = Object.fromEntries(toolbox.results);
      if (parsed.success) {
        draft = polishDraft(toDraft(parsed.data)).draft; // filler words never cost a repair round
        lastDraft = draft;
        located = verifyLocated(draft, known, request.prefs);
        issues.push(...located.map((l) => l.issue));
      }
      if (issues.length === 0 && draft) {
        accepted = draft;
        break;
      }
      lastIssues = issues;
      // A plan with a few fewer sentences beats a model round trip, and beats the fallback: leave out the supporting sentences that
      // fail (and, once the repair round is spent, give a still-wrong headline its template).
      const salvaged = draft ? salvage(draft, located, known, request.prefs, { replaceHeadlines: stats.repairs >= 1 }) : null;
      if (salvaged) {
        accepted = salvaged.draft;
        break;
      }
      if (stats.repairs >= 1) return fallback();
      stats.repairs = 1;
      results.push(resultBlock(use.toolUseId, repairMessage(issues), false));
    }

    if (accepted) {
      return assemblePlan({ day: request.day, draft: accepted, results: toolbox.results, verified: true, issues: lastIssues, stats: finish() });
    }
    messages.push({ role: "user", content: results });
  }
}

export type { AgentRequest };
