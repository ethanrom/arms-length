import { describe, expect, it } from "vitest";
import { FREE_FIX_GOAL } from "../../lib/rehearse/fix";
import type { ConcernAtScene } from "../../lib/contracts/rehearse";
import { parseReply, CONCERN_IDS } from "./prompts";
import {
  clusterBootstrap, consistency, judge, judgeMoment, pearson, planVerdicts, rates, seeded, tally, truthOf, TRUTH_THRESHOLD,
  type MomentChoice, type Stand, type Truth,
} from "./score";
import { sceneInputOf, faceOf, truthFor } from "./truth";
import { defaultCall, videoCallFrame } from "../../lib/rehearse";
import summaryJson from "./results/summary.json";

const at = (concern: ConcernAtScene["concern"], typicalShare: number, over: Partial<ConcernAtScene> = {}): ConcernAtScene => ({
  concern, targetCount: 10, typicalShare, typicalCount: Math.round(typicalShare * 10), boundShare: Math.min(1, typicalShare + 0.1), boundCount: 0, soft: false, ...over,
});
const stand = (noticeable: boolean | null, advice: Stand["advice"], share: number | null = null): Stand => ({ noticeable, advice, share });

describe("truth", () => {
  it("noticeable means a typical share above the lightest-touch line, and the line is the app's", () => {
    expect(TRUTH_THRESHOLD).toBe(FREE_FIX_GOAL);
    const t = truthOf([at("pore", 0.1), at("acne", 0.11), at("age_spot", 0), at("dark_circle", 1, { soft: true })]);
    expect(t.map((x) => [x.concern, x.noticeable])).toEqual([["pore", false], ["acne", true], ["age_spot", false], ["dark_circle", true]]);
    expect(truthOf([at("pore", 0.2)], 0.25)[0].noticeable).toBe(false);
  });

  it("skips concerns the face has no targets for", () => {
    expect(truthOf([at("redness", 1, { targetCount: 0, soft: true }), at("pore", 0.5)]).map((x) => x.concern)).toEqual(["pore"]);
  });
});

describe("judging one concern at one moment", () => {
  const truth = (share: number): Truth => ({ concern: "pore", soft: false, share, noticeable: share > 0.1 });

  it("separates a miss, a false alarm, an over-cover and an under-warning", () => {
    const miss = judge(truth(0.5), stand(false, "nothing", 0.05));
    expect([miss.contradiction, miss.miss, miss.falseAlarm, miss.underWarn, miss.overCover]).toEqual([true, true, false, true, false]);
    expect(miss.shareError).toBeCloseTo(0.45, 12);

    const alarm = judge(truth(0.03), stand(true, "cover", 0.4));
    expect([alarm.contradiction, alarm.falseAlarm, alarm.overCover, alarm.underWarn]).toEqual([true, true, true, false]);
    // A little is in sight (3%), so "noticeable" is a true statement that the 10% line calls out of sight.
    expect(alarm.edge).toBe(true);
    expect(judge(truth(0), stand(true, "nothing")).edge).toBe(false);

    const right = judge(truth(0.5), stand(true, "cover", 0.5));
    expect([right.contradiction, right.overCover, right.underWarn, right.shareError]).toEqual([false, false, false, 0]);
  });

  it("a system that took no stand is neither right nor wrong", () => {
    const j = judge(truth(0.5), stand(null, null));
    expect([j.contradiction, j.miss, j.falseAlarm, j.overCover, j.underWarn, j.shareError]).toEqual([null, false, false, false, false, null]);
  });

  it("clamps a share outside 0 to 1", () => {
    expect(judge(truth(1), stand(true, "cover", 1.4)).shareError).toBe(0);
  });
});

