import { describe, expect, it } from "vitest";
import type { Claim, RehearsePrefs, VerifierIssue } from "@/lib/contracts";
import { goodDraft, stubFreeFix, stubObserve, stubTouch, stubWorth } from "./test-helpers";
import { numbersIn, verifyPlan, type PlanDraft } from "./verify";
import type { AnyResult } from "./types";

const prefs: RehearsePrefs = { callDevice: "laptop", noMakeup: false };

function resultsOf(...list: AnyResult[]): Record<string, AnyResult> {
  return Object.fromEntries(list.flatMap((r) => [[r.ref, r], ...("after" in r ? [[`${r.ref}.after`, r.after]] : [])]));
}

const base = resultsOf(stubObserve("r1"));
const codes = (issues: VerifierIssue[]) => issues.map((i) => i.code);

/** A draft with the first moment's notice replaced. */
function withNotice(text: string, refs = ["r1"]): PlanDraft {
  const d = goodDraft();
  d.moments[0].notice = [{ text, refs }];
  return d;
}

describe("numbersIn", () => {
  it("reads decimals, percents and ratios, and ignores clock times", () => {
    expect(numbersIn("about 1 in 12 of 650 at 1.50 m, 75% coverage")).toEqual(["1", "12", "650", "1.5", "75"]);
    expect(numbersIn("your 9am standup, then 7:30 pm and 14:05")).toEqual([]);
  });
});

