import { describe, expect, it } from "vitest";
import type { DayPlan, ObserveResult, PlannedMoment } from "@/lib/contracts/rehearse";
import { chipFor, coverLines, headlineFor, joinList, noNeedLine, parseHour, ribbonPositions, stillShows, tipFor } from "./moments";

describe("parseHour", () => {
  it("reads am, pm and 24 hour times", () => {
    expect(parseHour("9am")).toBe(9);
    expect(parseHour("12:30")).toBe(12.5);
    expect(parseHour("2pm")).toBe(14);
    expect(parseHour("12am")).toBe(6); // midnight is before the ribbon starts: it sits at the left edge
    expect(parseHour("7:45 pm")).toBe(19.75);
  });

  it("reads a bare hour as the evening for dinner, drinks and dates, and the morning otherwise", () => {
    expect(parseHour("7", "Dinner date")).toBe(19);
    expect(parseHour("at 7", "Drinks with colleagues")).toBe(19);
    expect(parseHour("8", "Video standup")).toBe(8);
    expect(parseHour("3", "Presenting")).toBe(15);
  });

  it("falls back to the words, and to null when there are none", () => {
    expect(parseHour("lunch")).toBe(12.5);
    expect(parseHour("after work")).toBe(18);
    expect(parseHour(null, "Dinner at the harbour")).toBe(19);
    expect(parseHour(null, "A moment")).toBeNull();
    expect(parseHour("sometime")).toBeNull();
  });
});

describe("ribbonPositions", () => {
  const at = (...times: (string | null)[]) => ribbonPositions(times.map((time) => ({ time, title: "x" })));

  it("places markers by their time between 6am and midnight", () => {
    const [a, b, c] = ribbonPositions([
      { time: "9am", title: "Standup" },
      { time: "12:30", title: "Lunch" },
      { time: "7", title: "Dinner date" },
    ]);
    expect(a).toBeCloseTo(3 / 18, 2);
    expect(b).toBeCloseTo(6.5 / 18, 2);
    expect(c).toBeCloseTo(13 / 18, 2);
  });

  it("spreads moments evenly when none has a time, and fills a gap between neighbours", () => {
    expect(at(null, null, null)).toEqual([0.045, 0.5, 0.955]);
    const [a, b, c] = at("9am", null, "7pm");
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(c);
  });

  it("keeps markers apart and on the ribbon", () => {
    const xs = at("9am", "9:15am", "9:20am", "11pm", "11:30pm");
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(0.0899);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.045);
    expect(Math.max(...xs)).toBeLessThanOrEqual(0.955);
  });

  it("handles one moment and none", () => {
    expect(at(null)).toEqual([0.5]);
    expect(ribbonPositions([])).toEqual([]);
  });
});

type Row = ObserveResult["concerns"][number];
const concern = (id: Row["concern"], typicalShare: number, soft = false, targetCount = 10): Row => ({
  concern: id,
  targetCount,
  typicalShare,
  typicalCount: Math.round(typicalShare * targetCount),
  boundShare: typicalShare,
  boundCount: Math.round(typicalShare * targetCount),
  soft,
});

const observe = (concerns: Row[], scene: ObserveResult["input"]["scene"] = "dinner_table"): ObserveResult => ({
  ref: "o",
  quotes: {},
  assumptions: [],
  input: { scene, light: "home", viewer: "typical" },
  distanceM: 1.5,
  luminanceCdM2: 12,
  acuityScale: 1,
  concerns,
});

const moment = (over: Partial<PlannedMoment> = {}): PlannedMoment => ({
  id: "m1",
  time: "7",
  title: "Dinner date",
  scene: { scene: "dinner_table" },
  observeRef: "o",
  assumptions: [],
  notice: [],
  outOfSight: [],
  action: { kind: "none", claim: { text: "Nothing needed.", refs: [] } },
  ...over,
});

