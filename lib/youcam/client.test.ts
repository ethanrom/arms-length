import { describe, expect, test } from "vitest";
import { HD_ACTIONS, SD_ACTIONS } from "@/lib/contracts";
import { createYouCamClient, withSkinSmoothZero, type ChargeEvent } from "./client";
import { YouCamError } from "./errors";
import { FILE_ID, TASK_ID, fakeFetch, json, jsonText, pngHeader, type FakeHandler } from "./test-helpers";

const PUT_URL = "https://yce-us.s3-accelerate.amazonaws.com/ttl30/up.jpg?X-Amz-Signature=abc";
const OUTPUT = `{"status":200,"data":{"error":null,"task_status":"success","results":{"output":[
  {"type":"hd_acne","region":"whole","raw_score":75.16320037841797,"ui_score":85,"mask_urls":["https://s3.example/m.png"],"url":null},
  {"type":"all","score":71.125,"url":null}]}}}`;

/** Upload + submit + poll endpoints; `pollBodies` are returned in order, the last one repeating. */
function youcam(pollBodies: string[], onSubmit?: FakeHandler): FakeHandler {
  let polls = 0;
  return (call) => {
    if (call.url.endsWith("/s2s/v2.0/file")) {
      return json({
        status: 200,
        data: {
          files: [
            {
              file_id: FILE_ID,
              requests: [
                { method: "PUT", url: PUT_URL, headers: { "Content-Length": "4", "Content-Type": "image/jpeg" } },
              ],
            },
          ],
        },
      });
    }
    if (call.url === PUT_URL) return new Response(null, { status: 200 });
    if (call.method === "POST") return onSubmit?.(call) ?? json({ status: 200, data: { task_id: TASK_ID } });
    if (call.url.includes(TASK_ID)) return jsonText(pollBodies[Math.min(polls++, pollBodies.length - 1)]);
    return new Response("unexpected", { status: 599 });
  };
}

const running = '{"status":200,"data":{"task_status":"running"}}';

function setup(handler: FakeHandler, extra: { sleeps?: number[]; charges?: ChargeEvent[] } = {}) {
  const fake = fakeFetch(handler);
  const client = createYouCamClient({
    apiKey: "test-key-123",
    fetch: fake.fetch,
    sleep: async (ms) => void extra.sleeps?.push(ms),
    onCharge: (event) => extra.charges?.push(event),
    maxRetries: 3,
  });
  return { client, calls: fake.calls };
}

