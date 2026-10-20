import { describe, expect, test, vi } from "vitest";
import { createBudgetGuard, hashCode, type GuardConfig, type LedgerEntry } from "./budget";
import { createYouCamClient } from "./client";
import { createService, readUpload, MAX_IMAGE_BYTES } from "./service";
import { FILE_ID, TASK_ID, fakeFetch, json, jsonText, noSleep, pngDataUrl, pngHeader, type FakeHandler } from "./test-helpers";

const PUT_URL = "https://yce-us.s3-accelerate.amazonaws.com/ttl30/up.png?X-Amz-Signature=abc";
const CODE = "judge-alpha";

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
}

function youcam(world: World): FakeHandler {
  return (call) => {
    const { url, method } = call;
    if (url.endsWith("/s2s/v1.0/client/credit")) return json({ status: 200, results: [{ id: "1", amount_dec: 500 }] });
    if (url.endsWith("/s2s/v2.0/file")) {
      return json({
        status: 200,
        data: { files: [{ file_id: FILE_ID, requests: [{ method: "PUT", url: PUT_URL, headers: { "Content-Type": "image/png" } }] }] },
      });
    }
    if (url === PUT_URL) return new Response(null, { status: world.putStatus });
    if (method === "POST") return json({ status: 200, data: { task_id: TASK_ID } });
    if (url.includes("/skin-analysis/")) return jsonText(world.analysisPoll);
    if (url.includes("/makeup-vto/")) return jsonText(RENDER);
    if (url === "https://s3.example/render.jpg") return new Response(pngHeader(1080, 1340));
    if (url.startsWith("https://s3.example/")) return new Response(pngHeader(1080, 1341));
    return new Response("unexpected", { status: 599 });
  };
}

function setup(world: Partial<World> = {}, overrides: Partial<GuardConfig> = {}) {
  const state: World = { analysisPoll: ANALYSIS, putStatus: 200, ...world };
  const fake = fakeFetch(youcam(state));
  const make = (onCharge?: Parameters<typeof createYouCamClient>[0]["onCharge"]) =>
    createYouCamClient({ apiKey: "test-key-123", fetch: fake.fetch, sleep: noSleep, onCharge });
  const ledger = vi.fn<(entry: LedgerEntry) => void>();
  const guard = createBudgetGuard({
    config: () => ({ codes: [CODE], killSwitch: false, unitFloor: 100, analysisDailyCap: 2, renderDailyCap: 10, ...overrides }),
    getBalance: () => make().credit(),
  });
  const service = createService({ env: () => ({}), createClient: make, guard, ledger });
  return { service, ledger, calls: fake.calls, state };
}

describe("service (live path, fake YouCam)", () => {
  test("analysis then makeup: ledger lines, hashed code, fileRef carries the frame, VTO offset is +1 row", async () => {
    const { service, ledger, calls } = setup();

    const analysis = await service.analysis({ image: pngDataUrl(1080, 1341) }, CODE);
    expect(analysis).toMatchObject({ source: "live", unitsCharged: 16, fileRef: `live:1080x1341:${FILE_ID}` });
    expect(analysis.analysis).toMatchObject({ engine: "hd", frame: { width: 1080, height: 1341 }, skinAge: 46, overall: 71.125 });
    expect(analysis.analysis.results.map((r) => r.maskRef)).toEqual(["hd_age_spot", "hd_pore_whole"]);
    expect(Object.keys(analysis.masks)).toEqual(expect.arrayContaining(["hd_age_spot", "hd_pore_whole"]));
    expect(analysis.masks.hd_age_spot).toMatch(/^data:image\/png;base64,/);

    const render = await service.makeup(
      { fileRef: analysis.fileRef, effects: [{ category: "foundation", palettes: [{ color: "#8a5840", coverageIntensity: 60 }] }] },
      CODE,
    );
    expect(render).toMatchObject({ source: "live", unitsCharged: 1, width: 1080, height: 1340, offset: { dx: 0, dy: 1 } });

    const vto = calls.find((c) => c.url.endsWith("/task/makeup-vto"))!.body as { src_file_id: string; effects: { category: string }[] };
    expect(vto.src_file_id).toBe(FILE_ID);
    expect(vto.effects.map((e) => e.category)).toEqual(["skin_smooth", "foundation"]);

    expect(ledger.mock.calls.map(([e]) => [e.action, e.units, e.codeHash, e.maybe])).toEqual([
      ["skin_analysis_hd", 16, hashCode(CODE), false],
      ["makeup_vto", 1, hashCode(CODE), false],
    ]);
  });

  test("refusals are free: no code, too-small photo, wrong format and oversize make no YouCam call", async () => {
    const { service, calls } = setup();
    await expect(service.analysis({ image: pngDataUrl(1080, 1341) }, null)).rejects.toMatchObject({ code: "no_code", status: 401 });
    await expect(service.analysis({ image: pngDataUrl(1080, 1341) }, "guess")).rejects.toMatchObject({ code: "bad_code", status: 403 });
    await expect(service.analysis({ image: pngDataUrl(800, 1000) }, CODE)).rejects.toMatchObject({
      code: "error_below_min_image_size",
    });
    await expect(service.analysis({ image: "data:image/gif;base64,R0lGOD" }, CODE)).rejects.toMatchObject({ status: 415 });

    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(pngHeader(1080, 1341));
    expect(() => readUpload(`data:image/png;base64,${Buffer.from(huge).toString("base64")}`)).toThrow(/under 10 MB/);
    expect(calls).toHaveLength(0);
  });

  test("a failure before any unit is spent returns the daily slot; a failure after submit keeps it", async () => {
    const { service, state, ledger } = setup(); // cap: 2 analyses a day
    const attempt = () => service.analysis({ image: pngDataUrl(1080, 1341) }, CODE);

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
    await expect(service.status(CODE)).resolves.toEqual({ live: false, reason: "daily_cap" });
    await expect(service.status(null)).resolves.toEqual({ live: false, reason: "no_code" });
  });

  test("status is live for a valid code with budget, and a persona never needs a code", async () => {
    const { service, calls } = setup();
    await expect(service.status(CODE)).resolves.toEqual({ live: true });
    const persona = await service.analysis({ persona: "p2b" }, null);
    expect(persona).toMatchObject({ source: "replay", unitsCharged: 0, fileRef: "persona:p2b" });
    const render = await service.makeup({ fileRef: "persona:p2b", effects: [{ category: "foundation" }] }, null);
    expect(render.source).toBe("replay");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});
