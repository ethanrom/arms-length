import { describe, expect, it } from "vitest";
import type { RehearsePrefs } from "@/lib/contracts";
import { salvage } from "./salvage";
import { goodDraft, stubFreeFix, stubObserve } from "./test-helpers";
import type { AnyResult } from "./types";
import { verifyLocated, verifyPlan, type PlanDraft } from "./verify";

const prefs: RehearsePrefs = { callDevice: "laptop", noMakeup: false };
const results: Record<string, AnyResult> = { r1: stubObserve("r1") };

function broken(patch: (d: PlanDraft) => void): PlanDraft {
  const d = goodDraft();
  patch(d);
  return d;
}

const run = (d: PlanDraft, replaceHeadlines = false) => salvage(d, verifyLocated(d, results, prefs), results, prefs, { replaceHeadlines });

describe("salvage", () => {
  it("leaves out notice and out-of-sight sentences that fail, keeping the rest", () => {
    const d = broken((x) => {
      x.moments[0].notice = [x.moments[0].notice[0], { text: "About 4 in 7 of your pores can be seen.", refs: ["r1"] }];
      x.moments[0].outOfSight = [{ text: "Nobody will ever see them.", refs: ["r1"] }, ...x.moments[0].outOfSight];
    });
    const fixed = run(d)!;
    expect(fixed.dropped).toBe(2);
    expect(fixed.draft.moments[0].notice.map((c) => c.text)).toEqual(["A typical viewer could pick out about 1 in 12 of your pores."]);
    expect(fixed.draft.moments[0].outOfSight.map((c) => c.text)).toEqual(["Breakouts stay out of sight for a typical viewer."]);
    expect(verifyPlan(fixed.draft, results, prefs)).toEqual([]);
    // The input is not changed.
    expect(d.moments[0].notice).toHaveLength(2);
  });

  it("does not touch a plan whose problem is a headline, an action, the summary or a scene (until headlines are allowed)", () => {
    const headline = broken((x) => (x.moments[0].headline = { text: "About 1 in 20 of your pores show.", refs: ["r1"] }));
    expect(run(headline)).toBeNull();
    const action = broken((x) => (x.moments[0].action = { kind: "none", claim: { text: "Nothing, about 4 in 7.", refs: [] } }));
    expect(run(action, true)).toBeNull();
    const summary = broken((x) => (x.summary = { text: "Nobody will ever notice.", refs: ["r1"] }));
    expect(run(summary, true)).toBeNull();
    const scene = broken((x) => (x.moments[0].scene = { scene: "presenting" }));
    expect(run(scene, true)).toBeNull();
    const title = broken((x) => (x.moments[0].title = "Table for 4"));
    expect(run(title, true)).toBeNull();
  });

  it("gives a still-wrong headline its template once that is allowed, built from the moment's own observation", () => {
    const d = broken((x) => (x.moments[0].headline = { text: "No free change hides it.", refs: ["r1"] }));
    expect(run(d, false)).toBeNull();
    const fixed = run(d, true)!;
    expect(fixed.replaced).toBe(1);
    const headline = fixed.draft.moments[0].headline!;
    expect(headline.refs).toEqual(["r1"]);
    expect(headline.text).toMatch(/^Across the table, your breakouts are out of sight/);
    expect(headline.text.length).toBeLessThanOrEqual(120);
    expect(verifyPlan(fixed.draft, results, prefs)).toEqual([]);
  });

  it("mixes: a bad headline and a bad supporting sentence are both fixed after the repair round", () => {
    const d = broken((x) => {
      x.moments[0].headline = { text: "Distance is the only lever here.", refs: ["r1"] };
      x.moments[0].notice = [{ text: "About 3 in 9 of your pores.", refs: ["r1"] }];
    });
    expect(run(d, false)).toBeNull();
    const fixed = run(d, true)!;
    expect(fixed).toMatchObject({ dropped: 1, replaced: 1 });
  });

  it("returns null for a clean plan, and for a headline whose observation is not in the results", () => {
    expect(run(goodDraft(), true)).toBeNull();
    const d = broken((x) => (x.moments[0].headline = { text: "No free change hides it.", refs: ["r1"] }));
    const fix: Record<string, AnyResult> = { r1: stubFreeFix("r1", true) };
    expect(salvage(d, [{ issue: { momentId: "m1", code: "banned_word", detail: "x" }, moment: 0, field: "headline", index: 0 }], fix, prefs, { replaceHeadlines: true })).toBeNull();
  });
});
