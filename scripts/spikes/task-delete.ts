// Verifies YouCam's task-delete endpoint on ONE old task whose result is already stored locally.
// Free calls only: task status GETs, credit GETs and one delete POST. Never creates a task.
// Run: npx tsx --env-file=.env scripts/spikes/task-delete.ts            (deletes)
//      npx tsx --env-file=.env scripts/spikes/task-delete.ts --dry-run  (reads only)
// Schema (docs.perfectcorp.com/reference/task_management, not in our local OpenAPI copy): POST /s2s/v2.0/task/delete
// with {"task_id": "<id>"}; deletes the finished task plus its input files and generated outputs. The first run
// of this script used {"task_ids": [...]} (the old client guess) and got 400 InvalidParameters, so the default is now
// the documented shape. DELETE_VARIANT=task_ids reproduces the failing guess.
import fs from "node:fs";
import path from "node:path";
import JSONbig from "json-bigint";

const JB = JSONbig({ storeAsString: true });
const BASE = "https://yce-api-01.makeupar.com";
const ROOT = path.resolve(__dirname, "../..");
const STATE = path.join(ROOT, "internal/research/spike-data/state.json");
const TARGET = process.env.TARGET_TASK ?? "sa_sd_p2b";
const VARIANT = process.env.DELETE_VARIANT ?? "task_id";
// A second task that shares the same uploaded file_id: shows whether deleting one task breaks its siblings.
const SIBLING = process.env.SIBLING_TASK ?? "sa_hd_p2b";
const DRY = process.argv.includes("--dry-run");

const key = process.env.YOUCAM_API_KEY;
if (!key) throw new Error("YOUCAM_API_KEY is not set (run with --env-file=.env)");
const auth = { Authorization: `Bearer ${key}` };

type Json = Record<string, unknown>;

/** Keeps the shape and drops anything long: URLs and ids are replaced by their length. */
function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) return `<url len=${value.length}>`;
    return value.length > 40 ? `<str len=${value.length}>` : value;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, 2).map((v) => redact(v, depth + 1));
    return value.length > 2 ? [...head, `...+${value.length - 2} more`] : head;
  }
  if (value && typeof value === "object") {
    if (depth > 5) return "<deep>";
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, depth + 1)]));
  }
  return value;
}

async function call(method: "GET" | "POST", url: string, body?: unknown, jsonHeader = body !== undefined) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...auth, ...(jsonHeader ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JB.parse(text);
  } catch {
    /* non-JSON body; keep text */
  }
  return { status: res.status, json: json as Json | null, text };
}

async function credit() {
  const r = await call("GET", "/s2s/v1.0/client/credit");
  const tokens = Array.isArray(r.json?.results) ? (r.json!.results as Json[]) : [];
  const now = Date.now();
  let total = 0;
  for (const t of tokens) {
    const expiry = Number(t.expiry);
    if (Number.isFinite(expiry) && expiry > 0 && expiry < now) continue;
    const amount = Number(t.amount_dec ?? t.amount);
    if (Number.isFinite(amount)) total += amount;
  }
  return { http: r.status, total, tokens: tokens.map((t) => ({ amount: Number(t.amount_dec ?? t.amount), expiry: t.expiry })) };
}

async function history() {
  const r = await call("GET", "/s2s/v1.0/client/credit/history?page_size=5", undefined, true);
  const results = (r.json?.result ?? r.json?.results ?? {}) as Json;
  const items = Array.isArray(results.history) ? (results.history as Json[]) : [];
  return {
    http: r.status,
    newest: items.slice(0, 3).map((i) => ({ at: new Date(Number(i.timestamp)).toISOString(), action: i.action })),
  };
}

function firstMaskUrl(json: Json | null): string | null {
  const data = (json?.data ?? {}) as Json;
  const res = (data.results ?? {}) as Json;
  const out = Array.isArray(res.output) ? (res.output as Json[]) : [];
  for (const o of out) {
    const urls = o.mask_urls;
    if (Array.isArray(urls) && typeof urls[0] === "string") return urls[0];
  }
  return null;
}

async function probeUrl(url: string | null) {
  if (!url) return "no url";
  // Presigned GET: ask for a single byte, no credentials.
  const res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(30_000) });
  await res.arrayBuffer().catch(() => undefined);
  return `HTTP ${res.status}`;
}

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const task = state.tasks?.[TARGET];
  if (!task?.id || !task?.slug) throw new Error(`task ${TARGET} not found in state.json`);
  const id = String(task.id);
  const statusPath = `/s2s/${task.slug}/${id}`;
  console.log(`target: ${TARGET}  slug: ${task.slug}  id: ${id.slice(0, 8)}... (len ${id.length})  mode: ${DRY ? "dry-run" : "delete"}`);

  const creditBefore = await credit();
  const historyBefore = await history();
  console.log("credit before:", JSON.stringify(creditBefore));
  console.log("history before:", JSON.stringify(historyBefore));

  const before = await call("GET", statusPath);
  console.log(`status before: HTTP ${before.status}`, JSON.stringify(redact(before.json ?? before.text)));
  const maskUrl = firstMaskUrl(before.json);
  console.log("result url probe before:", await probeUrl(maskUrl));

  const sib = state.tasks?.[SIBLING];
  const sibPath = sib?.id ? `/s2s/${sib.slug}/${sib.id}` : null;
  let sibMask: string | null = null;
  if (sibPath) {
    const r = await call("GET", sibPath);
    sibMask = firstMaskUrl(r.json);
    console.log(`sibling ${SIBLING} before: HTTP ${r.status} task_status=${(r.json?.data as Json | undefined)?.task_status}; mask probe: ${await probeUrl(sibMask)}`);
  }

  if (DRY) return;

  const bodies: Record<string, unknown> = {
    task_ids: { task_ids: [id] },
    task_id: { task_id: id },
  };
  const body = bodies[VARIANT];
  if (!body) throw new Error(`unknown DELETE_VARIANT ${VARIANT}`);
  const t0 = Date.now();
  const del = await call("POST", "/s2s/v2.0/task/delete", body);
  console.log(`delete [${VARIANT}]: HTTP ${del.status} in ${Date.now() - t0} ms; body: ${del.text.slice(0, 400)}`);

  for (const waitMs of [0, 3000]) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    const after = await call("GET", statusPath);
    console.log(`status after (+${waitMs} ms): HTTP ${after.status}`, JSON.stringify(redact(after.json ?? after.text)));
  }
  console.log("result url probe after:", await probeUrl(maskUrl));
  if (sibPath) {
    const r = await call("GET", sibPath);
    console.log(`sibling ${SIBLING} after: HTTP ${r.status} task_status=${(r.json?.data as Json | undefined)?.task_status}; mask probe: ${await probeUrl(sibMask)}`);
  }

  const creditAfter = await credit();
  const historyAfter = await history();
  console.log("credit after:", JSON.stringify(creditAfter));
  console.log("history after:", JSON.stringify(historyAfter));
  console.log(`credit delta: ${creditAfter.total - creditBefore.total}`);
}

main().catch((error) => {
  console.error("failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
