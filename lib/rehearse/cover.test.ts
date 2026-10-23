import { describe, expect, it } from "vitest";
import type { ConcernAtScene, DayPlan, ObserveResult, PlannedMoment } from "@/lib/contracts/rehearse";
import { noNeedToCover, noNeedToCoverDay } from "./cover";

const c = (concern: ConcernAtScene["concern"], typicalShare: number, soft = false, targetCount = 10): ConcernAtScene => ({
  concern,
  targetCount,
  typicalShare,
  typicalCount: Math.round(typicalShare * targetCount),
  boundShare: typicalShare,
  boundCount: Math.round(typicalShare * targetCount),
  soft,
});

const obs = (ref: string, concerns: ConcernAtScene[]): ObserveResult => ({
  ref,
  quotes: {},
  assumptions: [],
  input: { scene: "dinner_table", light: "home", viewer: "typical" },
  distanceM: 1.5,
  luminanceCdM2: 12,
  acuityScale: 1,
  concerns,
});

const moment = (id: string, observeRef: string): PlannedMoment => ({
  id,
  time: null,
  title: id,
  scene: { scene: "dinner_table" },
  observeRef,
  assumptions: [],
  notice: [],
  outOfSight: [],
  action: { kind: "none", claim: { text: "Nothing needed.", refs: [] } },
});

describe("noNeedToCover", () => {
  it("keeps coverable concerns at or under the 10% goal, soft areas only when fully out of sight", () => {
    const o = obs("r1", [c("pore", 0.1), c("acne", 0.11), c("dark_circle", 0, true), c("redness", 1, true), c("wrinkle", 0), c("age_spot", 0, false, 0)]);
    expect(noNeedToCover(o)).toEqual(["pore", "dark_circle"]);
  });
});

describe("noNeedToCoverDay", () => {
  it("marks all-day concerns and lists them first", () => {
    const plan = {
      moments: [moment("a", "r1"), moment("b", "r2")],
      results: { r1: obs("r1", [c("acne", 0), c("pore", 0.5)]), r2: obs("r2", [c("acne", 0.3), c("pore", 0)]) },
    } as unknown as DayPlan;
    plan.results.r2 = obs("r2", [c("acne", 0.3), c("pore", 0), c("age_spot", 0)]);
    plan.results.r1 = obs("r1", [c("acne", 0), c("pore", 0.5), c("age_spot", 0.05)]);
    expect(noNeedToCoverDay(plan)).toEqual([
      { concern: "age_spot", momentIds: ["a", "b"], allDay: true },
      { concern: "acne", momentIds: ["a"], allDay: false },
      { concern: "pore", momentIds: ["b"], allDay: false },
    ]);
  });
});