describe("verifyPlan", () => {
  it("passes a plan whose numbers are verbatim quotes of the results it cites", () => {
    expect(verifyPlan(goodDraft(), base, prefs)).toEqual([]);
  });

  it("accepts numbers from the observation the moment rests on without an explicit ref", () => {
    expect(verifyPlan(withNotice("At 1.5 m, about 1 in 12 of your pores.", []), base, prefs)).toEqual([]);
  });

  it("rejects a wrong value", () => {
    const issues = verifyPlan(withNotice("A typical viewer could pick out about 1 in 20 of your pores."), base, prefs);
    expect(codes(issues)).toEqual(["stray_number"]);
    expect(issues[0].detail).toContain("20");
    expect(issues[0].momentId).toBe("m1");
  });

  it("rejects a stray number that no cited result has", () => {
    expect(codes(verifyPlan(withNotice("Across about 3 m your pores fade."), base, prefs))).toContain("stray_number");
  });

  it("rejects a quantity written in words that no quote contains, and accepts one a quote does", () => {
    expect(codes(verifyPlan(withNotice("About half of your pores can be seen."), base, prefs))).toEqual(["stray_number"]);
    const withWords = resultsOf({ ...stubObserve("r1"), quotes: { ...stubObserve("r1").quotes, "pore.typical": "about half" } });
    expect(verifyPlan(withNotice("A typical viewer could pick out about half of your pores."), withWords, prefs)).toEqual([]);
  });

  it("needs bound wording for a number only the sharpest-eyes quote has", () => {
    const bare = verifyPlan(withNotice("Someone could pick out 81 of your pores."), base, prefs);
    expect(codes(bare)).toEqual(["bound_wording"]);
    expect(verifyPlan(withNotice("At most 81 of 650 pores could be picked out, and only by the sharpest eyes."), base, prefs)).toEqual([]);
    expect(verifyPlan(withNotice("Even perfect eyes could pick out at most 1 in 8 of your pores."), base, prefs)).toEqual([]);
  });

  it("does not ask for bound wording when a typical quote carries the number too", () => {
    // "1" is in both "about 1 in 12" (typical) and "at most 1 in 8" (bound).
    expect(verifyPlan(withNotice("About 1 in 12 of your pores."), base, prefs)).toEqual([]);
  });

  it("counts a free fix's re-observed scene when the fix is cited", () => {
    const results = resultsOf(stubObserve("r1"), stubFreeFix("r2", true));
    const d = goodDraft();
    d.moments[0].action = { kind: "free_fix", ref: "r2", claim: { text: "Sit or stand about 30 cm further away (about 1.8 m apart); about 1 in 40 of your pores remain in sight.", refs: ["r2"] } };
    expect(verifyPlan(d, results, prefs)).toEqual([]);
  });

  it("rejects banned words and absolutes anywhere in the text", () => {
    const d = goodDraft();
    d.moments[0].outOfSight = [{ text: "This hides every flaw.", refs: ["r1"] }];
    d.summary = { text: "Nobody will ever notice, I promise.", refs: ["r1"] };
    d.moments[0].title = "Dinner treatment";
    const found = codes(verifyPlan(d, base, prefs));
    expect(found).toContain("banned_word");
    expect(found).toContain("absolute");
    const details = verifyPlan(d, base, prefs).map((i) => i.detail).join("|");
    expect(details).toContain("flaw");
    expect(details).toContain("treatment");
    expect(details).toMatch(/nobody|never|promise/i);
  });

  it("rejects claims no tool result supports, but lets an assumption describe the scene", () => {
    for (const text of ["Under-eye shadows are very common.", "Most guests will be watching the couple.", "Keep your sunglasses handy.", "Everyone sees the same."]) {
      expect(verifyPlan(withNotice(text), base, prefs).map((i) => i.code), text).toHaveLength(1);
    }
    const d = goodDraft();
    d.moments[0].assumptions = ["I took the room as normal office light."];
    expect(verifyPlan(d, base, prefs)).toEqual([]);
  });

  it("rejects numbers in a title or an assumption, but not a clock time", () => {
    const d = goodDraft();
    d.moments[0].title = "Dinner at 7pm";
    expect(verifyPlan(d, base, prefs)).toEqual([]);
    d.moments[0].title = "Table for 4";
    d.moments[0].assumptions = ["I took it as 1.5 m across."];
    expect(verifyPlan(d, base, prefs).map((i) => i.code)).toEqual(["stray_number", "stray_number"]);
  });

  it("rejects an unknown ref", () => {
    const issues = verifyPlan(withNotice("Pores are mostly out of sight.", ["r9"]), base, prefs);
    expect(codes(issues)).toEqual(["unknown_ref"]);
    const d = goodDraft();
    d.moments[0].observeRef = "r7";
    expect(codes(verifyPlan(d, base, prefs))).toContain("unknown_ref");
  });

  describe("scenes", () => {
    it("rejects an observeRef that is not an observation, or that observed another scene, light or viewer", () => {
      const results = resultsOf(stubObserve("r1"), stubFreeFix("r2", true));
      const notObserve = goodDraft();
      notObserve.moments[0].observeRef = "r2";
      expect(codes(verifyPlan(notObserve, results, prefs))).toContain("bad_scene");

      const other = goodDraft();
      other.moments[0].scene = { scene: "presenting", light: "indoor", viewer: "typical" };
      expect(codes(verifyPlan(other, base, prefs))).toEqual(["bad_scene"]);

      const light = goodDraft();
      light.moments[0].scene = { scene: "dinner_table", light: "daylight" };
      expect(codes(verifyPlan(light, base, prefs))).toEqual(["bad_scene"]);

      const viewer = goodDraft();
      viewer.moments[0].scene = { scene: "dinner_table", viewer: "blurry" };
      expect(codes(verifyPlan(viewer, base, prefs))).toEqual(["bad_scene"]);
    });

    it("rejects a video call whose geometry differs from the observed one", () => {
      const observed = stubObserve("r1", "video_call");
      observed.input = { scene: "video_call", light: "videoCall", viewer: "typical", call: { device: "laptop", cameraDistanceCm: 50, layout: "gallery" } };
      const d = goodDraft();
      d.moments[0].scene = { scene: "video_call", call: { device: "laptop", cameraDistanceCm: 60, layout: "gallery" } };
      expect(codes(verifyPlan(d, resultsOf(observed), prefs))).toEqual(["bad_scene"]);
      d.moments[0].scene = { scene: "video_call", call: { device: "laptop", cameraDistanceCm: 50, layout: "gallery" } };
      expect(verifyPlan(d, resultsOf(observed), prefs)).toEqual([]);
    });
  });

  describe("actions", () => {
    const claim: Claim = { text: "Here is the smallest change.", refs: [] };
    const act = (action: PlanDraft["moments"][number]["action"], results: Record<string, AnyResult>, p = prefs) => {
      const d = goodDraft();
      d.moments[0].action = action;
      return verifyPlan(d, results, p);
    };

    it("accepts the right kind of result", () => {
      expect(act({ kind: "free_fix", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubFreeFix("r2", true)))).toEqual([]);
      expect(act({ kind: "lightest_touch", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubTouch("r2", "met")))).toEqual([]);
      expect(act({ kind: "lightest_touch", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubTouch("r2", "not_met")))).toEqual([]);
      expect(act({ kind: "worth_it", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubWorth("r2", true)))).toEqual([]);
    });

    it("rejects a free fix that is not reachable, is for another scene, or is not a free fix", () => {
      expect(codes(act({ kind: "free_fix", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubFreeFix("r2", false))))).toEqual(["bad_action"]);
      expect(codes(act({ kind: "free_fix", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubFreeFix("r2", true, "presenting"))))).toEqual(["bad_action"]);
      expect(codes(act({ kind: "free_fix", ref: "r1", claim }, base))).toEqual(["bad_action"]);
    });

    it("rejects a lightest touch with no measured plan, or when the user would rather not wear makeup", () => {
      expect(codes(act({ kind: "lightest_touch", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubTouch("r2", "no_lever"))))).toEqual(["bad_action"]);
      expect(codes(act({ kind: "lightest_touch", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubTouch("r2", "not_measured"))))).toEqual(["bad_action"]);
      expect(codes(act({ kind: "lightest_touch", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubTouch("r2", "met")), { ...prefs, noMakeup: true }))).toEqual(["bad_action"]);
    });

    it("rejects a worth it that was not simulated, and an action with no ref", () => {
      expect(codes(act({ kind: "worth_it", ref: "r2", claim }, resultsOf(stubObserve("r1"), stubWorth("r2", false))))).toEqual(["bad_action"]);
      expect(codes(act({ kind: "worth_it", ref: "", claim }, base))).toEqual(["bad_action"]);
    });

    it("rejects an action ref that does not exist", () => {
      expect(codes(act({ kind: "free_fix", ref: "r5", claim }, base))).toEqual(["unknown_ref"]);
    });
  });

  describe("shape", () => {
    it("needs 1 to 8 moments", () => {
      const none = { ...goodDraft(), moments: [] };
      expect(codes(verifyPlan(none, base, prefs))).toEqual(["schema"]);
      const nine = { ...goodDraft(), moments: Array.from({ length: 9 }, () => goodDraft().moments[0]) };
      expect(codes(verifyPlan(nine, base, prefs))).toContain("schema");
      const eight = { ...goodDraft(), moments: Array.from({ length: 8 }, () => goodDraft().moments[0]) };
      expect(verifyPlan(eight, base, prefs)).toEqual([]);
    });

    it("keeps claims to 200 characters", () => {
      const long = `${"A typical viewer could pick out about 1 in 12 of your pores. ".repeat(4)}`;
      expect(long.length).toBeGreaterThan(200);
      expect(codes(verifyPlan(withNotice(long), base, prefs))).toEqual(["schema"]);
      expect(codes(verifyPlan(withNotice(""), base, prefs))).toEqual(["schema"]);
    });
  });
});
