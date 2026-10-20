/* eslint-disable @typescript-eslint/no-explicit-any -- YouCam replies are untyped JSON; this script is a recorder, not shipped code */
/**
 * Records everything the three demo personas need from the live YouCam API (p1a HD analysis, foundation coverage
 * grid, skin-simulation what-ifs), so the app can replay them with no live calls. Paid on success.
 *
 *   npx tsx --env-file=.env scripts/personas/record.ts --plan              # free: list the requests and units
 *   npx tsx --env-file=.env scripts/personas/record.ts --only p1a_hd       # submit + poll + download these labels
 *   npx tsx --env-file=.env scripts/personas/record.ts                     # every planned label not yet recorded
 *   npx tsx --env-file=.env scripts/personas/record.ts --credit            # free: balance + history cross-check
 *   npx tsx --env-file=.env scripts/personas/record.ts --recover           # free: match an unconfirmed submit to history
 *
 * Idempotent, same pattern as scripts/spikes/youcam-spike.ts: each task id goes into scripts/personas/state.json before
 * polling, and a recorded label is never submitted again. A task-submit POST is never retried, except on 429 (the
 * request was rejected). A lost response (network error, 5xx, timeout) may still have been charged: the script stops,
 * and --recover finds the task in credit/history instead of paying again. Hard ceiling: 40 units for the whole job.
 * The API key is never printed.
 */
import fs from "node:fs";
import path from "node:path";
import JSONbig from "json-bigint";
import { CEILING_UNITS, FIXTURES, STATE, WORK, buildPlan, type PlanItem } from "./common";

