// Deployment safety: what an environment with no keys, or keys but no access codes, can and cannot do; abuse limits.
// Routes are called directly and the network is made to fail loudly, so a test that reached YouCam would be a failure.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as analysis } from "@/app/api/youcam/analysis/route";
import { POST as cleanup } from "@/app/api/youcam/cleanup/route";
import { POST as makeup } from "@/app/api/youcam/makeup/route";
import { POST as simulate } from "@/app/api/youcam/simulate/route";
import { GET as status } from "@/app/api/youcam/status/route";
import type { AnalysisResponse, ApiError, StatusResponse } from "@/lib/contracts";
import { createBudgetGuard } from "./budget";
import { BAD_CODE_LIMIT, ROUTE_LIMITS, readBoundedText, resetRouteLimits } from "./http";
import { LIVE_RESERVED_MESSAGE, youcamMode } from "./mode";
import { createLimiter } from "./ratelimit";
import { MAX_BODY_BYTES } from "./schemas";
import { pngDataUrl } from "./test-helpers";

const ENV_KEYS = [
  "YOUCAM_API_KEY",
  "YOUCAM_SECRET_KEY",
  "YOUCAM_MODE",
  "REPLAY_UPLOADS",
  "LIVE_ACCESS_CODES",
  "UNIT_FLOOR",
  "KILL_SWITCH",
  "LIVE_DAILY_CAP",
  "LIVE_RENDER_DAILY_CAP",
  "YOUCAM_ENGINE",
  "YOUCAM_DELETE_TASKS",
];

