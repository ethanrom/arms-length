import { describe, expect, it } from "vitest";
import { SCENES } from "@/lib/contracts";
import { CONCERN_COPY } from "@/lib/copy/concerns";
import { lintText } from "@/lib/copy/lint";
import { LUMINANCE_PRESETS } from "@/lib/vision/params";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { realEngine } from "./realEngine";
import { LIGHT_IDS, SCENE_IDS, VISIBLE_CONCERN_IDS } from "./schemas";
import { demoFace } from "./test-helpers";
import { TOOL_NAMES, createToolbox, describeStep, resolveToolName, stepEvent, toolSpecs } from "./tools";

const prefs = { callDevice: "laptop" as const, noMakeup: false };
const toolbox = (noMakeup = false) => createToolbox({ face: demoFace("p3a"), engine: realEngine, prefs: { ...prefs, noMakeup } });
const parse = (text: string) => JSON.parse(text) as Record<string, unknown>;

function everyObjectIsClosed(node: unknown, path = "$"): string[] {
  if (Array.isArray(node)) return node.flatMap((n, i) => everyObjectIsClosed(n, `${path}[${i}]`));
  if (!node || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const open = obj.type === "object" && obj.properties && obj.additionalProperties !== false ? [path] : [];
  return [...open, ...Object.entries(obj).flatMap(([k, v]) => everyObjectIsClosed(v, `${path}.${k}`))];
}

describe("tool specs", () => {
  const specs = toolSpecs();

  it("lists every tool once, with a description and a closed JSON Schema", () => {
    expect(specs.map((s) => s.name)).toEqual([...TOOL_NAMES]);
    for (const spec of specs) {
      expect(spec.description.length).toBeGreaterThan(20);
      expect(spec.inputSchema.type).toBe("object");
      expect(spec.inputSchema).not.toHaveProperty("$schema");
      expect(everyObjectIsClosed(spec.inputSchema), spec.name).toEqual([]);
    }
  });

  it("takes its enums from the tables, so they cannot drift", () => {
    expect(SCENE_IDS).toEqual(SCENES.map((s) => s.id));
    expect([...LIGHT_IDS].sort()).toEqual(Object.keys(LUMINANCE_PRESETS).sort());
    const observe = specs.find((s) => s.name === "observe_scene")!.inputSchema as { properties: Record<string, { enum?: string[] }>; required: string[] };
    expect(observe.properties.scene.enum).toEqual(SCENE_IDS);
    expect(observe.properties.light.enum).toEqual(LIGHT_IDS);
    expect(observe.properties.viewer.enum).toEqual(["typical", "blurry"]);
    expect(observe.required).toEqual(["label", "scene"]);
    const touch = specs.find((s) => s.name === "lightest_touch")!.inputSchema as { properties: { concern: { enum: string[] } } };
    expect(touch.properties.concern.enum).toEqual(VISIBLE_CONCERN_IDS);
    expect(touch.properties.concern.enum).not.toContain("texture");
  });

  it("requires a short headline on every moment of final_answer", () => {
    const final = specs.find((s) => s.name === "final_answer")!.inputSchema as { properties: { moments: { items: { required: string[]; properties: { headline: { properties: { text: { maxLength: number } }; required: string[] } } } } } };
    const item = final.properties.moments.items;
    expect(item.required).toContain("headline");
    expect(item.properties.headline.required).toEqual(["text", "refs"]);
    expect(JSON.stringify(item.properties.headline)).toContain("at most 120 characters");
  });

  it("states the rules in the system prompt, from the same lists the linter uses", () => {
    const prompt = buildSystemPrompt();
    for (const id of SCENE_IDS) expect(prompt).toContain(id);
    for (const word of ["flaw", "diagnose", "nobody", "promise", "refine"]) expect(prompt).toContain(word);
    expect(prompt).toContain("final_answer");
    expect(prompt).toContain("character for character");
    expect(prompt).toContain("at most");
    expect(prompt).toContain("headline");
    expect(prompt).toContain("assess_moment");
    expect(prompt).toContain("SECOND turn");
    expect(prompt).toContain("120 characters");
    expect(buildSystemPrompt()).toBe(prompt);
  });

  it("puts the user's day and settings in the first message", () => {
    const text = buildUserMessage({ day: "Dinner at 7", prefs: { callDevice: "phone", noMakeup: true } });
    expect(text).toContain("My day: Dinner at 7");
    expect(text).toContain("my phone");
    expect(text).toContain("do not use lightest_touch");
  });
});

describe("resolveToolName", () => {
  it("accepts exact names and unambiguous near misses", () => {
    expect(resolveToolName("observe_scene")).toBe("observe_scene");
    expect(resolveToolName("observeScene")).toBe("observe_scene");
    expect(resolveToolName("Observe-Scene")).toBe("observe_scene");
    expect(resolveToolName("functions.find_free_fix")).toBe("find_free_fix");
    expect(resolveToolName("final_answer_tool")).toBe("final_answer");
  });

  it("refuses names that match no tool or more than one", () => {
    expect(resolveToolName("make_coffee")).toBeNull();
    expect(resolveToolName("")).toBeNull();
    expect(resolveToolName("observe")).toBeNull();
  });
});

describe("toolbox", () => {
  it("numbers results r1, r2, ... per run and keeps a free fix's re-observed scene under .after", () => {
    const box = toolbox();
    const a = box.run("observe_scene", { label: "Dinner", scene: "dinner_table" });
    const b = box.run("find_free_fix", { label: "Dinner", moment: { scene: "dinner_table" }, concerns: ["pore"] });
    const c = box.run("observe_scene", { label: "Meeting", scene: "meeting_room" });
    expect([a.ref, b.ref, c.ref]).toEqual(["r1", "r2", "r3"]);
    expect([...box.results.keys()]).toEqual(["r1", "r2", "r2.after", "r3"]);
    expect(createToolbox({ face: demoFace("p3a"), engine: realEngine, prefs }).run("observe_scene", { label: "x", scene: "presenting" }).ref).toBe("r1");
  });

  it("shows the model quotes and which concerns are in sight, not raw measurements", () => {
    const outcome = toolbox().run("observe_scene", { label: "Dinner", scene: "dinner_table" });
    const view = parse(outcome.text);
    expect(view.ref).toBe("r1");
    expect(view.quotes).toMatchObject({ distance: "1.5 m" });
    expect(Object.keys(view)).toEqual(expect.arrayContaining(["visibleToTypicalViewer", "needsAChange", "outOfSightForTypicalViewer", "quotes"]));
    expect(outcome.text).not.toMatch(/typicalShare|boundShare|luminanceCdM2/);
  });

  it("does not spend a ref on a failed call", () => {
    const box = toolbox();
    expect(box.run("observe_scene", { label: "x", scene: "nowhere" }).ok).toBe(false);
    expect(box.run("observe_scene", { label: "x", scene: "dinner_table", distanceM: 9 }).ok).toBe(false);
    expect(box.run("observe_scene", { label: "x", scene: "dinner_table" }).ref).toBe("r1");
  });

  it("names the valid scenes and range when a scene cannot be resolved", () => {
    const outcome = toolbox().run("observe_scene", { label: "x", scene: "dinner_table", distanceM: 9 });
    const { error } = parse(outcome.text) as { error: string };
    expect(outcome.ok).toBe(false);
    expect(error).toContain("Valid scenes:");
    for (const id of SCENE_IDS) expect(error).toContain(id);
    expect(error).toContain("between 1.2 and 2.1 m");
  });

  it("explains invalid input and a video call with no geometry", () => {
    const box = toolbox();
    expect(parse(box.run("worth_it", { concern: "pore" }).text).error).toContain("distanceM");
    expect(parse(box.run("observe_scene", { label: "x", scene: "video_call" }).text).error).toContain("call");
    expect(parse(box.run("observe_scene", { label: "x", scene: "video_call", call: { device: "laptop", cameraDistanceCm: 5, layout: "gallery" } }).text).error).toBeTruthy();
  });

  it("treats null arguments as absent", () => {
    const outcome = toolbox().run("observe_scene", { label: "x", scene: "dinner_table", light: null, viewer: null, distanceM: null, call: null });
    expect(outcome.ok).toBe(true);
  });

  it("runs a video call: frame, observation and free fix share the geometry", () => {
    const box = toolbox();
    const call = { device: "laptop", cameraDistanceCm: 50, layout: "gallery" };
    expect(box.run("video_call_frame", { label: "Standup", ...call }).ok).toBe(true);
    const observed = box.run("observe_scene", { label: "Standup", scene: "video_call", call });
    expect(observed.ok).toBe(true);
    expect(parse(observed.text).quotes).toHaveProperty("floor");
    expect(box.run("find_free_fix", { label: "Standup", moment: { scene: "video_call", call }, concerns: ["pore"] }).ok).toBe(true);
  });

  it("refuses lightest_touch when the user would rather not wear makeup, and never spends a ref on it", () => {
    const box = toolbox(true);
    const outcome = box.run("lightest_touch", { concern: "acne" });
    expect(outcome.ok).toBe(false);
    expect(box.results.size).toBe(0);
    expect(toolbox().run("lightest_touch", { concern: "acne" }).ok).toBe(true);
  });

  it("answers worth_it and receipt, and says when there is nothing to show", () => {
    const box = toolbox();
    expect(box.run("worth_it", { concern: "age_spot", distanceM: 1.5 }).ok).toBe(true);
    expect(box.run("receipt", { label: "Dinner", scene: "dinner_table", concern: "pore" }).ok).toBe(true);
    expect(box.run("list_scenes", {}).ok).toBe(true);
    expect(parse(box.run("list_scenes", {}).text).scenes).toHaveLength(SCENES.length);
  });
});

describe("describeStep", () => {
  it("is a template: the only model text is a clean title", () => {
    expect(describeStep("observe_scene", { label: "Dinner date" })).toBe('Running the vision model for "Dinner date"');
    expect(describeStep("observe_scene", { label: 'Say "hi"\nnow' })).toBe('Running the vision model for "Say hi now"');
    expect(describeStep("observe_scene", { label: "a flaw" })).toBe("Running the vision model for this moment");
    expect(describeStep("observe_scene", { label: "x".repeat(200) })).toBe(`Running the vision model for "${"x".repeat(60)}"`);
    expect(describeStep("observe_scene", null)).toBe("Running the vision model for this moment");
  });

  it("passes the copy lint for every tool and concern", () => {
    for (const tool of TOOL_NAMES) {
      expect(lintText(describeStep(tool, { label: "Dinner date", concern: "pore" }))).toEqual([]);
      for (const concern of VISIBLE_CONCERN_IDS) {
        const label = describeStep(tool, { label: "Dinner date", concern });
        expect(lintText(label), label).toEqual([]);
        if (tool === "lightest_touch") expect(label).toContain(CONCERN_COPY[concern].plural);
      }
    }
  });
});

describe("stepEvent", () => {
  it("names the moment on observe_scene and video_call_frame only", () => {
    expect(stepEvent("observe_scene", { label: "Dinner date", scene: "dinner_table" })).toEqual({
      type: "step",
      tool: "observe_scene",
      label: 'Running the vision model for "Dinner date"',
      moment: { title: "Dinner date", scene: "dinner_table" },
    });
    expect(stepEvent("video_call_frame", { label: "Standup", device: "laptop" }).moment).toEqual({ title: "Standup", scene: "video_call" });
    for (const tool of ["find_free_fix", "lightest_touch", "worth_it", "receipt", "list_scenes", "final_answer"] as const) {
      expect(stepEvent(tool, { label: "Dinner date", scene: "dinner_table" })).not.toHaveProperty("moment");
    }
  });

  it("leaves the moment out rather than show a title that fails the clean-up or a scene that is not one", () => {
    expect(stepEvent("observe_scene", { label: "a flaw", scene: "dinner_table" })).not.toHaveProperty("moment");
    expect(stepEvent("observe_scene", { label: "Dinner", scene: "the moon" })).not.toHaveProperty("moment");
    expect(stepEvent("observe_scene", null)).not.toHaveProperty("moment");
  });
});

describe("assess_moment", () => {
  const steps = (box: ReturnType<typeof toolbox>, input: unknown) => {
    const events: { tool: string; moment?: unknown }[] = [];
    const outcome = box.run("assess_moment", input, (e) => events.push({ tool: e.tool, ...(e.moment ? { moment: e.moment } : {}) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { outcome, events, view: outcome.ok ? (parse(outcome.text) as Record<string, any>) : null };
  };

  it("does the observation, the free-fix search and the lightest touch in one call, filing every result under its own ref", () => {
    const box = toolbox();
    const { outcome, view, events } = steps(box, { title: "Lunch", scene: "cafe_table", light: "daylight" });
    expect(outcome.ok).toBe(true);
    expect(view!.observeRef).toBe("r1");
    expect(outcome.ref).toBe("r1");
    expect(view!.moment).toBe("Lunch");
    expect(view!.scene).toMatchObject({ scene: "cafe_table", light: "daylight", viewer: "typical", distanceM: 0.8 });
    // The same results the single tools give: the observation is the engine's, byte for byte.
    expect(box.results.get("r1")).toEqual(realEngine.observeScene(demoFace("p3a"), { scene: "cafe_table", light: "daylight" }, "r1"));
    const refs = [...box.results.keys()];
    expect(refs[0]).toBe("r1");
    expect(refs.length).toBeGreaterThan(1);
    // Steps: the observation names the moment; the searches follow.
    expect(events[0]).toEqual({ tool: "observe_scene", moment: { title: "Lunch", scene: "cafe_table" } });
    expect(events.map((e) => e.tool)).toEqual(expect.arrayContaining(["observe_scene", "find_free_fix"]));
    expect(events.some((e) => e.tool === "assess_moment")).toBe(false);
  });

  it("returns the quotes grouped per concern, compactly", () => {
    const { view, outcome } = steps(toolbox(), { title: "Dinner", scene: "dinner_table" });
    expect(view!.quotes).toMatchObject({ distance: "1.5 m" });
    expect(view!.concerns.pore).toEqual(expect.objectContaining({ typical: expect.any(String), typicalCount: expect.any(String), bound: expect.stringContaining("at most"), boundCount: expect.stringContaining("at most") }));
    expect(Object.keys(view!)).toEqual(expect.arrayContaining(["inSight", "outOfSight", "needsAChange", "freeFix", "limit", "lightestTouch", "makeup", "action"]));
    expect(outcome.text.length).toBeLessThan(6500);
    expect(outcome.text).not.toMatch(/typicalShare|boundShare|luminanceCdM2/);
  });

  it("runs the call frame first for a video call, and names the moment on both steps", () => {
    const box = toolbox();
    const call = { device: "laptop", cameraDistanceCm: 50, layout: "gallery" };
    const { view, events } = steps(box, { title: "Standup", scene: "video_call", call });
    expect(events.slice(0, 2)).toEqual([
      { tool: "video_call_frame", moment: { title: "Standup", scene: "video_call" } },
      { tool: "observe_scene", moment: { title: "Standup", scene: "video_call" } },
    ]);
    expect(view!.callFrame.ref).toBe("r1");
    expect(view!.observeRef).toBe("r2");
    expect(view!.callFrame.quotes).toHaveProperty("equivalentDistance");
    expect(view!.quotes).toHaveProperty("floor");
    expect(view!.scene.call).toEqual(call);
  });

  it("finds a free change where one exists, and the lightest touch only for what none reaches", () => {
    const withFix = steps(toolbox(), { title: "Dinner", scene: "dinner_table", light: "home" });
    const noFix = steps(toolbox(), { title: "Close", scene: "close_talk" });
    for (const { view } of [withFix, noFix]) {
      expect(view!.freeFix === null || view!.freeFix.reaches.length > 0).toBe(true);
      if (view!.freeFix) expect(view!.freeFix.quotes.change).toBeTruthy();
      if (view!.lightestTouch.length) expect(view!.stillInSightAfterAFreeChange.length).toBeGreaterThan(0);
    }
    // Every touch cited has a coverage quote and says where it was measured.
    for (const t of [...withFix.view!.lightestTouch, ...noFix.view!.lightestTouch]) expect(t.quotes).toMatchObject({ coverage: expect.any(String), measuredAt: expect.any(String) });
  });

  it("offers no lightest touch when the user would rather not wear makeup", () => {
    const { view, events } = steps(toolbox(true), { title: "Close", scene: "close_talk" });
    expect(view!.lightestTouch).toEqual([]);
    expect(events.some((e) => e.tool === "lightest_touch")).toBe(false);
    expect(view!.makeup).toMatch(/rather not wear makeup|Nothing is left/);
  });

  it("keeps the same refs and results as running the single tools in order", () => {
    const assessBox = toolbox();
    steps(assessBox, { title: "Dinner", scene: "dinner_table", light: "home" });
    const direct = realEngine.observeScene(demoFace("p3a"), { scene: "dinner_table", light: "home" }, "r1");
    expect(assessBox.results.get("r1")).toEqual(direct);
  });

  it("names the valid range for a scene it cannot resolve, and spends no ref", () => {
    const box = toolbox();
    const { outcome } = steps(box, { title: "x", scene: "dinner_table", distanceM: 9 });
    expect(outcome.ok).toBe(false);
    expect(parse(outcome.text).error).toContain("between 1.2 and 2.1 m");
    expect(box.results.size).toBe(0);
    expect(steps(box, { title: "x", scene: "video_call" }).outcome.ok).toBe(false);
  });
});