const HOST = "https://yce-api-01.makeupar.com";
const KEY = process.env.YOUCAM_API_KEY;
const JSONB = JSONbig({ storeAsString: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TaskRec {
  slug: string;
  id: string;
  units: number;
  action: string;
  done?: boolean;
  failed?: boolean;
}
interface State {
  startedAt?: number;
  balanceStart?: number;
  files: Record<string, string>;
  tasks: Record<string, TaskRec>;
  /** A submit whose outcome is unknown. Nothing is submitted while this is set. */
  pending?: { label: string; action: string; at: number };
}

const readState = (): State =>
  fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { files: {}, tasks: {} };
const saveState = (s: State) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
const writeWork = (rel: string, data: unknown) => {
  const file = path.join(WORK, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" || data instanceof Uint8Array ? data : JSON.stringify(data, null, 2));
};

class Ambiguous extends Error {}

type Reply = { status: number; json: any; headers: Headers };

async function api(method: "GET" | "POST", urlPath: string, body?: unknown): Promise<Reply> {
  if (!KEY) throw new Error("YOUCAM_API_KEY missing (run with --env-file=.env)");
  const isPost = method === "POST" && body !== undefined && urlPath.includes("/task/");
  const attempts = isPost ? 4 : method === "GET" ? 4 : 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(HOST + urlPath, {
        method,
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      // A task submit that may have reached the server must not be repeated: it could be charged twice.
      if (isPost) throw new Ambiguous(`submit outcome unknown: ${(e as Error).message}`);
      if (attempt === attempts - 1) throw e;
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (res.status === 429 && attempt < attempts - 1) {
      await res.arrayBuffer().catch(() => undefined);
      await sleep((Number(res.headers.get("retry-after")) || 5 * (attempt + 1)) * 1000);
      continue;
    }
    if (isPost && res.status >= 500) throw new Ambiguous(`submit answered HTTP ${res.status}`);
    if (!isPost && res.status >= 500 && attempt < attempts - 1) {
      await res.arrayBuffer().catch(() => undefined);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    let json: any;
    try {
      json = JSONB.parse(text);
    } catch {
      json = { nonJson: text.slice(0, 300) };
    }
    return { status: res.status, json, headers: res.headers };
  }
  throw new Error("unreachable");
}

// ---------------- upload (free) ----------------
async function ensureFile(st: State, persona: string): Promise<string> {
  if (st.files[persona]) return st.files[persona];
  const file = path.join(FIXTURES, persona, "input.jpg");
  const buf = fs.readFileSync(file);
  const r = await api("POST", "/s2s/v2.0/file", {
    files: [{ content_type: "image/jpeg", file_name: `${persona}.jpg`, file_size: buf.length }],
  });
  const f = r.json?.data?.files?.[0];
  if (r.status !== 200 || !f?.file_id) throw new Error(`upload ${persona} failed: HTTP ${r.status}`);
  const req = f.requests[0];
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) if (k.toLowerCase() !== "content-length") headers[k] = String(v);
  let put: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      put = await fetch(req.url, { method: req.method ?? "PUT", headers, body: buf });
      if (put.ok) break;
    } catch {
      /* the PUT is idempotent and free */
    }
    await sleep(1500);
  }
  if (!put?.ok) throw new Error(`PUT ${persona} failed`);
  st.files[persona] = String(f.file_id);
  saveState(st);
  console.log(`  uploaded ${persona} (${buf.length} bytes)`);
  return st.files[persona];
}

// ---------------- credit and history (free) ----------------
async function balance(): Promise<number> {
  const r = await api("GET", "/s2s/v1.0/client/credit");
  if (r.status !== 200) throw new Error(`credit: HTTP ${r.status}`);
  const now = Date.now();
  return (r.json?.results ?? [])
    .filter((x: any) => !(Number(x.expiry) > 0 && Number(x.expiry) < now))
    .reduce((s: number, x: any) => s + Number(x.amount_dec ?? x.amount ?? 0), 0);
}

async function historyRows(): Promise<any[]> {
  const r = await api("GET", "/s2s/v1.0/client/credit/history?page_size=30");
  if (r.status !== 200) throw new Error(`credit/history: HTTP ${r.status}`);
  return r.json?.result?.history ?? [];
}
const charged = (row: any) =>
  Math.abs((row.info?.credits ?? []).reduce((s: number, c: any) => s + Number(c.amount_dec ?? c.amount ?? 0), 0));

/** Charged rows for `action` since `since` whose task id is in no state file entry: candidates for a lost submit response. */
async function orphans(action: string, since: number, st: State) {
  const known = Object.values(st.tasks).map((t) => t.id);
  return (await historyRows())
    .filter((x) => x.action === action && Number(x.timestamp) >= since)
    .map((x) => ({ taskId: String(x.target_id).split(":")[0], ts: Number(x.timestamp), units: charged(x) }))
    .filter((x) => !known.includes(x.taskId));
}

async function recover(): Promise<boolean> {
  const st = readState();
  if (!st.pending) {
    console.log("nothing pending");
    return true;
  }
  const { label, action, at } = st.pending;
  const plan = buildPlan()[label];
  for (let i = 0; i < 3; i++) {
    const found = await orphans(action, at - 5_000, st);
    if (found.length === 1) {
      st.tasks[label] = { slug: plan.slug, id: found[0].taskId, units: plan.units, action };
      delete st.pending;
      saveState(st);
      console.log(`  ${label}: recovered task ${found[0].taskId.slice(0, 8)}... (${found[0].units} unit(s), ${new Date(found[0].ts).toISOString()})`);
      return true;
    }
    if (found.length > 1) throw new Error(`${found.length} unmatched ${action} charges since the unconfirmed submit; resolve by hand`);
    await sleep(4000); // the charge row can lag the submit
  }
  console.log(`  ${label}: no charge in history after 3 checks. If you are sure the submit was rejected, re-run with --clear-pending.`);
  return false;
}

// ---------------- submit / poll / download ----------------
async function submit(label: string, item: PlanItem): Promise<void> {
  let st = readState();
  if (st.tasks[label]) return; // never pay twice
  if (st.pending) throw new Error(`unconfirmed submit for ${st.pending.label}: run --recover first`);
  const spent = Object.values(st.tasks).reduce((s, t) => s + t.units, 0);
  if (spent + item.units > CEILING_UNITS) throw new Error(`budget guard: ${spent} + ${item.units} units would pass the ${CEILING_UNITS} ceiling`);
  const fileId = await ensureFile(st, item.persona);
  const body = { src_file_id: fileId, ...item.body };
  st = readState();
  st.startedAt ??= Date.now();
  st.pending = { label, action: item.action, at: Date.now() };
  saveState(st);
  let r: Reply;
  try {
    r = await api("POST", `/s2s/${item.slug}`, body);
  } catch (e) {
    if (e instanceof Ambiguous) {
      writeWork(`${label}/submit.json`, { request: item.body, response: String(e.message) });
      console.log(`  ! ${label}: ${e.message}. Not resubmitting; run --recover.`);
    }
    throw e;
  }
  writeWork(`${label}/submit.json`, { request: item.body, response: r.json });
  const id = r.json?.data?.task_id;
  st = readState();
  if (r.status === 200 && id) {
    st.tasks[label] = { slug: item.slug, id: String(id), units: item.units, action: item.action };
    delete st.pending; // task id is recorded BEFORE polling
    saveState(st);
    console.log(`  submitted ${label} (${item.units} unit(s))`);
    return;
  }
  delete st.pending; // a definite rejection creates no task
  saveState(st);
  throw new Error(`${label}: submit rejected, HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
}

async function poll(label: string): Promise<any> {
  const t = readState().tasks[label];
  const started = Date.now();
  await sleep(1000);
  for (;;) {
    const r = await api("GET", `/s2s/${t.slug}/${t.id}`);
    const status = r.json?.data?.task_status;
    if (status === "success" || status === "error" || r.status !== 200) {
      writeWork(`${label}/result.json`, { status: r.status, json: r.json });
      const st = readState();
      st.tasks[label].done = true;
      if (status !== "success") st.tasks[label].failed = true;
      saveState(st);
      console.log(`  ${label}: ${status ?? `HTTP ${r.status}`} after ${((Date.now() - started) / 1000).toFixed(1)}s`);
      if (status !== "success") throw new Error(`${label} did not succeed: ${JSON.stringify(r.json).slice(0, 300)}`);
      return r.json;
    }
    if (Date.now() - started > 4 * 60_000) throw new Error(`${label} still running after 4 min`);
    await sleep(1500);
  }
}

const sniff = (b: Uint8Array) =>
  b[0] === 0x89 && b[1] === 0x50 ? "png" : b[0] === 0xff && b[1] === 0xd8 ? "jpg" : "bin";

async function fetchBytes(url: string): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }); // presigned: no Authorization header
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
}

async function download(label: string, json: any): Promise<void> {
  const results = json?.data?.results ?? {};
  if (typeof results.url === "string") {
    const bytes = await fetchBytes(results.url);
    writeWork(`${label}/result.${sniff(bytes)}`, bytes);
    console.log(`  ${label}: render ${bytes.length} bytes (${sniff(bytes)})`);
    return;
  }
  let n = 0;
  for (const o of results.output ?? []) {
    for (const url of o.mask_urls ?? []) {
      const bytes = await fetchBytes(url);
      const name = o.type === "resize_image" ? "resize_image" : `${o.type}${o.region ? "_" + o.region : ""}`;
      writeWork(`${label}/files/${name}.${sniff(bytes)}`, bytes);
      n++;
    }
  }
  console.log(`  ${label}: ${n} files downloaded`);
}

// ---------------- cross-check ----------------
async function crossCheck(): Promise<void> {
  const st = readState();
  const rows = await historyRows();
  let sum = 0;
  const out: Record<string, unknown> = {};
  for (const [label, t] of Object.entries(st.tasks)) {
    const hit = rows.find((x) => String(x.target_id).startsWith(t.id));
    const units = hit ? charged(hit) : null;
    if (units) sum += units;
    out[label] = { action: hit?.action ?? null, units, at: hit ? new Date(Number(hit.timestamp)).toISOString() : null };
    console.log(`  ${label.padEnd(26)} ${hit ? `${hit.action} ${units} unit(s) ${new Date(Number(hit.timestamp)).toISOString()}` : "not in the latest 30 history rows"}`);
  }
  const bal = await balance();
  console.log(`  history rows sum to ${sum} units for ${Object.keys(st.tasks).length} recorded tasks; planned ${Object.values(st.tasks).reduce((s, t) => s + t.units, 0)}`);
  console.log(`  balance now ${bal}${st.balanceStart !== undefined ? ` (start of job ${st.balanceStart}, drop ${st.balanceStart - bal})` : ""}`);
  writeWork("ledger-check.json", { balance: bal, balanceStart: st.balanceStart, historySum: sum, tasks: out });
}

// ---------------- main ----------------
async function main() {
  const args = process.argv.slice(2);
  const plan = buildPlan();
  if (args.includes("--plan")) {
    let total = 0;
    for (const [label, p] of Object.entries(plan)) {
      const done = readState().tasks[label] ? " [recorded]" : "";
      console.log(`${label.padEnd(26)} ${String(p.units).padStart(2)} unit(s)  ${p.slug}  ${JSON.stringify(p.body).slice(0, 150)}${done}`);
      total += p.units;
    }
    console.log(`total planned ${total} units (ceiling ${CEILING_UNITS})`);
    return;
  }
  if (args.includes("--credit")) {
    console.log(`balance ${await balance()}`);
    await crossCheck();
    return;
  }
  if (args.includes("--clear-pending")) {
    const st = readState();
    delete st.pending;
    saveState(st);
    console.log("pending cleared");
    return;
  }
  if (args.includes("--recover")) {
    await recover();
    return;
  }

  const onlyIdx = args.indexOf("--only");
  const labels = onlyIdx >= 0 ? args[onlyIdx + 1].split(",") : Object.keys(plan);
  for (const l of labels) if (!plan[l]) throw new Error(`unknown or not-yet-plannable label ${l} (a foundation label needs its persona shade in shades.json)`);

  let st = readState();
  if (st.pending && !(await recover())) process.exit(1);
  st = readState();
  const have = Object.values(st.tasks).reduce((s, t) => s + t.units, 0);
  const todo = labels.filter((l) => !st.tasks[l]);
  const add = todo.reduce((s, l) => s + plan[l].units, 0);
  console.log(`labels: ${labels.join(", ")}\n  recorded so far ${have} units, this run adds ${add}, ceiling ${CEILING_UNITS}`);
  if (have + add > CEILING_UNITS) throw new Error("would exceed the unit ceiling");

  const before = await balance();
  if (st.balanceStart === undefined) {
    st.balanceStart = before;
    saveState(st);
  }
  console.log(`  balance ${before}`);

  for (const label of labels) {
    const item = plan[label];
    if (!readState().tasks[label]) await submit(label, item);
    const resultFile = path.join(WORK, label, "result.json");
    let json: any;
    if (fs.existsSync(resultFile)) json = JSONB.parse(fs.readFileSync(resultFile, "utf8")).json;
    else json = await poll(label);
    if (json?.data?.task_status !== "success") throw new Error(`${label}: recorded result is not a success`);
    {
      const marker = path.join(WORK, label, "downloaded");
      if (!fs.existsSync(marker)) {
        await download(label, json);
        fs.writeFileSync(marker, new Date().toISOString());
      }
    }
    const now = await balance();
    const start = readState().balanceStart!;
    console.log(`  balance ${now} (drop since the job started: ${start - now})`);
    if (start - now > CEILING_UNITS) throw new Error("balance dropped past the ceiling: stopping");
  }
  console.log("cross-check against credit history:");
  await crossCheck();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
