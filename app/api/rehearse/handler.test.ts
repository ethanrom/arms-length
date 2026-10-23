import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_DAYS, type DayPlan, type RehearseEvent } from "@/lib/contracts";
import { demoFace, fakeLlm, toolUse, type FakeLlm } from "@/lib/agent/test-helpers";
import { LlmError } from "@/lib/agent/types";
import { defaultDeps, handleRehearse, resetRehearseLimits, type RehearseDeps } from "./handler";

const prefs = { callDevice: "laptop", noMakeup: false };
const DAY = "Dinner date at 7";

function deps(env: Record<string, string>, llm?: FakeLlm, extra: Partial<RehearseDeps> = {}): RehearseDeps {
  return {
    ...defaultDeps(),
    env: { AGENT_ENABLED: "1", ...env },
    llm: () => llm ?? fakeLlm(() => { throw new Error("the model must not be called"); }),
    ...extra,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/rehearse", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
}

async function events(res: Response): Promise<RehearseEvent[]> {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as RehearseEvent);
}

const errorOf = async (res: Response) => {
  const [event] = await events(res);
  return event.type === "error" ? event.code : event.type;
};

const dinner = (llmDay = DAY) =>
  fakeLlm([
    () => ({ content: [toolUse("observe_scene", { label: "Dinner date", scene: "dinner_table" })] }),
    ({ last }) => {
      const v = last[0] as { ref: string; quotes: Record<string, string> };
      return {
        content: [
          toolUse("final_answer", {
            moments: [
              {
                time: "7pm",
                title: "Dinner date",
                scene: { scene: "dinner_table" },
                headline: { text: "Across the table, you can relax.", refs: [v.ref] },
                observeRef: v.ref,
                assumptions: [`I took ${llmDay.length > 0 ? "dinner" : "it"} as a table.`],
                notice: [],
                outOfSight: [{ text: `At ${v.quotes.distance}, a typical viewer sees your skin in ${v.quotes.light}.`, refs: [v.ref] }],
                action: { kind: "none", claim: { text: "Nothing needs doing here.", refs: [] } },
              },
            ],
            summary: { text: "Your evening looks relaxed.", refs: [v.ref] },
          }),
        ],
      };
    },
  ]);

beforeEach(() => resetRehearseLimits());
afterEach(() => vi.restoreAllMocks());