describe("YouCam client", () => {
  test("upload, submit and poll: HD request shape, auth only on API calls, 1 s then 1.5 s polling", async () => {
    const sleeps: number[] = [];
    const charges: ChargeEvent[] = [];
    const { client, calls } = setup(youcam([running, OUTPUT]), { sleeps, charges });

    const fileId = await client.upload(new Uint8Array([1, 2, 3, 4]), "image/jpeg");
    const run = await client.skinAnalysis(fileId, "hd");

    expect(fileId).toBe(FILE_ID);
    const put = calls.find((c) => c.url === PUT_URL)!;
    expect(put.method).toBe("PUT");
    expect(put.headers).not.toHaveProperty("content-length");
    expect(put.headers).not.toHaveProperty("authorization");
    expect(put.headers["content-type"]).toBe("image/jpeg");

    const submit = calls.find((c) => c.url.endsWith("/s2s/v2.1/task/skin-analysis"))!;
    expect(submit.headers.authorization).toBe("Bearer test-key-123");
    expect(submit.body).toEqual({ src_file_id: FILE_ID, dst_actions: HD_ACTIONS, format: "json" });

    expect(sleeps).toEqual([1000, 1500]); // first poll after 1 s, the second poll 1.5 s later
    expect(run.output).toHaveLength(2);
    expect(run.units).toBe(16);
    expect(charges).toEqual([{ action: "skin_analysis_hd", units: 16, maybe: false }]);

    const sd = setup(youcam([OUTPUT]));
    await sd.client.skinAnalysis(FILE_ID, "sd");
    expect(sd.calls.find((c) => c.method === "POST")!.body).toMatchObject({ dst_actions: SD_ACTIONS });
  });

  test("429 on a submit is retried, 400 and 401 are not", async () => {
    let attempts = 0;
    const throttled = youcam([OUTPUT], () =>
      ++attempts < 3 ? json({ status: 429, error: "Too many requests" }, 429) : json({ status: 200, data: { task_id: TASK_ID } }),
    );
    const ok = setup(throttled);
    await ok.client.skinAnalysis(FILE_ID, "hd");
    expect(ok.calls.filter((c) => c.method === "POST" && c.url.includes("/task/"))).toHaveLength(3);

    for (const status of [400, 401]) {
      const bad = setup(youcam([OUTPUT], () => json({ status, error: "nope", error_code: "InvalidParameters" }, status)));
      await expect(bad.client.skinAnalysis(FILE_ID, "hd")).rejects.toBeInstanceOf(YouCamError);
      expect(bad.calls.filter((c) => c.url.includes("/task/"))).toHaveLength(1);
    }
  });

  test("a submit that fails ambiguously is never retried and is reported as a maybe-charge", async () => {
    for (const handler of [
      youcam([OUTPUT], () => json({ status: 500 }, 500)),
      youcam([OUTPUT], () => {
        throw new TypeError("fetch failed");
      }),
    ]) {
      const charges: ChargeEvent[] = [];
      const { client, calls } = setup(handler, { charges });
      await expect(client.skinAnalysis(FILE_ID, "hd")).rejects.toMatchObject({ status: 502 });
      expect(calls.filter((c) => c.url.includes("/task/skin-analysis"))).toHaveLength(1);
      expect(charges).toEqual([{ action: "skin_analysis_hd", units: 16, maybe: true }]);
    }
  });

  test("free calls retry 5xx: a polling GET survives a 503", async () => {
    let polls = 0;
    const { client } = setup((call) =>
      call.method === "POST" ? json({ status: 200, data: { task_id: TASK_ID } }) : ++polls === 1 ? json({}, 503) : jsonText(OUTPUT),
    );
    expect((await client.skinAnalysis(FILE_ID, "hd")).output).toHaveLength(2);
    expect(polls).toBe(2);
  });

  test("engine errors become plain language; unknown codes are accepted", async () => {
    const failed = (code: string) =>
      `{"status":200,"data":{"task_status":"error","error":"${code}","error_message":"raw detail"}}`;

    const tooSmall = setup(youcam([failed("error_src_face_too_small")]));
    await expect(tooSmall.client.skinAnalysis(FILE_ID, "hd")).rejects.toMatchObject({
      code: "error_src_face_too_small",
      message: "Move closer so your face fills more of the frame.",
      status: 422,
    });

    const dark = setup(youcam([failed("error_lighting_dark")]));
    await expect(dark.client.skinAnalysis(FILE_ID, "hd")).rejects.toThrow(/dark/i);

    const unknown = setup(youcam([failed("error_brand_new_code")]));
    await expect(unknown.client.skinAnalysis(FILE_ID, "hd")).rejects.toMatchObject({
      code: "error_brand_new_code",
      status: 502,
    });
  });

  test("polling gives up after the timeout instead of waiting forever", async () => {
    const { client, calls } = setup(youcam([running]));
    const started = calls.length;
    await expect(client.skinAnalysis(FILE_ID, "hd")).rejects.toMatchObject({ code: "timeout", status: 504 });
    const polls = calls.slice(started).filter((c) => c.method === "GET" && c.url.includes(TASK_ID)).length;
    expect(polls).toBeGreaterThan(30);
    expect(polls).toBeLessThan(50);
  });

  test("makeup always sends skin_smooth at 0 unless the caller provides one; simulate drops zero strengths", async () => {
    const foundation = { category: "foundation", palettes: [{ color: "#8a5840", coverageIntensity: 60 }] };
    expect(withSkinSmoothZero([foundation])).toEqual([
      { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 },
      foundation,
    ]);
    const own = { category: "skin_smooth", skinSmoothStrength: 30, skinSmoothColorIntensity: 30 };
    expect(withSkinSmoothZero([foundation, own])).toEqual([foundation, own]);

    const result = `{"status":200,"data":{"task_status":"success","results":{"url":"https://s3.example/r.jpg"}}}`;
    const vto = setup(youcam([result]));
    const render = await vto.client.makeup(FILE_ID, [foundation]);
    expect(render).toMatchObject({ url: "https://s3.example/r.jpg", units: 1 });
    const body = vto.calls.find((c) => c.url.endsWith("/s2s/v2.0/task/makeup-vto"))!.body as { effects: unknown[]; version: string };
    expect(body.version).toBe("1.0");
    expect(body.effects[0]).toMatchObject({ category: "skin_smooth", skinSmoothStrength: 0 });

    const sim = setup(youcam([result]));
    const out = await sim.client.simulate(FILE_ID, { spots: 0.5, redness: 0.5, wrinkle: 0 });
    expect(out.units).toBe(4);
    expect(sim.calls.find((c) => c.url.endsWith("/s2s/v2.0/task/skin-simulation"))!.body).toEqual({
      src_file_id: FILE_ID,
      spots: 0.5,
      redness: 0.5,
    });
    await expect(sim.client.simulate(FILE_ID, { spots: 0 })).rejects.toBeInstanceOf(YouCamError);
  });

  test("downloads need no credentials and are sniffed by magic bytes; credit sums unexpired tokens", async () => {
    const future = Date.now() + 86_400_000;
    const { client, calls } = setup((call) =>
      call.url.endsWith("/s2s/v1.0/client/credit")
        ? // ids above 2^53 must survive parsing; amount_dec may be fractional
          jsonText(
            `{"status":200,"results":[{"id":412833187765423042,"type":"ApiPaygToken","amount":939,"amount_dec":939.5,"expiry":${future}},` +
              `{"id":412833187765423043,"type":"ApiPaygToken","amount":50,"amount_dec":50,"expiry":1000}]}`,
          )
        : new Response(pngHeader(1080, 1340)),
    );
    expect(await client.credit()).toBe(939.5);

    // The VTO "jpg" is a PNG: the type comes from the bytes, not the URL.
    const image = await client.download("https://s3.example/result.jpg?sig=1");
    expect(image).toMatchObject({ mime: "image/png", width: 1080, height: 1340 });
    expect(image.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(calls[calls.length - 1].headers).not.toHaveProperty("authorization");
  });
});