describe("rates", () => {
  const concerns = [at("pore", 0.02), at("acne", 0.6), at("age_spot", 0.05), at("wrinkle", 0.9)];
  const truths = truthOf(concerns);

  it("counts over-cover among out-of-sight concerns and under-warning among noticeable ones", () => {
    const js = judgeMoment(truths, {
      pore: stand(true, "cover", 0.5), // out of sight, covered: over-cover, false alarm
      acne: stand(false, "nothing", 0.1), // noticeable, said nothing: miss, under-warning
      age_spot: stand(false, "nothing", 0), // out of sight, right
      wrinkle: stand(true, "cover", 0.9), // noticeable, right
    });
    const r = rates(tally(js));
    expect(r.contradiction).toBeCloseTo(2 / 4, 12);
    expect(r.overCover).toBeCloseTo(1 / 2, 12); // 1 of the 2 out-of-sight concerns
    expect(r.overCoverOfAll).toBeCloseTo(1 / 4, 12);
    expect(r.underWarning).toBeCloseTo(1 / 2, 12); // 1 of the 2 noticeable concerns
    expect(r.miss).toBeCloseTo(1 / 2, 12);
    expect(r.falseAlarm).toBeCloseTo(1 / 2, 12);
    expect(r.coverRate).toBeCloseTo(2 / 4, 12);
  });

  it("is null, not 0, when a denominator is empty", () => {
    const r = rates(tally(judgeMoment(truthOf([at("acne", 0.6)]), { acne: stand(true, "cover", 0.6) })));
    expect(r.overCover).toBeNull();
    expect(r.falseAlarm).toBeNull();
    expect(r.contradiction).toBe(0);
  });

  it("averages the share error over the stands that gave a share, and again without soft areas", () => {
    const js = judgeMoment(truthOf([at("pore", 0.4), at("dark_circle", 1, { soft: true })]), { pore: stand(true, "nothing", 0.1), dark_circle: stand(false, "nothing", 0) });
    const r = rates(tally(js));
    expect(r.meanAbsShareError).toBeCloseTo((0.3 + 1) / 2, 12);
    expect(r.meanAbsShareErrorHard).toBeCloseTo(0.3, 12);
  });
});

describe("run-to-run consistency", () => {
  const moment = (scene: string, p: boolean, a: Stand["advice"] = "nothing"): MomentChoice => ({ scene, light: "indoor", viewer: "typical", stands: { pore: stand(p, a, 0.2), acne: stand(true, a, 0.5) } });

  it("compares by position, only like with like for the headline figure", () => {
    const a = [moment("conversation", true), moment("dinner_table", false)];
    const b = [moment("conversation", false), moment("meeting_room", true)];
    const c = consistency(a, b, ["pore", "acne"]);
    expect([c.pairs, c.sameMomentCount, c.alignedMoments, c.sameChoice]).toEqual([1, 1, 2, 1]);
    expect([c.comparedSame, c.disagreeSame]).toEqual([2, 1]); // pore differs, acne agrees, first moment only
    expect([c.comparedAll, c.disagreeAll]).toEqual([4, 2]);
    expect(c.shareAbsDiffSame).toBeCloseTo(0, 12);
  });

  it("notes a different number of moments", () => {
    expect(consistency([moment("conversation", true)], [moment("conversation", true), moment("presenting", true)], ["pore"]).sameMomentCount).toBe(0);
  });
});

describe("what the agent's sentences say about each concern", () => {
  it("reads notice and outOfSight lists by the product's names", () => {
    const v = planVerdicts(
      ["A typical viewer could pick out about half of dark spots, plus redness and under-eye puffiness."],
      ["Pores and fine lines are out of sight.", "About 1 in 12 redness is hidden."],
    );
    expect(v.get("age_spot")).toBe("noticeable");
    expect(v.get("eye_bag")).toBe("noticeable");
    expect(v.get("pore")).toBe("outOfSight");
    expect(v.get("wrinkle")).toBe("outOfSight");
    expect(v.get("redness")).toBe("both");
    expect(v.has("acne")).toBe(false);
    expect(v.has("dark_circle")).toBe(false);
  });
});