describe("POST /api/rehearse guards", () => {
  it("is off unless AGENT_ENABLED is 1", async () => {
    const res = await handleRehearse(post({ face: { demoId: "p3a" }, day: DAY, prefs }), "1.1.1.1", deps({ AGENT_ENABLED: "" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    expect(await errorOf(res)).toBe("disabled");
    expect(await errorOf(await handleRehearse(post({}), "1.1.1.1", { ...deps({}), env: {} }))).toBe("disabled");
  });

  it("stops at the kill switch before anything else", async () => {
    const res = await handleRehearse(post("not json"), "1.1.1.1", deps({ KILL_SWITCH: "1" }));
    expect(res.status).toBe(503);
    expect(await errorOf(res)).toBe("kill_switch");
  });

  it("limits each address to 10 runs a day, and everyone to 100", async () => {
    const d = deps({});
    for (let i = 0; i < 10; i++) expect((await handleRehearse(post("{"), "2.2.2.2", d)).status).toBe(400);
    const limited = await handleRehearse(post("{"), "2.2.2.2", d);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await errorOf(limited)).toBe("rate_limited");
    // Another address is fine, until the global 100 is spent.
    resetRehearseLimits();
    for (let i = 0; i < 100; i++) expect((await handleRehearse(post("{"), `10.0.0.${i}`, d)).status).toBe(400);
    const globalLimited = await handleRehearse(post("{"), "10.9.9.9", d);
    expect(globalLimited.status).toBe(429);
  });

  it("rejects a body over 1.5 MB, declared or streamed", async () => {
    const big = JSON.stringify({ face: { demoId: "p3a" }, day: "x".repeat(1_600_000), prefs });
    const res = await handleRehearse(post(big), "3.3.3.3", deps({}));
    expect(res.status).toBe(413);
    expect(await errorOf(res)).toBe("too_large");
    const streamed = new Request("http://localhost/api/rehearse", { method: "POST", body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }), duplex: "half" } as RequestInit);
    expect((await handleRehearse(streamed, "3.3.3.4", deps({}))).status).toBe(413);
  });

  it("rejects malformed requests", async () => {
    const bad = async (body: unknown) => {
      const res = await handleRehearse(post(body), "4.4.4.4", deps({}));
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toBe("bad_request");
    };
    await bad("{ nope");
    await bad({});
    await bad({ face: { demoId: "p3a" }, day: "", prefs });
    await bad({ face: { demoId: "p3a" }, day: "x".repeat(1300), prefs });
    await bad({ face: { demoId: "p3a" }, day: DAY, prefs: { callDevice: "fax", noMakeup: false } });
    await bad({ face: { demoId: "p3a", live: {} }, day: DAY, prefs });
    await bad({ face: { live: { measurements: {}, coverage: [], worthIt: [] } }, day: DAY, prefs });
  });

  it("refuses a live face that carries image data", async () => {
    const face = structuredClone(demoFace("p3a"));
    face.coverage[0] = { ...face.coverage[0], steps: [{ lever: { category: "foundation", field: "x", value: 1 }, render: { imageRef: "data:image/png;base64,AAAA", width: 1, height: 1, offset: { dx: 0, dy: 0 }, unitsCharged: 0, source: "live" }, maxDistanceM: 1 }] };
    const res = await handleRehearse(post({ face: { live: face }, day: DAY, prefs }), "4.4.4.5", deps({}));
    expect(res.status).toBe(400);
  });

  it("reports an unknown demo face", async () => {
    const res = await handleRehearse(post({ face: { demoId: "nobody" }, day: DAY, prefs }), "5.5.5.5", deps({}));
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toBe("unknown_face");
    expect(await errorOf(await handleRehearse(post({ face: { demoId: "../../etc" }, day: DAY, prefs }), "5.5.5.6", deps({})))).toBe("unknown_face");
  });
});

describe("POST /api/rehearse stream", () => {
  it("streams one JSON event per line: the steps, then the checked plan", async () => {
    const llm = dinner();
    const res = await handleRehearse(post({ face: { demoId: "p3a" }, day: DAY, prefs }), "6.6.6.6", deps({}, llm));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    const list = await events(res);
    expect(list.map((e) => e.type)).toEqual(["step", "step", "plan"]);
    expect(list[0]).toMatchObject({ tool: "observe_scene", moment: { title: "Dinner date", scene: "dinner_table" } });
    const plan = (list[2] as { type: "plan"; plan: DayPlan }).plan;
    expect(plan.verified).toBe(true);
    expect(plan.day).toBe(DAY);
    expect(plan.moments[0].observeRef).toBe("r1");
    llm.check();
  });

  it("accepts a live face sent as numbers", async () => {
    const res = await handleRehearse(post({ face: { live: demoFace("p2b") }, day: DAY, prefs }), "6.6.6.7", deps({}, dinner()));
    expect(res.status).toBe(200);
    const list = await events(res);
    expect(list[list.length - 1].type).toBe("plan");
  });

  it("delivers the fallback plan, not an error, when the model fails", async () => {
    const llm = fakeLlm(() => {
      throw new LlmError("upstream", "boom");
    });
    const res = await handleRehearse(post({ face: { demoId: "p3a" }, day: EXAMPLE_DAYS[0].day, prefs }), "6.6.6.8", deps({}, llm));
    const list = await events(res);
    const last = list[list.length - 1];
    expect(last.type).toBe("plan");
    expect((last as { plan: DayPlan }).plan.verified).toBe(false);
  });

  it("never logs the request", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const llm = fakeLlm(() => {
      throw new Error("secret-day-text");
    });
    await (await handleRehearse(post({ face: { demoId: "p3a" }, day: "my very private day", prefs }), "6.6.6.9", deps({}, llm))).text();
    expect(JSON.stringify(spy.mock.calls)).not.toContain("private");
  });
});

