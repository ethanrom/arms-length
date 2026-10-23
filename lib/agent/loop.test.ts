import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it } from "vitest";
import type { RehearseEvent } from "@/lib/contracts";
import { lintText } from "@/lib/copy/lint";
import { runAgent } from "./loop";
import { realEngine } from "./realEngine";
import { demoFace, fakeLlm, toolUse, type Reply, type Script } from "./test-helpers";
import { LlmError, type AgentRequest } from "./types";
import { verifyPlan } from "./verify";

const face = demoFace("p3a");
const request: AgentRequest = { day: "Dinner date at 7, then a team meeting", prefs: { callDevice: "laptop", noMakeup: false } };

function run(llm: ReturnType<typeof fakeLlm>, extra: Partial<Parameters<typeof runAgent>[0]> = {}) {
  const events: RehearseEvent[] = [];
  const promise = runAgent({ face, request, llm, engine: realEngine, emit: (e) => events.push(e), ...extra });
  return { events, promise };
}

const observe = (label: string, scene: string, extra: Record<string, unknown> = {}) => toolUse("observe_scene", { label, scene, ...extra });

/** A final_answer that rests on the two observe results of the last turn (refs read from what the tools returned). */
function answerFrom(last: Record<string, unknown>[], overrides: { notice?: string; headline?: string } = {}): ContentBlock {
  const views = last as unknown as { ref: string; quotes: Record<string, string> }[];
  const titles = ["Dinner date", "Team meeting"];
  const scenes = ["dinner_table", "meeting_room"];
  return toolUse("final_answer", {
    moments: views.map((v, i) => ({
      time: i === 0 ? "7pm" : null,
      title: titles[i],
      scene: { scene: scenes[i] },
      headline: { text: overrides.headline && i === 0 ? overrides.headline : `At ${v.quotes.distance}, your skin looks relaxed.`, refs: [v.ref] },
      observeRef: v.ref,
      assumptions: ["I took this moment from your description."],
      notice: overrides.notice && i === 0 ? [{ text: overrides.notice, refs: [v.ref] }] : [],
      outOfSight: [{ text: `At ${v.quotes.distance}, a typical viewer sees your skin in ${v.quotes.light}.`, refs: [v.ref] }],
      action: { kind: "none", claim: { text: "Nothing needs doing here.", refs: [] } },
    })),
    summary: { text: "Your day looks relaxed at the distances you described.", refs: views.map((v) => v.ref) },
  });
}

const parallelObserve: Script = () => ({
  content: [{ reasoningContent: { reasoningText: { text: "Two moments.", signature: "sig" } } }, observe("Dinner date", "dinner_table"), observe("Team meeting", "meeting_room")],
});