describe("statistics", () => {
  it("Pearson r", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  it("the bootstrap is reproducible, brackets the sample statistic and is degenerate for identical clusters", () => {
    const xs = [0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0];
    const mean = (s: readonly number[]) => s.reduce((p, q) => p + q, 0) / s.length;
    const a = clusterBootstrap(xs, mean, { reps: 500, seed: 7 });
    expect(clusterBootstrap(xs, mean, { reps: 500, seed: 7 })).toEqual(a);
    expect(a![0]).toBeLessThan(mean(xs));
    expect(a![1]).toBeGreaterThan(mean(xs));
    expect(clusterBootstrap([2, 2, 2], mean, { reps: 50 })).toEqual([2, 2]);
    expect(clusterBootstrap([], mean)).toBeNull();
    const r = seeded(3);
    const first = [r(), r(), r()];
    const r2 = seeded(3);
    expect([r2(), r2(), r2()]).toEqual(first);
    expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("the unaided model's reply", () => {
  const concerns = (over: Record<string, unknown> = {}) =>
    Object.fromEntries(CONCERN_IDS.map((id) => [id, id in over ? over[id] : { noticeable: true, share: 0.4, advice: "cover" }]));
  const reply = (moments: unknown[]) => JSON.stringify({ moments });
  const m = (over: Record<string, unknown> = {}) => ({ title: "Lunch", time: "12pm", scene: "cafe_table", light: "daylight", viewer: "typical", concerns: concerns(over) });

  it("reads a fenced reply, null as 'not on this face', and numbers written as strings", () => {
    const got = parseReply("```json\n" + reply([m({ acne: null, pore: { noticeable: "false", share: "0.05", advice: "Nothing" } })]) + "\n```");
    expect(got).not.toBeNull();
    const s = got![0].stands;
    expect(s.acne).toEqual({ noticeable: false, share: 0, advice: "nothing", absent: true });
    expect(s.pore).toEqual({ noticeable: false, share: 0.05, advice: "nothing" });
    expect(got![0].scene).toBe("cafe_table");
  });

  it("rejects what cannot be scored: a missing concern, a bad advice word, no moments, too many moments", () => {
    const missing = m();
    delete (missing.concerns as Record<string, unknown>).redness;
    expect(parseReply(reply([missing]))).toBeNull();
    expect(parseReply(reply([m({ pore: { noticeable: true, share: 0.4, advice: "maybe" } })]))).toBeNull();
    expect(parseReply(reply([]))).toBeNull();
    expect(parseReply(reply(Array.from({ length: 9 }, () => m())))).toBeNull();
    expect(parseReply("I cannot answer that.")).toBeNull();
    expect(parseReply(undefined)).toBeNull();
  });
});

describe("our model's answer for the unaided model's choice", () => {
  it("a call is scored at the default call of the day's device; ids outside the tables cannot be scored", () => {
    const base = { light: "videoCall", viewer: "typical" };
    for (const device of ["laptop", "phone"] as const) {
      const input = sceneInputOf({ scene: "video_call", ...base }, device)!;
      expect(input.call).toEqual(defaultCall(device));
      expect(truthFor(faceOf("p2b"), input).distanceM).toBeCloseTo(videoCallFrame(defaultCall(device), "x").equivalentDistanceM, 12);
    }
    expect(sceneInputOf({ scene: "restaurant", ...base }, "laptop")).toBeNull();
    expect(sceneInputOf({ scene: "conversation", light: "candle", viewer: "typical" }, "laptop")).toBeNull();
    expect(sceneInputOf({ scene: "conversation", light: "indoor", viewer: "hawk" }, "laptop")).toBeNull();
    expect(sceneInputOf({ scene: "conversation", light: "indoor", viewer: "typical" }, "laptop")!.call).toBeUndefined();
  });

  it("farther away never shows more", () => {
    const face = faceOf("p2b");
    const share = (scene: "cafe_table" | "meeting_room") => truthFor(face, { scene, light: "indoor", viewer: "typical" }).concerns.find((c) => c.concern === "pore")!.typicalShare;
    expect(share("meeting_room")).toBeLessThanOrEqual(share("cafe_table"));
  });
});

describe("the committed summary", () => {
  const s = summaryJson;

  it("kept to the caps and adds up", () => {
    expect(s.meta.calls).toBeLessThanOrEqual(s.meta.caps.calls);
    expect(s.meta.estimatedCostUsd).toBeLessThanOrEqual(s.meta.caps.usd);
    expect(s.meta.agentRunsHere + s.meta.unaidedCalls + s.meta.cacheRejectionRepeats).toBe(s.meta.calls);
    for (const b of [s.headline.without, s.headline.with, s.headline.marksOnly.without, s.headline.marksOnly.with]) {
      expect(b.tally.contradictions).toBe(b.tally.misses + b.tally.falseAlarms);
      expect(b.tally.noticeable + b.tally.outOfSight).toBe(b.tally.claims);
    }
    expect(s.agent.outcomes.verified + s.agent.outcomes.repaired + s.agent.outcomes.fallback).toBe(s.agent.plans);
  });

  it("every number the shipped plans carry was in a quote of the result it cites", () => {
    expect(s.agent.verifier.unverifiedNumbersShipped).toBe(0);
    expect(s.agent.verifier.issuesTotal).toBe(0);
  });
});
