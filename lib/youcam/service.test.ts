import { describe, expect, test, vi } from "vitest";
import { createBudgetGuard, hashCode, type GuardConfig, type LedgerEntry } from "./budget";
import { createYouCamClient } from "./client";
import { createService, readUpload, MAX_IMAGE_BYTES, type Auth } from "./service";
import { signTaskId, taskTokenSecret, verifyTaskToken } from "./tasktokens";
import { FILE_ID, TASK_ID, fakeFetch, json, jsonText, noSleep, pngDataUrl, pngHeader, type FakeHandler } from "./test-helpers";

const PUT_URL = "https://yce-us.s3-accelerate.amazonaws.com/ttl30/up.png?X-Amz-Signature=abc";
const CODE = "judge-alpha";
const PROJECT_KEY = "test-key-123";
const BYOK = "byok-key-999-visitor";
const IP = "203.0.113.5";
const as = (code: string | null, ip = IP): Auth => ({ code, ip });
const own = (apiKey = BYOK): Auth => ({ code: null, apiKey, ip: IP });

const ANALYSIS = `{"status":200,"data":{"error":null,"task_status":"success","results":{"output":[
  {"type":"hd_age_spot","raw_score":72.62026977539062,"ui_score":71,"mask_urls":["https://s3.example/age.png"],"url":null},
  {"type":"hd_pore","region":"whole","raw_score":16.381267547607422,"ui_score":53,"mask_urls":["https://s3.example/pore.png"],"url":null},
  {"type":"all","score":71.125,"url":null},{"type":"skin_age","score":46,"url":null},
  {"type":"resize_image","mask_urls":["https://s3.example/resize.jpg"],"url":null}]}}}`;
const RENDER = `{"status":200,"data":{"error":null,"task_status":"success","results":{"url":"https://s3.example/render.jpg"}}}`;
const TASK_ERROR = `{"status":200,"data":{"task_status":"error","error":"error_no_face"}}`;

interface World {
  analysisPoll: string;
  putStatus: number;
  balance: number;
  /** YouCam answers 401 to this bearer key. */
  rejected?: string;
}

function youcam(world: World): FakeHandler {
  return (call) => {
    const { url, method } = call;
    if (world.rejected && call.headers.authorization === `Bearer ${world.rejected}`) return json({ error: "Unauthorized" }, 401);
    if (url.endsWith("/s2s/v1.0/client/credit")) return json({ status: 200, results: [{ id: "1", amount_dec: world.balance }] });
    if (url.endsWith("/s2s/v2.0/file")) {
      return json({
        status: 200,
        data: { files: [{ file_id: FILE_ID, requests: [{ method: "PUT", url: PUT_URL, headers: { "Content-Type": "image/png" } }] }] },
      });
    }
    if (url === PUT_URL) return new Response(null, { status: world.putStatus });
    if (method === "POST") return json({ status: 200, data: { task_id: TASK_ID } });
    if (url.includes("/skin-analysis/")) return jsonText(world.analysisPoll);
    if (url.includes("/makeup-vto/") || url.includes("/skin-simulation/")) return jsonText(RENDER);
    if (url === "https://s3.example/render.jpg") return new Response(pngHeader(1080, 1340));
    if (url.startsWith("https://s3.example/")) return new Response(pngHeader(1080, 1341));
    return new Response("unexpected", { status: 599 });
  };
}

function setup(
  world: Partial<World> = {},
  overrides: Partial<GuardConfig> = {},
  env: Record<string, string> = {},
  extra: { byokEnabled?: () => boolean } = {},
) {
  const state: World = { analysisPoll: ANALYSIS, putStatus: 200, balance: 500, ...world };
  const fake = fakeFetch(youcam(state));
  const make = (onCharge?: Parameters<typeof createYouCamClient>[0]["onCharge"], apiKey = PROJECT_KEY) =>
    createYouCamClient({ apiKey, fetch: fake.fetch, sleep: noSleep, onCharge });
  const ledger = vi.fn<(entry: LedgerEntry) => void>();
  const guard = createBudgetGuard({
    config: () => ({
      codes: [CODE],
      killSwitch: false,
      unitFloor: 100,
      analysisDailyCap: 2,
      renderDailyCap: 10,
      open: false,
      openDailyCap: 8,
      ...overrides,
    }),
    getBalance: () => make().credit(),
  });
  const decide = vi.spyOn(guard, "decide");
  const service = createService({ env: () => env, createClient: make, guard, ledger, ...extra });
  return { service, ledger, calls: fake.calls, state, decide };
}

