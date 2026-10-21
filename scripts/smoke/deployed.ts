// Smoke test for a deployed Arm's Length. Spends no YouCam units: the only analysis it asks for is a recorded demo face.
//
//   npx tsx scripts/smoke/deployed.ts https://your-app.vercel.app
//   npx tsx scripts/smoke/deployed.ts http://localhost:3000 --keyless
//
// --keyless also requires /api/youcam/status to answer replay_only (a deploy with no API key). Exit code 1 on any failure.
// Do not pass an access code: nothing here needs one, and nothing here would print it.

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith("--")) ?? "").replace(/\/+$/, "");
const keyless = args.includes("--keyless");

if (!/^https?:\/\//.test(base)) {
  console.error("Usage: npx tsx scripts/smoke/deployed.ts <base url, e.g. https://your-app.vercel.app> [--keyless]");
  process.exit(2);
}

interface Outcome {
  ok: boolean;
  note: string;
}

const results: { name: string; ok: boolean; note: string; ms: number }[] = [];

async function check(name: string, run: () => Promise<Outcome>): Promise<void> {
  const started = Date.now();
  let outcome: Outcome;
  try {
    outcome = await run();
  } catch (error) {
    outcome = { ok: false, note: error instanceof Error ? error.message : String(error) };
  }
  const ms = Date.now() - started;
  results.push({ name, ...outcome, ms });
  console.log(`${outcome.ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${outcome.note} (${ms} ms)`);
}

const get = (path: string) => fetch(`${base}${path}`, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

/** Stack traces, source paths and platform error pages must never reach a visitor. */
const LEAKS = /\bat \S+ \(|node_modules|\.tsx?:\d+|[A-Z]:[\/]Users|ENOENT|"stack"|Application error|FUNCTION_INVOCATION/;

async function page(path: string, expect: RegExp): Promise<Outcome> {
  const res = await get(path);
  const html = await res.text();
  if (res.status !== 200) return { ok: false, note: `HTTP ${res.status}` };
  if (LEAKS.test(html)) return { ok: false, note: "the page mentions a stack trace, a source path or an error page" };
  if (!expect.test(html)) return { ok: false, note: `HTTP 200 but the page does not match ${expect}` };
  return { ok: true, note: `HTTP 200, ${(html.length / 1024).toFixed(0)} KB` };
}

async function json<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Smoke test: ${base}${keyless ? " (expecting a keyless deploy)" : ""}\n`);

  await check("GET /", () => page("/", /Arm.s Length|arm.s length/i));
  await check("GET /try", () => page("/try", /demo|Check mine/i));
  await check("GET /try/p2b", () => page("/try/p2b", /<h1|What others see|Step back/i));

  await check("GET /demo/p2b/bundle.json", async () => {
    const res = await get("/demo/p2b/bundle.json");
    const body = await json<{ version?: number; id?: string }>(res);
    return res.status === 200 && body?.id === "p2b"
      ? { ok: true, note: `bundle version ${body.version}` }
      : { ok: false, note: `HTTP ${res.status}; public/demo is not being served` };
  });

  await check("GET /api/youcam/status", async () => {
    const res = await get("/api/youcam/status");
    const body = await json<{ live?: boolean; reason?: string }>(res);
    if (res.status !== 200 || typeof body?.live !== "boolean") return { ok: false, note: `HTTP ${res.status}, unexpected body` };
    if (keyless && body.reason !== "replay_only") return { ok: false, note: `expected replay_only, got ${JSON.stringify(body)}` };
    return { ok: true, note: `live=${body.live}${body.reason ? ` reason=${body.reason}` : ""}` };
  });

  await check("GET /api/visibility", async () => {
    const res = await get("/api/visibility");
    const body = await json<{ name?: string; unitsSpent?: number }>(res);
    return res.status === 200 && body?.unitsSpent === 0
      ? { ok: true, note: "describes the request shape, unitsSpent 0" }
      : { ok: false, note: `HTTP ${res.status}` };
  });

  await check("POST /api/youcam/analysis (p2b)", async () => {
    const res = await post("/api/youcam/analysis", { persona: "p2b" });
    const text = await res.text();
    if (res.status !== 200) return { ok: false, note: `HTTP ${res.status}: ${text.slice(0, 160)}` };
    const body = JSON.parse(text) as { source?: string; unitsCharged?: number; fileRef?: string; masks?: Record<string, string> };
    if (body.source !== "replay" || body.unitsCharged !== 0) {
      return { ok: false, note: `expected a free replay, got source=${body.source} unitsCharged=${body.unitsCharged}` };
    }
    const masks = Object.keys(body.masks ?? {}).length;
    return masks > 0
      ? { ok: true, note: `replay, 0 units, ${masks} masks, ${(text.length / 1e6).toFixed(1)} MB` }
      : { ok: false, note: "replay answered with no masks (fixtures missing from the function bundle?)" };
  });

  await check("POST /api/youcam/simulate (p3a)", async () => {
    const res = await post("/api/youcam/simulate", { fileRef: "persona:p3a", strengths: { spots: 0.5 } });
    const body = await json<{ source?: string; unitsCharged?: number; image?: string }>(res);
    return res.status === 200 && body?.source === "replay" && body.unitsCharged === 0
      ? { ok: true, note: "recorded render served, 0 units" }
      : { ok: false, note: `HTTP ${res.status} (render fixtures missing from the function bundle?)` };
  });

  await check("unknown demo face: plain 404", async () => {
    const res = await post("/api/youcam/analysis", { persona: "nobody" });
    const text = await res.text();
    return res.status === 404 && !LEAKS.test(text)
      ? { ok: true, note: "HTTP 404, plain-language error" }
      : { ok: false, note: `HTTP ${res.status}: ${text.slice(0, 120)}` };
  });

  await check("an uploaded photo is refused", async () => {
    const res = await post("/api/youcam/analysis", { image: "data:image/png;base64,AAAA" });
    const body = await json<{ error?: { message?: string } }>(res);
    return res.status >= 400 && res.status < 500 && typeof body?.error?.message === "string"
      ? { ok: true, note: `HTTP ${res.status}: ${body.error.message}` }
      : { ok: false, note: `HTTP ${res.status}; an upload was answered (REPLAY_UPLOADS must be unset on a public deploy)` };
  });

  await check("live without a code is refused", async () => {
    const res = await post("/api/youcam/makeup", { fileRef: `live:1080x1341:${"F".repeat(64)}`, effects: [{ category: "foundation" }] });
    const body = await json<{ error?: { message?: string } }>(res);
    return res.status >= 400 && res.status < 500 && typeof body?.error?.message === "string"
      ? { ok: true, note: `HTTP ${res.status}: ${body.error.message}` }
      : { ok: false, note: `HTTP ${res.status}; a paid route answered without an access code` };
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

void main();