describe("headlineFor", () => {
  it("uses the checked headline when the plan has one", () => {
    expect(headlineFor(moment({ headline: { text: "  Soft and relaxed.  ", refs: [] } }), null)).toBe("Soft and relaxed.");
  });

  it("writes a kind line from the numbers for older plans, without digits", () => {
    const calm = observe([concern("pore", 0), concern("age_spot", 0.05)]);
    expect(headlineFor(moment(), calm)).toBe("From here, the fine detail stays soft.");
    expect(headlineFor(moment(), observe(calm.concerns, "video_call"))).toBe("On the call, the fine detail stays soft.");

    const one = observe([concern("acne", 0.4), concern("pore", 0)]);
    expect(headlineFor(moment(), one)).toBe("Breakouts are what can still be picked out; the rest stays soft.");
    const two = observe([concern("age_spot", 0.5), concern("acne", 0.4)]);
    expect(headlineFor(moment(), two)).toBe("Dark spots and breakouts can still be picked out; the rest stays soft.");
    const many = observe([concern("age_spot", 0.5), concern("acne", 0.4), concern("wrinkle", 0.3)]);
    expect(headlineFor(moment(), many)).toBe("A few things can still be picked out; most of the detail stays soft.");
    for (const o of [calm, one, two, many]) expect(headlineFor(moment(), o)).not.toMatch(/\d/);
  });

  it("counts a soft area when it is seen at all, and a spread concern only above a tenth", () => {
    const soft = observe([concern("redness", 1, true, 1), concern("pore", 0.1), concern("acne", 0.11)]);
    expect(stillShows(soft).map((c) => c.concern)).toEqual(["redness", "acne"]);
  });
});

describe("chipFor and tipFor", () => {
  it("names the three kinds of advice", () => {
    expect(chipFor(moment()).label).toBe("Nothing to do");
    expect(chipFor(moment()).claim).toBeNull();
    const tip = chipFor(moment({ action: { kind: "free_fix", ref: "f", claim: { text: "Sit back.", refs: ["f"] } } }));
    expect(tip).toMatchObject({ kind: "tip", label: "One small tip", claim: { text: "Sit back." } });
    const touch = chipFor(moment({ action: { kind: "lightest_touch", ref: "t", claim: { text: "60%.", refs: ["t"] } } }));
    expect(touch).toMatchObject({ kind: "touch", label: "If you’d like" });
  });

  it("hands over the re-run scene only for a free fix that works", () => {
    const after = observe([concern("pore", 0)]);
    const fix = (reachable: boolean) => ({
      ref: "f",
      quotes: {},
      assumptions: [],
      reachable,
      lever: reachable ? "distance" : null,
      from: { scene: "dinner_table" },
      to: reachable ? { scene: "dinner_table" } : null,
      after,
    });
    const m = moment({ action: { kind: "free_fix", ref: "f", claim: { text: "x", refs: ["f"] } } });
    const plan = (reachable: boolean) => ({ results: { f: fix(reachable) } }) as unknown as DayPlan;
    expect(tipFor(plan(true), m)?.after).toBe(after);
    expect(tipFor(plan(false), m)).toBeNull();
    expect(tipFor(plan(true), moment())).toBeNull();
  });
});

describe("what needs no cover", () => {
  it("lists the coverable concerns a typical viewer would not notice, in words", () => {
    const o = observe([concern("pore", 0), concern("redness", 0, true, 1), concern("acne", 0.5), concern("wrinkle", 0)]);
    expect(noNeedLine(o)).toBe("pores and redness");
    expect(noNeedLine(observe([concern("acne", 0.5)]))).toBeNull();
    expect(noNeedLine(null)).toBeNull();
  });

  it("says all day, or which moments", () => {
    const calm = observe([concern("pore", 0), concern("acne", 0)]);
    const busy = observe([concern("pore", 0), concern("acne", 0.5)]);
    const plan = {
      moments: [moment({ id: "a", title: "Standup", observeRef: "calm" }), moment({ id: "b", title: "Dinner", observeRef: "busy" })],
      results: { calm, busy },
    } as unknown as DayPlan;
    expect(coverLines(plan)).toEqual([
      { concern: "pore", name: "Pores", allDay: true, when: "all day" },
      { concern: "acne", name: "Breakouts", allDay: false, when: "at Standup" },
    ]);
  });

  it("joins a list the way a sentence does", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });
});