describe("runAgent", () => {
  it("runs parallel tool calls, verifies the plan and reports stats", async () => {
    const llm = fakeLlm([parallelObserve, ({ last }) => ({ content: [answerFrom(last)] })]);
    const { events, promise } = run(llm);
    const plan = await promise;

    expect(plan.verified).toBe(true);
    expect(plan.issues).toEqual([]);
    expect(plan.moments.map((m) => [m.id, m.title, m.observeRef])).toEqual([
      ["m1", "Dinner date", "r1"],
      ["m2", "Team meeting", "r2"],
    ]);
    expect(plan.moments[0].scene).toMatchObject({ scene: "dinner_table", light: "home", viewer: "typical", distanceM: 1.5 });
    expect(Object.keys(plan.results)).toEqual(["r1", "r2"]);
    expect(plan.moments[0].outOfSight[0].refs).toEqual(["r1"]);
    expect(verifyPlan({ moments: plan.moments, summary: plan.summary }, plan.results, request.prefs)).toEqual([]);
    expect(plan.stats).toMatchObject({ turns: 2, toolCalls: 3, inputTokens: 2000, outputTokens: 200, repairs: 0 });

    expect(events.map((e) => (e.type === "step" ? [e.tool, e.label] : e.type))).toEqual([
      ["observe_scene", 'Running the vision model for "Dinner date"'],
      ["observe_scene", 'Running the vision model for "Team meeting"'],
      ["final_answer", "Checking every number in your day plan"],
    ]);
  });

  it("names the moment on the steps that find it, and keeps the headline with its refs", async () => {
    const llm = fakeLlm([
      () => ({
        content: [
          toolUse("video_call_frame", { label: "Morning standup", device: "laptop", cameraDistanceCm: 50, layout: "gallery" }),
          observe("Dinner date", "dinner_table"),
          observe("flaw night", "cafe_table"),
          toolUse("find_free_fix", { label: "Dinner date", moment: { scene: "dinner_table" }, concerns: ["pore"] }),
        ],
      }),
      () => ({ content: [{ text: "stop" }] }),
    ]);
    const { events, promise } = run(llm, { maxTurns: 1 });
    await promise;
    const steps = events.flatMap((e) => (e.type === "step" ? [e] : []));
    expect(steps.map((s) => s.moment ?? null)).toEqual([{ title: "Morning standup", scene: "video_call" }, { title: "Dinner date", scene: "dinner_table" }, null, null]);
  });

  it("takes filler words out before the check, so they cost no repair round, and still repairs a banned phrase", async () => {
    const llm = fakeLlm([parallelObserve, ({ last }) => ({ content: [answerFrom(last, { headline: "At 1.5 m, your skin simply looks relaxed, just as it is.", notice: "A typical viewer would really notice your dark spots." })] })]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(true);
    expect(plan.stats.repairs).toBe(0);
    expect(plan.moments[0].headline?.text).toBe("At 1.5 m, your skin looks relaxed, as it is.");
    expect(plan.moments[0].notice[0].text).toBe("A typical viewer would notice your dark spots.");

    // A phrase the polish does not cover is still caught and repaired.
    const repaired = fakeLlm([
      parallelObserve,
      ({ last }) => ({ content: [answerFrom(last, { headline: "At 1.5 m, no free change hides it." })] }),
      ({ last }) => {
        expect(JSON.stringify(last)).toContain("free change");
        return { content: [answerFrom([{ ref: "r1", quotes: { distance: "1.5 m", light: "a" } }, { ref: "r2", quotes: { distance: "2.5 m", light: "b" } }])] };
      },
    ]);
    const second = await run(repaired).promise;
    repaired.check();
    expect(second.stats.repairs).toBe(1);
  });

  it("keeps the headline, with the moment's observation made explicit", async () => {
    const llm = fakeLlm([parallelObserve, ({ last }) => ({ content: [answerFrom(last)] })]);
    const plan = await run(llm).promise;
    expect(plan.moments[0].headline).toEqual({ text: "At 1.5 m, your skin looks relaxed.", refs: ["r1"] });
    expect(plan.moments[1].headline?.refs).toEqual(["r2"]);
  });

  it("asks for a missing headline as a schema issue and accepts the repaired plan", async () => {
    const llm = fakeLlm([
      parallelObserve,
      ({ last }) => {
        const answer = answerFrom(last);
        for (const m of (answer.toolUse?.input as { moments: Record<string, unknown>[] }).moments) delete m.headline;
        return { content: [answer] };
      },
      ({ last }) => {
        expect(JSON.stringify(last)).toContain("headline");
        return { content: [answerFrom([{ ref: "r1", quotes: { distance: "1.5 m", light: "a" } }, { ref: "r2", quotes: { distance: "2.5 m", light: "b" } }])] };
      },
    ]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(true);
    expect(plan.stats.repairs).toBe(1);
    expect(plan.issues[0].code).toBe("schema");
  });

  it("returns all parallel results in one user message and passes assistant blocks back unchanged", async () => {
    const llm = fakeLlm([parallelObserve, ({ last }) => ({ content: [answerFrom(last)] })]);
    await run(llm).promise;
    const second = llm.sent[1];
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[1].content).toEqual((await parallelObserve({ index: 0, request: llm.calls[0], last: [] })).content.map((b, i) => (b.toolUse ? second[1].content[i] : b)));
    expect(second[1].content[0]).toEqual({ reasoningContent: { reasoningText: { text: "Two moments.", signature: "sig" } } });
    const results = second[2].content.filter((b) => b.toolResult);
    expect(results).toHaveLength(2);
    const ids = second[1].content.flatMap((b) => (b.toolUse ? [b.toolUse.toolUseId] : []));
    expect(results.map((b) => b.toolResult?.toolUseId)).toEqual(ids);
  });

  it("offers the model every tool, with closed schemas", async () => {
    const llm = fakeLlm([parallelObserve, ({ last }) => ({ content: [answerFrom(last)] })]);
    await run(llm).promise;
    expect(llm.calls[0].tools.map((t) => t.name)).toEqual(["list_scenes", "observe_scene", "video_call_frame", "find_free_fix", "lightest_touch", "worth_it", "receipt", "final_answer"]);
    expect(llm.calls[0].system).toContain("final_answer");
    expect(llm.calls[0].messages[0].content[0].text).toContain("Dinner date at 7");
  });

  it("accepts a near-miss tool name and answers an unknown one with the tool list", async () => {
    const llm = fakeLlm([
      () => ({ content: [toolUse("observeScene", { label: "Dinner date", scene: "dinner_table" }), toolUse("make_coffee", {})] }),
      ({ last }) => {
        expect(last[0]).toHaveProperty("ref", "r1");
        expect(JSON.stringify(last[1])).toContain("There is no tool called");
        expect(JSON.stringify(last[1])).toContain("observe_scene");
        return { content: [answerFrom([last[0]])] };
      },
    ]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(true);
  });

  it("turns a bad scene into an error result that names the valid range, and lets the model retry", async () => {
    const llm = fakeLlm([
      () => ({ content: [observe("Dinner date", "dinner_table", { distanceM: 9 })] }),
      ({ last }) => {
        const text = JSON.stringify(last[0]);
        expect(text).toContain("error");
        expect(text).toContain("between 1.2 and 2.1 m");
        return { content: [observe("Dinner date", "dinner_table", { distanceM: 1.8 })] };
      },
      ({ last }) => ({ content: [answerFrom([last[0]])] }),
    ]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(true);
    expect(plan.moments[0].scene.distanceM).toBe(1.8);
  });

  it("repairs a plan once: the issues go back as an error result and the corrected plan passes", async () => {
    const llm = fakeLlm([
      parallelObserve,
      ({ last }) => ({ content: [answerFrom(last, { notice: "A typical viewer could pick out about 4 in 7 of your dark spots." })] }),
      ({ last }) => {
        expect(JSON.stringify(last)).toMatch(/stray_number/);
        return { content: [answerFrom([{ ref: "r1", quotes: { distance: "1.5 m", light: "evening light at home" } }, { ref: "r2", quotes: { distance: "2.5 m", light: "indoor light" } }])] };
      },
    ]);
    const { events, promise } = run(llm);
    const plan = await promise;
    expect(plan.verified).toBe(true);
    expect(plan.stats.repairs).toBe(1);
    expect(plan.stats.turns).toBe(3);
    expect(new Set(plan.issues.map((i) => i.code))).toEqual(new Set(["stray_number"]));
    expect(llm.sent[2][4].content[0].toolResult?.status).toBe("error");
    expect(events.filter((e) => e.type === "step" && e.tool === "final_answer")).toHaveLength(2);
  });

  it("falls back, unverified, when the repaired plan still fails", async () => {
    const bad = ({ last }: { last: Record<string, unknown>[] }) => ({ content: [answerFrom(last, { notice: "Nobody will ever see your 12 dark spots." })] });
    const stillBad = () => ({ content: [answerFrom([{ ref: "r1", quotes: { distance: "1.5 m", light: "x" } }, { ref: "r2", quotes: { distance: "2.5 m", light: "x" } }], { notice: "Nobody will ever see 12 of them." })] });
    const llm = fakeLlm([parallelObserve, bad, stillBad]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(false);
    expect(plan.stats.repairs).toBe(1);
    expect(plan.issues.length).toBeGreaterThan(0);
    // The fallback keeps the moments the model chose, rebuilt from tool results.
    expect(plan.moments.map((m) => m.scene.scene)).toEqual(["dinner_table", "meeting_room"]);
    expect(verifyPlan({ moments: plan.moments, summary: plan.summary }, plan.results, request.prefs)).toEqual([]);
  });

  it("reports a malformed final_answer as a schema issue and repairs it", async () => {
    const llm = fakeLlm([
      parallelObserve,
      () => ({ content: [toolUse("final_answer", { moments: [], summary: { text: "x", refs: [] } })] }),
      ({ last }) => {
        expect(JSON.stringify(last)).toContain("schema");
        return { content: [answerFrom([{ ref: "r1", quotes: { distance: "1.5 m", light: "a" } }, { ref: "r2", quotes: { distance: "2.5 m", light: "b" } }])] };
      },
    ]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(true);
  });

  it("refuses final_answer called together with other tools, without spending the repair", async () => {
    const llm = fakeLlm([
      () => ({ content: [observe("Dinner date", "dinner_table"), toolUse("final_answer", { moments: [], summary: { text: "x", refs: [] } })] }),
      ({ last }) => {
        expect(JSON.stringify(last[1])).toContain("on its own");
        return { content: [answerFrom([last[0]])] };
      },
    ]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(true);
    expect(plan.stats.repairs).toBe(0);
  });

  it("nudges once when the model ends without final_answer, then accepts it", async () => {
    const llm = fakeLlm([
      parallelObserve,
      () => ({ content: [{ text: "Here is your day: relaxed." }] }),
      ({ last, request: r }) => {
        expect(r.messages[r.messages.length - 1].content[0].text).toContain("final_answer");
        void last;
        return { content: [answerFrom([{ ref: "r1", quotes: { distance: "1.5 m", light: "a" } }, { ref: "r2", quotes: { distance: "2.5 m", light: "b" } }])] };
      },
    ]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(true);
    expect(plan.stats.turns).toBe(3);
  });

  it("falls back after a second end without final_answer, rebuilding the moments it observed", async () => {
    const llm = fakeLlm([parallelObserve, () => ({ content: [{ text: "Done." }] }), () => ({ content: [{ text: "Really done." }] })]);
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(false);
    expect(plan.moments.map((m) => m.title)).toEqual(["Dinner date", "Team meeting"]);
    expect(verifyPlan({ moments: plan.moments, summary: plan.summary }, plan.results, request.prefs)).toEqual([]);
  });

  it("falls back from the day text when the model fails before doing anything", async () => {
    const llm = fakeLlm(() => {
      throw new LlmError("upstream", "boom");
    });
    const plan = await run(llm).promise;
    llm.check();
    expect(plan.verified).toBe(false);
    expect(plan.moments.map((m) => m.scene.scene)).toEqual(["dinner_table", "meeting_room"]);
    expect(plan.stats.turns).toBe(0);
  });

  it("treats a max_tokens or refusal stop as an upstream failure", async () => {
    for (const stopReason of ["max_tokens", "content_filtered", "guardrail_intervened"]) {
      const llm = fakeLlm(() => ({ content: [{ text: "..." }], stopReason }));
      const plan = await run(llm).promise;
    llm.check();
      expect(plan.verified).toBe(false);
      expect(plan.stats.turns).toBe(1);
    }
  });

  it("falls back when the time budget runs out mid-run", async () => {
    // The model never answers; the loop's own timeout aborts the call.
    const llm = fakeLlm(
      ({ request: r }) =>
        new Promise<Reply>((_, reject) => {
          r.signal?.addEventListener("abort", () => reject(new LlmError("timeout", "slow")), { once: true });
        }),
    );
    const started = Date.now();
    const plan = await run(llm, { budgetMs: 60 }).promise;
    expect(plan.verified).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(plan.moments.length).toBeGreaterThan(0);
  });

  it("stops at the turn limit", async () => {
    const llm = fakeLlm(() => ({ content: [observe("Dinner date", "dinner_table")] }));
    const plan = await run(llm, { maxTurns: 3 }).promise;
    expect(plan.verified).toBe(false);
    expect(plan.stats.turns).toBe(3);
    expect(llm.calls).toHaveLength(3);
  });

  it("throws when the caller's own signal aborts (the visitor left)", async () => {
    const controller = new AbortController();
    const llm = fakeLlm(() => {
      controller.abort();
      throw new LlmError("aborted", "gone");
    });
    await expect(run(llm, { signal: controller.signal }).promise).rejects.toBeInstanceOf(LlmError);
  });

  it("hands a follow-up the earlier moments and the question", async () => {
    const followUp: AgentRequest = {
      ...request,
      followUp: { question: "What if dinner is outdoors?", previous: { day: request.day, moments: [{ title: "Dinner date", time: "7pm", scene: { scene: "dinner_table", light: "home" } }] } },
    };
    const llm = fakeLlm(() => ({ content: [{ text: "stop" }] }));
    await run(llm, { request: followUp }).promise;
    const first = llm.calls[0].messages[0].content[0].text ?? "";
    expect(first).toContain("What if dinner is outdoors?");
    expect(first).toContain('"Dinner date" (7pm): dinner_table, light home');
  });

  it("never lets the model use lightest_touch when the user would rather not wear makeup", async () => {
    const llm = fakeLlm([
      () => ({ content: [toolUse("lightest_touch", { concern: "acne" })] }),
      ({ last }) => {
        expect(JSON.stringify(last[0])).toContain("rather not wear makeup");
        return { content: [{ text: "ok" }] };
      },
    ]);
    await run(llm, { request: { ...request, prefs: { ...request.prefs, noMakeup: true } } }).promise;
  });

  it("writes step labels that pass the copy lint", async () => {
    const llm = fakeLlm([
      () => ({
        content: [
          observe("Dinner date", "dinner_table"),
          toolUse("find_free_fix", { label: "Dinner date", moment: { scene: "dinner_table" }, concerns: ["pore"] }),
          toolUse("worth_it", { concern: "age_spot", distanceM: 1.5 }),
          toolUse("receipt", { label: "Dinner date", scene: "dinner_table", concern: "pore" }),
          toolUse("lightest_touch", { concern: "acne" }),
          toolUse("list_scenes", {}),
          observe("Dinner flaw treatment", "dinner_table"),
        ],
      }),
      () => ({ content: [{ text: "x" }] }),
    ]);
    const { events, promise } = run(llm, { maxTurns: 1 });
    await promise;
    const labels = events.flatMap((e) => (e.type === "step" ? [e.label] : []));
    expect(labels).toHaveLength(7);
    for (const label of labels) expect(lintText(label)).toEqual([]);
    // A title with a banned word is not echoed.
    expect(labels[6]).toBe("Running the vision model for this moment");
  });
});
