import { describe, expect, test } from "vitest";
import { groupViews, type ConcernView } from "./derive";
import { createDistanceStore } from "./distanceStore";

const view = (id: string, flags: Partial<Pick<ConcernView, "relief" | "soft">> = {}) => ({ id, relief: false, soft: false, ...flags }) as ConcernView;

describe("groupViews", () => {
  test("what is mostly out of sight comes first; in the rest the rows that move with the slider lead and the soft areas follow", () => {
    const groups = groupViews([view("shadows", { soft: true }), view("pores", { relief: true }), view("spots"), view("redness", { soft: true }), view("lines")]);
    expect(groups.map((g) => [g.id, g.views.map((v) => v.id)])).toEqual([
      ["relief", ["pores"]],
      ["visible", ["spots", "lines", "shadows", "redness"]],
    ]);
  });

  test("an empty group is dropped", () => {
    expect(groupViews([view("a"), view("b")]).map((g) => g.id)).toEqual(["visible"]);
    expect(groupViews([])).toEqual([]);
  });
});

describe("createDistanceStore", () => {
  test("tells its listeners once per change, and stops after they unsubscribe", () => {
    const store = createDistanceStore(0.25);
    let heard = 0;
    const off = store.subscribe(() => heard++);
    store.set(1);
    store.set(1);
    expect(store.get()).toBe(1);
    expect(heard).toBe(1);
    off();
    store.set(2);
    expect(heard).toBe(1);
  });
});