describe("POST /api/rehearse replay", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rehearse-"));
  fs.mkdirSync(path.join(dir, "p3a"));
  const recorded: DayPlan = { day: EXAMPLE_DAYS[1].day, moments: [], summary: { text: "Recorded.", refs: [] }, results: {}, verified: true, issues: [], stats: { ms: 1, turns: 1, toolCalls: 1, inputTokens: 1, outputTokens: 1, repairs: 0 } };
  fs.writeFileSync(path.join(dir, "p3a", "presenting.json"), JSON.stringify({ steps: [{ tool: "observe_scene", label: 'Running the vision model for "Presenting"', moment: { title: "Presenting", scene: "presenting" } }, { tool: "final_answer", label: "Checking every number in your day plan" }], plan: recorded }));

  it("serves the recorded plan for an example day, re-emitting its steps, with no model call and no rate limit", async () => {
    const d = deps({ AGENT_MODE: "replay", AGENT_REPLAY_DELAY_MS: "0" }, undefined, { fixturesDir: dir });
    for (let i = 0; i < 12; i++) {
      const list = await events(await handleRehearse(post({ face: { demoId: "p3a" }, day: EXAMPLE_DAYS[1].day, prefs }), "7.7.7.7", d));
      expect(list).toEqual([
        { type: "step", tool: "observe_scene", label: 'Running the vision model for "Presenting"', moment: { title: "Presenting", scene: "presenting" } },
        { type: "step", tool: "final_answer", label: "Checking every number in your day plan" },
        { type: "plan", plan: recorded },
      ]);
    }
  });

  it("builds the deterministic fallback for any other day or face, never calling the model", async () => {
    const d = deps({ AGENT_MODE: "replay" }, undefined, { fixturesDir: dir });
    const custom = await events(await handleRehearse(post({ face: { demoId: "p3a" }, day: "Coffee with Sam", prefs }), "7.7.7.8", d));
    const plan = (custom[custom.length - 1] as { plan: DayPlan }).plan;
    expect(plan.verified).toBe(false);
    expect(plan.moments[0].scene.scene).toBe("cafe_table");
    expect(custom[0].type).toBe("step");
    // An example day on a face with no recording, and a follow-up, take the same path.
    const noFixture = await events(await handleRehearse(post({ face: { demoId: "p2b" }, day: EXAMPLE_DAYS[1].day, prefs }), "7.7.7.9", d));
    expect((noFixture[noFixture.length - 1] as { plan: DayPlan }).plan.verified).toBe(false);
  });
});

describe("POST /api/rehearse replay of the recorded fixtures", () => {
  it("serves every recorded example day on every demo face, steps first, then the checked plan", async () => {
    const d = deps({ AGENT_MODE: "replay", AGENT_REPLAY_DELAY_MS: "0" });
    for (const demoId of ["p2b", "p3a", "p1a", "p5a"]) {
      for (const example of EXAMPLE_DAYS) {
        const list = await events(await handleRehearse(post({ face: { demoId }, day: example.day, prefs }), "8.8.8.8", d));
        const plan = (list[list.length - 1] as { type: "plan"; plan: DayPlan }).plan;
        expect(list.slice(0, -1).every((e) => e.type === "step"), `${demoId}/${example.id}`).toBe(true);
        expect(plan.verified).toBe(true);
        expect(plan.day).toBe(example.day);
        // The recorded steps name each moment, so the picture can be sketched as it is found.
        const named = list.flatMap((e) => (e.type === "step" && e.moment ? [e.moment.title] : []));
        expect(named.length, `${demoId}/${example.id}`).toBeGreaterThanOrEqual(plan.moments.length);
        for (const m of plan.moments) expect(m.headline?.text.length).toBeGreaterThan(0);
      }
    }
  });
});
