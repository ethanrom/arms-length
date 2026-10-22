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
import { createYouCamClient } from "./client";
import { YouCamError } from "./errors";
import { BAD_CODE_LIMIT, ROUTE_LIMITS, callerOf, readBoundedText, redact, resetRouteLimits, respond } from "./http";
import { LIVE_RESERVED_MESSAGE, youcamMode } from "./mode";
import { createLimiter } from "./ratelimit";
import { MAX_BODY_BYTES } from "./schemas";
import { signTaskId } from "./tasktokens";
import { fakeFetch, json, noSleep, pngDataUrl } from "./test-helpers";

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
  "LIVE_OPEN",
  "LIVE_OPEN_DAILY_CAP",
  "TASK_TOKEN_SECRET",
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
    expect(LIVE_RESERVED_MESSAGE).toBe("Live analysis needs your own YouCam API key or an access code here. Try a demo face.");
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
      config: () => ({ codes, killSwitch: false, unitFloor: 100, analysisDailyCap: 3, renderDailyCap: 20, open: false, openDailyCap: 8 }),
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

// ---------- own YouCam keys, open mode, key hygiene ----------

const KEY = "vk/abc+def=ghi_0123456789";
const withKey = { "x-youcam-key": KEY };
const credit = (amount = 500) => vi.fn<typeof fetch>(async () => Response.json({ status: 200, results: [{ id: "1", amount_dec: amount }] }));
const rejected = () => vi.fn<typeof fetch>(async () => Response.json({ error: "Unauthorized" }, { status: 401 }));
const bearerOf = (fn: ReturnType<typeof credit>, call = 0) => ((fn.mock.calls[call][1] as RequestInit).headers as Record<string, string>).Authorization;

describe("an own YouCam key on a keyless deploy", () => {
  test("status validates it with one free credit call made with that key; the answer carries neither key nor balance", async () => {
    const fetchMock = credit(7);
    vi.stubGlobal("fetch", fetchMock);
    const res = await status(get(withKey));
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ live: true, byok: true, keyOk: true, uploadsAllowed: true } satisfies StatusResponse);
    expect(text).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bearerOf(fetchMock)).toBe("Bearer " + KEY);
  });

  test("a refused key is keyOk false with invalid_key, and however often it is tried it never counts as a wrong access code", async () => {
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    vi.stubEnv("LIVE_ACCESS_CODES", "judge-alpha");
    vi.stubGlobal("fetch", rejected());
    const ip = { "x-forwarded-for": "203.0.113.20" };
    for (let i = 0; i < BAD_CODE_LIMIT.max + 2; i++) {
      const res = await status(get({ ...ip, ...withKey, "x-access-code": "not-the-code" }));
      expect(await res.json()).toEqual({ live: false, reason: "invalid_key", byok: true, keyOk: false, uploadsAllowed: false } satisfies StatusResponse);
    }
    const next = await status(get({ ...ip, "x-access-code": "judge-alpha" })); // not locked out
    expect(next.status).toBe(200);
  });

  test("a deployment forced to recordings or switched off refuses the key before any call to YouCam", async () => {
    vi.stubEnv("YOUCAM_MODE", "replay");
    expect(await (await status(get(withKey))).json()).toEqual({ live: false, reason: "replay_only", uploadsAllowed: false });
    vi.stubEnv("YOUCAM_MODE", undefined as unknown as string);
    vi.stubEnv("KILL_SWITCH", "1");
    expect(await (await status(get(withKey))).json()).toEqual({ live: false, reason: "kill_switch", byok: true, uploadsAllowed: false });
    const upload = await analysis(post("analysis", { image: pngDataUrl(1080, 1341) }, withKey));
    expect(upload.status).toBe(503);
    expect(network).not.toHaveBeenCalled();
  });

  test("an upload with a key is a live upload, never answered with a stand-in recording, even when REPLAY_UPLOADS is on", async () => {
    vi.stubEnv("REPLAY_UPLOADS", "1");
    vi.stubEnv("KILL_SWITCH", "1"); // stops it at the gate, which is as far as this test needs it to go
    const res = await analysis(post("analysis", { image: pngDataUrl(1080, 1341) }, withKey));
    expect((await errorOf(res)).code).toBe("kill_switch");
  });

  test("cleanup deletes with the caller's key (sent in the body, as sendBeacon must), and only with a token secret", async () => {
    const token = signTaskId("task-secret", "task-9");
    const del = credit();
    vi.stubGlobal("fetch", del);
    const refused = await cleanup(post("cleanup", { taskIds: [token], youcamKey: KEY }));
    expect(await refused.json()).toEqual({ deleted: 0, failed: 0 }); // no secret: nothing could have been signed
    expect(del).not.toHaveBeenCalled();

    vi.stubEnv("TASK_TOKEN_SECRET", "task-secret");
    const done = await cleanup(post("cleanup", { taskIds: [token], youcamKey: KEY }));
    expect(await done.json()).toEqual({ deleted: 1, failed: 0 });
    expect(bearerOf(del)).toBe("Bearer " + KEY);
    const forged = await cleanup(post("cleanup", { taskIds: ["task-9." + "0".repeat(24)], youcamKey: KEY }));
    expect(await forged.json()).toEqual({ deleted: 0, failed: 1 });
  });

  test("the key header is read only when it is plain printable text of a sane length, and it outranks an access code", () => {
    const callerWith = (headers: Record<string, string>) => callerOf(new Request("http://localhost/x", { headers }));
    expect(callerWith({ ...withKey, "x-access-code": "judge-alpha" })).toMatchObject({ apiKey: KEY, code: null });
    for (const bad of ["has space", "x".repeat(201), "tab\there"]) {
      expect(callerWith({ "x-youcam-key": bad, "x-access-code": "c" })).toMatchObject({ apiKey: null, code: "c" });
    }
  });
});

