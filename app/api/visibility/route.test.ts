import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ApiError, VisibilityReport, VisibilityRequest } from "@/lib/contracts";
import { fixturePath } from "@/lib/youcam/fixtures";
import { fixtureVisibilityRequest } from "@/scripts/dropin/request";
import { isYouCamResultUrl, resetRateLimit } from "./guard";
import { GET, POST } from "./route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/visibility", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;

beforeEach(() => resetRateLimit());
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/visibility (fixtures, no network)", () => {
  test("p2b: concerns with finite distances, dark circles included, and the scale that was used", async () => {
    const res = await POST(post(fixtureVisibilityRequest("p2b")));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-scale-source")).toBe("assumed");
    expect(res.headers.get("x-scale-method")).toBe("eye-regions");
    const report = (await res.json()) as VisibilityReport;
    expect(report.viewing.label).toBe("indoor");
    expect(report.concerns.length).toBeGreaterThanOrEqual(4);
    const darkCircle = report.concerns.find((c) => c.concern === "dark_circle");
    expect(Number.isFinite(darkCircle?.maxDistanceM)).toBe(true);
    expect(darkCircle!.maxDistanceM).toBeGreaterThan(0);
    // The scale was not measured, so no concern may claim better than low confidence.
    expect(report.concerns.every((c) => c.confidence === "low")).toBe(true);
  }, 60_000);

  test("a caller-supplied scale and viewing override the estimate and the defaults", async () => {
    const iris = JSON.parse(fs.readFileSync(fixturePath("p2b", "scale.json"), "utf8"));
    const body: VisibilityRequest = {
      ...fixtureVisibilityRequest("p2b"),
      scale: { mmPerPx: iris.mmPerPx, relSd: iris.relSd, source: "iris", irisPx: iris.irisPx },
      viewing: { luminanceCdM2: 300 },
    };
    const res = await POST(post(body));
    expect(res.headers.get("x-scale-source")).toBe("iris");
    expect(res.headers.get("x-scale-method")).toBe("given");
    const report = (await res.json()) as VisibilityReport;
    expect(report.viewing).toMatchObject({ luminanceCdM2: 300, label: "custom", acuityScale: 1 });
    expect(report.concerns.some((c) => c.confidence !== "low")).toBe(true);
  }, 60_000);

  test("masks are fetched only from YouCam's S3 result storage; any other URL is refused before a download", async () => {
    expect(isYouCamResultUrl("https://yce-us.s3-accelerate.amazonaws.com/ttl30/a.png?X-Amz-Expires=7200")).toBe(true);
    expect(isYouCamResultUrl("https://bucket.s3.us-east-1.amazonaws.com/a.png")).toBe(true);
    for (const url of [
      "http://yce-us.s3-accelerate.amazonaws.com/a.png",
      "https://evil.example.com/a.png",
      "https://yce-us.s3.amazonaws.com.evil.example.com/a.png",
      "https://evil.example.com/.s3.amazonaws.com",
      "https://user@yce-us.s3.amazonaws.com/a.png",
      "https://yce-us.s3.amazonaws.com:8443/a.png",
      "https://ec2-1-2-3-4.compute-1.amazonaws.com/a.png",
      "https://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
    ]) {
      expect(isYouCamResultUrl(url), url).toBe(false);
    }

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const request = fixtureVisibilityRequest("p2b");
    const output = request.output.map((item) => {
      const entry = item as { type: string; mask_urls?: string[] };
      return entry.type === "hd_age_spot" ? { ...entry, mask_urls: ["https://169.254.169.254/latest/meta-data/mask.png"] } : entry;
    });
    const res = await POST(post({ ...request, output }));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("mask_url_not_allowed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("without a masks field, masks are downloaded from the allowed result URLs (redirects not followed)", async () => {
    const request = fixtureVisibilityRequest("p2b");
    const toUrl = (rel: string) => `https://yce-us.s3-accelerate.amazonaws.com/ttl30/${rel.replaceAll("/", "_")}?X-Amz-Expires=7200`;
    const output = request.output.map((item) => {
      const entry = item as { mask_urls?: string[] };
      return entry.mask_urls ? { ...entry, mask_urls: [toUrl(entry.mask_urls[0])] } : entry;
    });
    const rels = request.output.flatMap((item) => (item as { mask_urls?: string[] }).mask_urls ?? []);
    const files = new Map(rels.map((rel) => [toUrl(rel), fixturePath("p2b", rel)]));
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
      const file = files.get(url);
      return file ? new Response(fs.readFileSync(file)) : new Response("gone", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(post({ output, image: request.image }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([url]) => files.has(url))).toBe(true);
    expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
    expect(((await res.json()) as VisibilityReport).concerns.length).toBeGreaterThan(0);
  }, 60_000);

  test("bad requests get plain-language errors: JSON, shape, size, missing masks, and the per-IP rate limit", async () => {
    const notJson = await POST(post("{nope"));
    expect(notJson.status).toBe(400);
    expect((await errorOf(notJson)).code).toBe("bad_request");

    const shape = await POST(post({ output: [], image: "data:image/png;base64,AAAA" }));
    expect(shape.status).toBe(400);
    expect((await errorOf(shape)).message).toContain("output");

    const huge = await POST(post({ output: [{}], image: `data:image/jpeg;base64,${"A".repeat(4_100_000)}` }));
    expect(huge.status).toBe(413);
    expect((await errorOf(huge)).message).toContain("4.5 MB");

    const request = fixtureVisibilityRequest("p2b");
    const noMasks = await POST(post({ output: request.output, image: request.image }));
    expect(noMasks.status).toBe(422);
    expect((await errorOf(noMasks)).code).toBe("no_masks");

    const ip = { "x-forwarded-for": "203.0.113.9" };
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await POST(post("{nope", ip))).status;
    expect(last).toBe(429);
  });

  test("GET describes the endpoint", async () => {
    const body = (await GET().json()) as { request: { method: string }; unitsSpent: number };
    expect(body).toMatchObject({ request: { method: "POST" }, unitsSpent: 0 });
  });
});