const apiCalls = <T extends { url: string }>(calls: T[]) => calls.filter((c) => c.url.includes("makeupar.com"));

describe("service (live path, fake YouCam)", () => {
  test("analysis then makeup: ledger lines, hashed code, fileRef carries the frame, VTO offset is +1 row", async () => {
    const { service, ledger, calls } = setup();

    const analysis = await service.analysis({ image: pngDataUrl(1080, 1341) }, as(CODE));
    expect(analysis).toMatchObject({ source: "live", unitsCharged: 16, fileRef: `live:1080x1341:${FILE_ID}` });
    expect(analysis.analysis).toMatchObject({ engine: "hd", frame: { width: 1080, height: 1341 }, skinAge: 46, overall: 71.125 });
    expect(analysis.analysis.results.map((r) => r.maskRef)).toEqual(["hd_age_spot", "hd_pore_whole"]);
    expect(Object.keys(analysis.masks)).toEqual(expect.arrayContaining(["hd_age_spot", "hd_pore_whole"]));
    expect(analysis.masks.hd_age_spot).toMatch(/^data:image\/png;base64,/);

    const render = await service.makeup(
      { fileRef: analysis.fileRef, effects: [{ category: "foundation", palettes: [{ color: "#8a5840", coverageIntensity: 60 }] }] },
      as(CODE),
    );
    expect(render).toMatchObject({ source: "live", unitsCharged: 1, width: 1080, height: 1340, offset: { dx: 0, dy: 1 } });

    const vto = calls.find((c) => c.url.endsWith("/task/makeup-vto"))!.body as { src_file_id: string; effects: { category: string }[] };
    expect(vto.src_file_id).toBe(FILE_ID);
    expect(vto.effects.map((e) => e.category)).toEqual(["skin_smooth", "foundation"]);

    expect(ledger.mock.calls.map(([e]) => [e.action, e.units, e.who, e.maybe])).toEqual([
      ["skin_analysis_hd", 16, hashCode(CODE), false],
      ["makeup_vto", 1, hashCode(CODE), false],
    ]);
  });

  test("live responses carry signed task tokens; nothing is deleted until cleanup, which honours only its own tokens", async () => {
    const { service, calls } = setup({}, {}, { YOUCAM_API_KEY: PROJECT_KEY });
    const analysis = await service.analysis({ image: pngDataUrl(1080, 1341) }, as(CODE));
    const render = await service.makeup({ fileRef: analysis.fileRef, effects: [{ category: "foundation", palettes: [{ coverageIntensity: 50 }] }] }, as(CODE));
    expect(analysis.taskIds).toHaveLength(1);
    expect(render.taskIds).toHaveLength(1);
    expect(analysis.taskIds![0]).not.toBe(TASK_ID); // signed, not the raw id
    const deletes = () => calls.filter((c) => c.url.endsWith("/s2s/v2.0/task/delete"));
    expect(deletes()).toHaveLength(0);

    const forged = `${TASK_ID}.${"0".repeat(24)}`;
    expect(await service.cleanup([...analysis.taskIds!, ...render.taskIds!, forged], as("wrong-code"))).toEqual({ deleted: 0, failed: 0 });
    expect(await service.cleanup([...analysis.taskIds!, ...render.taskIds!, forged], as(null))).toEqual({ deleted: 0, failed: 0 }); // not open
    expect(deletes()).toHaveLength(0);

    // The fake service gives every task the same id: one delete, one forged token refused.
    expect(await service.cleanup([...analysis.taskIds!, ...render.taskIds!, forged], as(CODE))).toEqual({ deleted: 1, failed: 1 });
    expect(deletes().map((c) => c.body)).toEqual([{ task_id: TASK_ID }]);
    expect(deletes()[0].headers.authorization).toBe(`Bearer ${PROJECT_KEY}`);
  });

  test("YOUCAM_DELETE_TASKS=0 switches the session-end delete off: no tokens, no delete calls", async () => {
    const { service, calls } = setup({}, {}, { YOUCAM_DELETE_TASKS: "0" });
    const analysis = await service.analysis({ image: pngDataUrl(1080, 1341) }, as(CODE));
    expect(analysis.taskIds).toBeUndefined();
    expect(await service.cleanup(["a.b"], as(CODE))).toEqual({ deleted: 0, failed: 0 });
    expect(calls.some((c) => c.url.endsWith("/task/delete"))).toBe(false);
  });

  test("refusals are free: no code, too-small photo, wrong format and oversize make no YouCam call", async () => {
    const { service, calls } = setup();
    await expect(service.analysis({ image: pngDataUrl(1080, 1341) }, as(null))).rejects.toMatchObject({ code: "no_code", status: 401 });
    await expect(service.analysis({ image: pngDataUrl(1080, 1341) }, as("guess"))).rejects.toMatchObject({ code: "bad_code", status: 403 });
    await expect(service.analysis({ image: pngDataUrl(800, 1000) }, as(CODE))).rejects.toMatchObject({
      code: "error_below_min_image_size",
    });
    await expect(service.analysis({ image: "data:image/gif;base64,R0lGOD" }, as(CODE))).rejects.toMatchObject({ status: 415 });

    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(pngHeader(1080, 1341));
    expect(() => readUpload(`data:image/png;base64,${Buffer.from(huge).toString("base64")}`)).toThrow(/under 10 MB/);
    expect(calls).toHaveLength(0);
  });

  test("a failure before any unit is spent returns the daily slot; a failure after submit keeps it", async () => {
    const { service, state, ledger } = setup(); // cap: 2 analyses a day
    const attempt = () => service.analysis({ image: pngDataUrl(1080, 1341) }, as(CODE));

    state.putStatus = 400; // upload fails: nothing was submitted
    await expect(attempt()).rejects.toMatchObject({ code: "upload_failed" });
    await expect(attempt()).rejects.toMatchObject({ code: "upload_failed" });
    expect(ledger).not.toHaveBeenCalled();

    state.putStatus = 200;
    state.analysisPoll = TASK_ERROR; // submitted, then failed: the units may be spent
    await expect(attempt()).rejects.toMatchObject({ code: "error_no_face" });
    await expect(attempt()).rejects.toMatchObject({ code: "error_no_face" });
    expect(ledger).toHaveBeenCalledTimes(2);

    await expect(attempt()).rejects.toMatchObject({ code: "daily_cap", status: 429 });
    await expect(service.status(as(CODE))).resolves.toEqual({ live: false, reason: "daily_cap", uploadsAllowed: false });
    await expect(service.status(as(null))).resolves.toEqual({ live: false, reason: "no_code", uploadsAllowed: false });
  });

  test("status.uploadsAllowed is true when live is allowed for the code, false otherwise", async () => {
    const { service } = setup();
    expect((await service.status(as(CODE))).uploadsAllowed).toBe(true);
    expect((await service.status(as("not-a-code"))).uploadsAllowed).toBe(false);
    expect((await service.status(as(null))).uploadsAllowed).toBe(false);
  });

  test("status is live for a valid code with budget, and a persona never needs a code", async () => {
    const { service, calls } = setup();
    await expect(service.status(as(CODE))).resolves.toEqual({ live: true, uploadsAllowed: true });
    const persona = await service.analysis({ persona: "p2b" }, as(null));
    expect(persona).toMatchObject({ source: "replay", unitsCharged: 0, fileRef: "persona:p2b" });
    const render = await service.makeup({ fileRef: "persona:p2b", effects: [{ category: "foundation" }] }, as(null));
    expect(render.source).toBe("replay");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});

describe("own YouCam key (BYOK)", () => {
  // Every project limit is shut (no daily slots, a floor above the balance): only an own key can get through.
  const shut = { analysisDailyCap: 0, renderDailyCap: 0, unitFloor: 100_000 };

  test("every YouCam call uses the caller's key, and the project's balance and caps are never consulted", async () => {
    const { service, calls, ledger, decide } = setup({}, shut, { YOUCAM_API_KEY: PROJECT_KEY });
    const analysis = await service.analysis({ image: pngDataUrl(1080, 1341) }, own());
    const effects = [{ category: "foundation", palettes: [{ coverageIntensity: 50 }] }];
    const render = await service.makeup({ fileRef: analysis.fileRef, effects }, own());
    const sim = await service.simulate({ fileRef: analysis.fileRef, strengths: { spots: 0.5 } }, own());
    expect(await service.cleanup([...analysis.taskIds!, ...render.taskIds!, ...sim.taskIds!], own())).toEqual({ deleted: 1, failed: 0 });

    const youcamCalls = apiCalls(calls);
    const endings = ["/file", "/task/skin-analysis", "/task/makeup-vto", "/task/skin-simulation", "/task/delete"];
    for (const ending of endings) expect(youcamCalls.some((c) => c.method === "POST" && c.url.endsWith(ending))).toBe(true);
    expect(youcamCalls.length).toBeGreaterThan(endings.length); // plus the polls
    expect(youcamCalls.every((c) => c.headers.authorization === `Bearer ${BYOK}`)).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/client/credit"))).toBe(false);
    expect(decide).not.toHaveBeenCalled();
    expect(ledger.mock.calls.map(([e]) => e.who)).toEqual(["byok", "byok", "byok"]);
  });

  test("it works on a keyless deploy; the kill switch and a deployment forced to recordings still refuse it", async () => {
    const keyless = setup({}, shut, {}, { byokEnabled: () => true });
    const ok = await keyless.service.analysis({ image: pngDataUrl(1080, 1341) }, own());
    expect(ok.source).toBe("live");
    expect(ok.taskIds).toBeUndefined(); // no TASK_TOKEN_SECRET and no project key: nothing signable, so no cleanup

    const killed = setup({}, { ...shut, killSwitch: true });
    await expect(killed.service.analysis({ image: pngDataUrl(1080, 1341) }, own())).rejects.toMatchObject({ code: "kill_switch", status: 503 });
    await expect(killed.service.status(own())).resolves.toMatchObject({ live: false, reason: "kill_switch", byok: true });

    const forced = setup({}, shut, {}, { byokEnabled: () => false });
    await expect(forced.service.analysis({ image: pngDataUrl(1080, 1341) }, own())).rejects.toMatchObject({ code: "live_reserved" });
    await expect(forced.service.status(own())).resolves.toMatchObject({ live: false, reason: "replay_only" });
    expect(apiCalls([...killed.calls, ...forced.calls])).toHaveLength(0);
  });

  test("status validates the key with one free credit call: keyOk true, or false with invalid_key and no balance shown", async () => {
    const good = setup({ balance: 7 });
    await expect(good.service.status(own())).resolves.toEqual({ live: true, byok: true, keyOk: true, uploadsAllowed: true });
    expect(good.calls.map((c) => [c.method, c.url.split("/").slice(-1)[0], c.headers.authorization])).toEqual([["GET", "credit", `Bearer ${BYOK}`]]);

    const bad = setup({ rejected: BYOK });
    await expect(bad.service.status(own())).resolves.toEqual({
      live: false,
      reason: "invalid_key",
      byok: true,
      keyOk: false,
      uploadsAllowed: false,
    });
  });

  test("YouCam refusing the key mid-session is told as an invalid key, not as the project being down", async () => {
    const { service } = setup({ rejected: BYOK });
    await expect(service.analysis({ image: pngDataUrl(1080, 1341) }, own())).rejects.toMatchObject({ code: "invalid_key", status: 401 });
  });
});

describe("open deployment (LIVE_OPEN)", () => {
  const open = { open: true, analysisDailyCap: 2, openDailyCap: 3, unitFloor: 300 };

  test("a visitor with no code spends project units as 'open'; status says so; cleanup works with the project key", async () => {
    const { service, ledger, calls } = setup({ balance: 1000 }, open, { YOUCAM_API_KEY: PROJECT_KEY });
    await expect(service.status(as(null))).resolves.toEqual({ live: true, open: true, uploadsAllowed: true });
    const analysis = await service.analysis({ image: pngDataUrl(1080, 1341) }, as(null));
    expect(ledger.mock.calls.map(([e]) => e.who)).toEqual(["open"]);

    const done = await service.cleanup(analysis.taskIds!, as(null));
    expect(done).toEqual({ deleted: 1, failed: 0 });
    const del = calls.find((c) => c.url.endsWith("/task/delete"))!;
    expect(del.headers.authorization).toBe(`Bearer ${PROJECT_KEY}`);
    // A wrong code is a wrong code: it is never quietly downgraded to an open visitor.
    await expect(service.analysis({ image: pngDataUrl(1080, 1341) }, as("guess"))).rejects.toMatchObject({ code: "bad_code" });
  });

  test("when the shared allowance is spent, the refusal points at the visitor's own key", async () => {
    const floor = setup({ balance: 310 }, open); // 310 - 16 <= 300
    await expect(floor.service.analysis({ image: pngDataUrl(1080, 1341) }, as(null))).rejects.toMatchObject({
      code: "budget_floor",
      message: expect.stringMatching(/your own YouCam API key/),
    });
    await expect(floor.service.status(as(null))).resolves.toEqual({ live: false, reason: "budget_floor", open: true, uploadsAllowed: false });

    const capped = setup({ balance: 1000 }, { ...open, analysisDailyCap: 1 });
    await capped.service.analysis({ image: pngDataUrl(1080, 1341) }, as(null));
    await expect(capped.service.analysis({ image: pngDataUrl(1080, 1341) }, as(null))).rejects.toMatchObject({
      code: "daily_cap",
      message: expect.stringMatching(/your own YouCam API key/),
    });
    // The same wall, met with an access code, keeps its original wording.
    await expect(setup({ balance: 310 }, open).service.analysis({ image: pngDataUrl(1080, 1341) }, as(CODE))).rejects.toMatchObject({
      code: "budget_floor",
      message: expect.not.stringMatching(/API key/),
    });
  });
});

describe("task tokens", () => {
  test("TASK_TOKEN_SECRET signs them, falling back to the project key; with neither there is no secret", () => {
    expect(taskTokenSecret({ TASK_TOKEN_SECRET: "tts", YOUCAM_API_KEY: "k" })).toBe("tts");
    expect(taskTokenSecret({ TASK_TOKEN_SECRET: " ", YOUCAM_API_KEY: "k" })).toBe("k");
    expect(taskTokenSecret({ YOUCAM_API_KEY: "k" })).toBe("k");
    expect(taskTokenSecret({})).toBe("");
    // An empty secret verifies nothing, so a token forged against it is worthless.
    expect(verifyTaskToken("", signTaskId("", "task-1"))).toBeNull();
    expect(verifyTaskToken("tts", signTaskId("tts", "task-1"))).toBe("task-1");
    expect(verifyTaskToken("k", signTaskId("tts", "task-1"))).toBeNull();
  });

  test("a session is signed with TASK_TOKEN_SECRET; with no secret at all no token is issued and cleanup is refused", async () => {
    const withSecret = setup({}, {}, { TASK_TOKEN_SECRET: "tts-1", YOUCAM_API_KEY: PROJECT_KEY });
    const analysis = await withSecret.service.analysis({ image: pngDataUrl(1080, 1341) }, as(CODE));
    expect(verifyTaskToken("tts-1", analysis.taskIds![0])).toBe(TASK_ID);
    expect(verifyTaskToken(PROJECT_KEY, analysis.taskIds![0])).toBeNull();

    const none = setup();
    const unsigned = await none.service.analysis({ image: pngDataUrl(1080, 1341) }, as(CODE));
    expect(unsigned.taskIds).toBeUndefined();
    const forged = signTaskId("", TASK_ID);
    expect(await none.service.cleanup([forged], as(CODE))).toEqual({ deleted: 0, failed: 0 });
    expect(await none.service.cleanup([forged], own())).toEqual({ deleted: 0, failed: 0 });
    expect(none.calls.some((c) => c.url.endsWith("/task/delete"))).toBe(false);
  });
});