describe("key hygiene", () => {
  const caller = { ip: "203.0.113.50", code: null, apiKey: KEY };

  test("an upstream error that echoes the key is scrubbed from every console channel and from the response", async () => {
    vi.stubEnv("YOUCAM_API_KEY", "project-key-0123456789");
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const echoed = `bad token ${KEY}; Authorization: Bearer ${KEY}; ?k=${encodeURIComponent(KEY)}; project project-key-0123456789`;
    const res = await respond(async () => {
      throw new YouCamError("upstream_error", "The analysis service had a hiccup. Please try again in a moment.", 502, echoed);
    }, caller);
    const unhandled = await respond(async () => {
      throw new Error("fetch failed for " + KEY);
    }, caller);

    const logged = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join("\n");
    expect(logged).toContain("[youcam] upstream_error"); // it did log, just not the secrets
    for (const secret of [KEY, encodeURIComponent(KEY), "project-key-0123456789"]) expect(logged).not.toContain(secret);
    expect(await res.text()).not.toContain(KEY);
    expect(await unhandled.text()).not.toContain(KEY);
    spies.forEach((spy) => spy.mockRestore());
  });

  test("redact removes the given secrets and bearer tokens, and ignores empty or tiny ones", () => {
    expect(redact("a Bearer abc.def b", [])).toBe("a Bearer [redacted] b");
    expect(redact("key=sekret-1234 again sekret-1234", ["sekret-1234", "", null, undefined])).toBe("key=[redacted] again [redacted]");
    expect(redact("a cat sat", ["a"])).toBe("a cat sat");
  });

  test("the client removes its key from an upstream error body before it is cut or parsed", async () => {
    const fake = fakeFetch(() => json({ error: "Invalid key " + KEY }, 400));
    const client = createYouCamClient({ apiKey: KEY, fetch: fake.fetch, sleep: noSleep });
    const error = (await client.credit().catch((e: unknown) => e)) as YouCamError;
    expect(error).toBeInstanceOf(YouCamError);
    expect(error.detail).toBe("Invalid key [redacted]");
  });
});

// Last in the file: it reads the project balance, and the guard keeps that for 60 s.
describe("open deployment, through the routes", () => {
  beforeEach(() => {
    vi.stubEnv("YOUCAM_API_KEY", "test-key-not-real");
    vi.stubEnv("LIVE_OPEN", "1");
    vi.stubEnv("UNIT_FLOOR", "300");
    vi.stubGlobal("fetch", credit(310)); // 310 - 16 <= 300
  });

  test("with no code the floor decides, and the way on offered is the visitor's own key; demo faces are unaffected", async () => {
    const res = await status(get({ "x-forwarded-for": "203.0.113.60" }));
    expect(await res.json()).toEqual({ live: false, reason: "budget_floor", open: true, uploadsAllowed: false } satisfies StatusResponse);
    const upload = await analysis(post("analysis", { image: pngDataUrl(1080, 1341) }, { "x-forwarded-for": "203.0.113.60" }));
    expect(upload.status).toBe(503);
    expect((await errorOf(upload)).message).toMatch(/your own YouCam API key/);
    expect((await analysis(post("analysis", { persona: "p2b" }))).status).toBe(200);
  });

  test("the kill switch closes it, and cleanup is refused when the deployment is not open", async () => {
    vi.stubEnv("KILL_SWITCH", "1");
    expect(await (await status(get({ "x-forwarded-for": "203.0.113.61" }))).json()).toEqual({ live: false, reason: "kill_switch", open: true, uploadsAllowed: false });
    vi.stubEnv("LIVE_OPEN", "0");
    vi.stubEnv("TASK_TOKEN_SECRET", "task-secret");
    const res = await cleanup(post("cleanup", { taskIds: [signTaskId("task-secret", "t-1")] }));
    expect(await res.json()).toEqual({ deleted: 0, failed: 0 });
  });
});