const url = (path: string) => `http://localhost/api/youcam/${path}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (headers: Record<string, string> = {}) => new Request(url("status"), { headers });
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;

const network = vi.fn(async (): Promise<Response> => {
  throw new Error("the network must not be touched");
});

beforeEach(() => {
  resetRouteLimits();
  // An environment with no .env at all.
  for (const key of ENV_KEYS) vi.stubEnv(key, undefined as unknown as string);
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("mode defaults", () => {
  test("replay unless there is a key; YOUCAM_MODE=replay wins; a missing key beats YOUCAM_MODE=live", () => {
    expect(youcamMode({})).toBe("replay");
    expect(youcamMode({ YOUCAM_API_KEY: "" })).toBe("replay");
    expect(youcamMode({ YOUCAM_API_KEY: "  " })).toBe("replay");
    expect(youcamMode({ YOUCAM_MODE: "live" })).toBe("replay");
    expect(youcamMode({ YOUCAM_API_KEY: "k" })).toBe("live");
    expect(youcamMode({ YOUCAM_API_KEY: "k", YOUCAM_MODE: "live" })).toBe("live");
    expect(youcamMode({ YOUCAM_API_KEY: "k", YOUCAM_MODE: "Replay" })).toBe("replay");
  });
});

describe("no .env at all: a public demo", () => {
  test("status says replay_only, whatever code is sent, and is never cached", async () => {
    for (const headers of [{}, { "x-access-code": "guess" }] as Record<string, string>[]) {
      const res = await status(get(headers));
      expect(await res.json()).toEqual({ live: false, reason: "replay_only", uploadsAllowed: false } satisfies StatusResponse);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  test("a render that needs the live API is refused in plain language, with no stack and no network", async () => {
    const live = "live:1080x1341:" + "F".repeat(64);
    const m = await makeup(post("makeup", { fileRef: live, effects: [{ category: "foundation" }] }, { "x-access-code": "guess" }));
    const s = await simulate(post("simulate", { fileRef: live, strengths: { redness: 0.5 } }));
    for (const res of [m, s]) {
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toEqual({ code: "live_reserved", message: LIVE_RESERVED_MESSAGE });
    }
    expect(LIVE_RESERVED_MESSAGE).toBe("Live analysis is reserved for judges with an access code. Try a demo face.");
    expect(network).not.toHaveBeenCalled();
  });

  test("recorded faces still work, but an uploaded photo is refused: it is never answered with someone else's face", async () => {
    const demo = await analysis(post("analysis", { persona: "p2b" }));
    expect(await demo.json()).toMatchObject({ source: "replay", unitsCharged: 0 });
    for (const image of [pngDataUrl(1080, 1341), "data:image/png;base64,AAAA"]) {
      const upload = await analysis(post("analysis", { image }));
      expect(upload.status).toBe(403);
      expect(await errorOf(upload)).toEqual({ code: "live_reserved", message: LIVE_RESERVED_MESSAGE });
    }
    expect(network).not.toHaveBeenCalled();
  });

  test("REPLAY_UPLOADS=1 (dev and e2e) answers an upload with the labelled p2b recording; it needs replay mode", async () => {
    vi.stubEnv("REPLAY_UPLOADS", "1");
    const upload = (await (await analysis(post("analysis", { image: pngDataUrl(1080, 1341) }))).json()) as AnalysisResponse;
    expect(upload).toMatchObject({ source: "replay", unitsCharged: 0, fileRef: "persona:p2b" });

    // With a key and live mode the flag does nothing: the upload takes the live path and its access-code gate.
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    const live = await analysis(post("analysis", { image: pngDataUrl(1080, 1341) }));
    expect(live.status).toBe(401);
    expect(network).not.toHaveBeenCalled();
  });

  test("malformed, hostile and unknown input never leaks a stack trace or a file path", async () => {
    const hostile = [
      await analysis(post("analysis", "{nope")),
      await analysis(post("analysis", { persona: "../../etc/passwd" })),
      await analysis(post("analysis", { persona: "nobody" })),
      await analysis(post("analysis", { image: "data:text/html;base64,AAAA" })),
      await makeup(post("makeup", { fileRef: "persona:..%2f..", effects: [{ category: "foundation" }] })),
      await simulate(post("simulate", { fileRef: "persona:p2b", strengths: { redness: 0.5 } })),
      await cleanup(post("cleanup", { taskIds: ["a.b"], accessCode: "guess" })),
    ];
    for (const res of hostile) {
      const text = await res.text();
      expect(text).not.toMatch(/\bat \S+ \(|node_modules|\.ts:\d|[A-Z]:[\\/]|ENOENT|"stack"/);
      expect(res.status === 200 || res.status < 500).toBe(true);
    }
  });

  test("cleanup does nothing without a configured code", async () => {
    const res = await cleanup(post("cleanup", { taskIds: ["a.b"] }, { "x-access-code": "guess" }));
    expect(await res.json()).toEqual({ deleted: 0, failed: 0 });
    expect(network).not.toHaveBeenCalled();
  });
});

describe("keys but no LIVE_ACCESS_CODES: live stays off", () => {
  beforeEach(() => {
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    vi.stubEnv("YOUCAM_SECRET_KEY", "test-secret-not-real");
  });

  test("status names the missing code, and any code is refused before the balance is read", async () => {
    expect(await (await status(get())).json()).toEqual({ live: false, reason: "no_code", uploadsAllowed: false });
    expect(await (await status(get({ "x-access-code": "anything" }))).json()).toEqual({ live: false, reason: "bad_code", uploadsAllowed: false });
    expect(network).not.toHaveBeenCalled();
  });

  test("a real-looking photo gets the reserved line (no code) or a refusal (any code), and nothing is uploaded", async () => {
    const photo = pngDataUrl(1080, 1341);
    const none = await analysis(post("analysis", { image: photo }));
    expect(none.status).toBe(401);
    expect((await errorOf(none)).message).toBe(LIVE_RESERVED_MESSAGE);
    const some = await analysis(post("analysis", { image: photo }, { "x-access-code": "anything" }));
    expect(some.status).toBe(403);
    expect(network).not.toHaveBeenCalled();
  });

  test("with a code configured but KILL_SWITCH on (even spelled 'true'), a valid code is still refused", async () => {
    vi.stubEnv("LIVE_ACCESS_CODES", "judge-alpha");
    vi.stubEnv("KILL_SWITCH", "true");
    const res = await analysis(post("analysis", { image: pngDataUrl(1080, 1341) }, { "x-access-code": "judge-alpha" }));
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe("kill_switch");
    expect(network).not.toHaveBeenCalled();
  });
});

describe("status.uploadsAllowed", () => {
  const uploads = async (headers: Record<string, string> = {}) => ((await (await status(get(headers))).json()) as StatusResponse).uploadsAllowed;

  test("false when keyless, whatever code is sent", async () => {
    expect(await uploads()).toBe(false);
    expect(await uploads({ "x-access-code": "guess" })).toBe(false);
  });

  test("true in replay mode only with REPLAY_UPLOADS=1", async () => {
    vi.stubEnv("REPLAY_UPLOADS", "1");
    expect(await uploads()).toBe(true);
    vi.stubEnv("REPLAY_UPLOADS", "0");
    expect(await uploads()).toBe(false);
  });

  test("false when live is off for the caller, even with REPLAY_UPLOADS=1 (keys, no code)", async () => {
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    vi.stubEnv("REPLAY_UPLOADS", "1");
    expect(await uploads()).toBe(false);
    expect(await uploads({ "x-access-code": "anything" })).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });
});

describe("access codes", () => {
  const guard = (codes: string[]) =>
    createBudgetGuard({
      config: () => ({ codes, killSwitch: false, unitFloor: 100, analysisDailyCap: 3, renderDailyCap: 20 }),
      getBalance: async () => 1000,
    });

  test("the compare takes any length without throwing and accepts only an exact match", () => {
    const g = guard(["judge-alpha", "x"]);
    expect(g.accepts("judge-alpha")).toBe(true);
    expect(g.accepts("x")).toBe(true);
    for (const wrong of ["judge-alph", "judge-alphaa", "Judge-alpha", "", "x ".repeat(100), null]) expect(g.accepts(wrong)).toBe(false);
    expect(guard([]).accepts("judge-alpha")).toBe(false);
  });
});

describe("per-address limits", () => {
  test("status: the limit is per route and per address, answered with 429 and Retry-After", async () => {
    const max = ROUTE_LIMITS.status.max;
    for (let i = 0; i < max; i++) expect((await status(get({ "x-forwarded-for": "203.0.113.7" }))).status).toBe(200);
    const over = await status(get({ "x-forwarded-for": "203.0.113.7" }));
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await errorOf(over)).code).toBe("rate_limited");
    expect((await status(get({ "x-forwarded-for": "198.51.100.1" }))).status).toBe(200); // another address
    // another route has its own count
    expect((await cleanup(post("cleanup", { taskIds: [] }, { "x-forwarded-for": "203.0.113.7" }))).status).toBe(200);
  });

  test("cleanup and analysis are limited too, before their bodies are read", async () => {
    const ip = { "x-forwarded-for": "203.0.113.8" };
    for (let i = 0; i < ROUTE_LIMITS.cleanup.max; i++) await cleanup(post("cleanup", "{}", ip));
    expect((await cleanup(post("cleanup", "{}", ip))).status).toBe(429);
    for (let i = 0; i < ROUTE_LIMITS.analysis.max; i++) await analysis(post("analysis", "{}", ip));
    expect((await analysis(post("analysis", "{}", ip))).status).toBe(429);
    for (let i = 0; i < ROUTE_LIMITS.render.max; i++) await makeup(post("makeup", "{}", ip));
    expect((await makeup(post("makeup", "{}", ip))).status).toBe(429);
    expect((await simulate(post("simulate", "{}", ip))).status).toBe(429); // renders share one count
  });

  test("guessing access codes locks out requests that carry a code; demo faces (no code) keep working", async () => {
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    vi.stubEnv("LIVE_ACCESS_CODES", "judge-alpha");
    const ip = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < BAD_CODE_LIMIT.max; i++) {
      expect(await (await status(get({ ...ip, "x-access-code": `guess-${i}` }))).json()).toEqual({ live: false, reason: "bad_code", uploadsAllowed: false });
    }
    const locked = await status(get({ ...ip, "x-access-code": "judge-alpha" }));
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await status(get(ip))).status).toBe(200); // no code: still served
    expect((await analysis(post("analysis", { persona: "p2b" }, ip))).status).toBe(200);
    // another address is not locked out
    const other = await status(get({ "x-forwarded-for": "198.51.100.2", "x-access-code": "guess" }));
    expect(await other.json()).toEqual({ live: false, reason: "bad_code", uploadsAllowed: false });
    expect(network).not.toHaveBeenCalled();
  });

  test("the limiter counts a window, then lets the address back in", () => {
    const limiter = createLimiter({ max: 2, windowMs: 1000 });
    expect([limiter.hit("a", 0), limiter.hit("a", 10), limiter.hit("a", 20)]).toEqual([0, 0, 1]);
    expect(limiter.wait("a", 500)).toBe(1);
    expect(limiter.hit("b", 30)).toBe(0);
    expect(limiter.hit("a", 1001)).toBe(0);
  });
});

describe("body-size caps", () => {
  test("the photo route stays under Vercel's 4.5 MB request limit", () => {
    expect(MAX_BODY_BYTES.analysis).toBeLessThanOrEqual(4_000_000);
    expect(MAX_BODY_BYTES.render).toBeLessThan(MAX_BODY_BYTES.analysis);
  });

  test("an oversized body is refused with 413: by its declared length, and by its real length when none is declared", async () => {
    const declared = await analysis(post("analysis", "{}", { "content-length": String(MAX_BODY_BYTES.analysis + 1) }));
    expect(declared.status).toBe(413);
    const streamed = await analysis(post("analysis", JSON.stringify({ image: "x".repeat(MAX_BODY_BYTES.analysis + 10) })));
    expect(streamed.status).toBe(413);
    expect((await errorOf(streamed)).message).toMatch(/too large/);
    expect((await makeup(post("makeup", "x".repeat(MAX_BODY_BYTES.render + 1)))).status).toBe(413);
    expect((await cleanup(post("cleanup", "x".repeat(MAX_BODY_BYTES.cleanup + 1)))).status).toBe(413);
  });

  test("the bounded reader counts bytes, not characters, and stops reading at the cap", async () => {
    const tooBig = () => new Error("big");
    const request = (body: string) => new Request("http://localhost/x", { method: "POST", body });
    await expect(readBoundedText(request("é".repeat(60)), 100, tooBig)).rejects.toThrow("big"); // 120 bytes, 60 characters
    await expect(readBoundedText(request("é".repeat(50)), 100, tooBig)).resolves.toHaveLength(50);
  });
});
