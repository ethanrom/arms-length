import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as analysis } from "@/app/api/youcam/analysis/route";
import { POST as cleanup } from "@/app/api/youcam/cleanup/route";
import { POST as makeup } from "@/app/api/youcam/makeup/route";
import { POST as simulate } from "@/app/api/youcam/simulate/route";
import { GET as status } from "@/app/api/youcam/status/route";
import type { ApiError, AnalysisResponse, RenderResponse, StatusResponse } from "@/lib/contracts";
import { resetRouteLimits } from "./http";

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/youcam/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  resetRouteLimits();
  vi.stubEnv("YOUCAM_MODE", "replay");
  vi.stubEnv("YOUCAM_API_KEY", "");
  vi.stubEnv("LIVE_ACCESS_CODES", "judge-alpha");
  vi.stubEnv("KILL_SWITCH", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("app/api/youcam routes (replay, no network)", () => {
  test("status in replay mode says replay_only, whatever the code", async () => {
    for (const headers of [{}, { "x-access-code": "nope" }, { "x-access-code": "judge-alpha" }] as Record<string, string>[]) {
      const res = await status(new Request("http://localhost/api/youcam/status", { headers }));
      expect(await res.json()).toEqual({ live: false, reason: "replay_only" } satisfies StatusResponse);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  test("in replay mode an uploaded photo is answered with the p2b recording, labelled replay", async () => {
    const res = await analysis(post("analysis", { image: "data:image/png;base64,AAAA" }));
    expect(res.status).toBe(200);
    const a = (await res.json()) as AnalysisResponse;
    expect(a).toMatchObject({ fileRef: "persona:p2b", source: "replay", unitsCharged: 0 });
  });

  test("status explains why live is unavailable and never echoes the code", async () => {
    // A key is needed for live mode; no request below reaches the balance check, so nothing touches the network.
    vi.stubEnv("YOUCAM_MODE", "live");
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    const none = await status(new Request("http://localhost/api/youcam/status"));
    expect(await none.json()).toEqual({ live: false, reason: "no_code" } satisfies StatusResponse);
    expect(none.headers.get("cache-control")).toBe("no-store");

    const wrong = await status(new Request("http://localhost/api/youcam/status", { headers: { "x-access-code": "nope" } }));
    expect(await wrong.json()).toEqual({ live: false, reason: "bad_code" });

    vi.stubEnv("KILL_SWITCH", "1");
    const valid = await status(new Request("http://localhost/api/youcam/status", { headers: { "x-access-code": "judge-alpha" } }));
    expect(await valid.json()).toEqual({ live: false, reason: "kill_switch" });
  });

  test("persona analysis, makeup and simulation follow lib/contracts/api.ts", async () => {
    const a = (await (await analysis(post("analysis", { persona: "p2b" }))).json()) as AnalysisResponse;
    expect(a).toMatchObject({ fileRef: "persona:p2b", source: "replay", unitsCharged: 0 });
    expect(a.analysis.results.length).toBeGreaterThan(0);

    const m = await makeup(post("makeup", { fileRef: a.fileRef, effects: [{ category: "foundation", palettes: [{ coverageIntensity: 80 }] }] }));
    expect(m.status).toBe(200);
    expect(((await m.json()) as RenderResponse).offset).toEqual({ dx: 0, dy: 1 });

    const s = await simulate(post("simulate", { fileRef: "persona:p3a", strengths: { spots: 0.5, redness: 0.5 } }));
    expect(((await s.json()) as RenderResponse).source).toBe("replay");
  });

  test("cleanup needs a configured code (header or body), ignores tokens it did not sign, and validates its body", async () => {
    const noCode = await cleanup(post("cleanup", { taskIds: ["abc.def"] }));
    expect(await noCode.json()).toEqual({ deleted: 0, failed: 0 });
    const forgedViaBody = await cleanup(post("cleanup", { taskIds: ["abc.def"], accessCode: "judge-alpha" }));
    expect(await forgedViaBody.json()).toEqual({ deleted: 0, failed: 1 });
    const forgedViaHeader = await cleanup(post("cleanup", { taskIds: ["abc.def"] }, { "x-access-code": "judge-alpha" }));
    expect(await forgedViaHeader.json()).toEqual({ deleted: 0, failed: 1 });
    expect((await cleanup(post("cleanup", { taskIds: "no" }))).status).toBe(400);
    expect((await cleanup(post("cleanup", { taskIds: Array.from({ length: 40 }, (_, i) => `t${i}.x`) }))).status).toBe(400);
  });

  test("bad input gets a plain-language ApiError: invalid body, both image and persona, oversize, no code for a live image", async () => {
    const error = async (res: Response) => ((await res.json()) as ApiError).error;

    const notJson = await analysis(post("analysis", "{nope"));
    expect(notJson.status).toBe(400);
    expect((await error(notJson)).code).toBe("bad_request");

    expect((await analysis(post("analysis", { image: "data:image/png;base64,AAAA", persona: "p2b" }))).status).toBe(400);
    expect((await analysis(post("analysis", {}))).status).toBe(400);
    expect((await simulate(post("simulate", { fileRef: "persona:p3a", strengths: { spots: 0 } }))).status).toBe(400);
    expect((await makeup(post("makeup", { fileRef: "persona:p2b", effects: [] }))).status).toBe(400);

    const big = await analysis(post("analysis", JSON.stringify({ image: "x".repeat(15_000_000) })));
    expect(big.status).toBe(413);

    vi.stubEnv("YOUCAM_MODE", "live");
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    const live = await analysis(post("analysis", { image: "data:image/png;base64,AAAA" }));
    expect(live.status).toBe(415); // unreadable image is refused before the access-code gate
    const unknown = await analysis(post("analysis", { persona: "nobody" }));
    expect(unknown.status).toBe(404);
    expect((await error(unknown)).message).not.toMatch(/undefined|Error/);
  });
});
