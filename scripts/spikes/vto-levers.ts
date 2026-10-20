/**
 * Phase 0 follow-up: which Makeup VTO parameters move (a) dark-circle contrast and (b) age-spot / acne contrast?
 *
 * Run (paid on success, 1 unit per render, hard ceiling 8 units for the whole follow-up):
 *   npx tsx --env-file=.env scripts/spikes/vto-levers.ts                 # core set (7 renders), then analysis
 *   npx tsx --env-file=.env scripts/spikes/vto-levers.ts --only lv_base_s0,lv_conc_ue10
 *   npx tsx --env-file=.env scripts/spikes/vto-levers.ts --analyze      # free: no submits, analysis only
 *   npx tsx --env-file=.env scripts/spikes/vto-levers.ts --credit       # free: balance + history cross-check
 *
 * Idempotent, same pattern as youcam-spike.ts: each task id is written to state.json before polling, and a re-run polls
 * the recorded task instead of creating (and paying for) a new one. state.json is only ever modified in place (never deleted).
 * All outputs go to internal/research/spike-data/ (gitignored). The API key is never printed.
 */
import fs from "node:fs";
import path from "node:path";
import JSONbig from "json-bigint";
import sharp from "sharp";
import { ROOT, p, load, lumY, lab, components, stats, writeJson, Img } from "./lib";
import { registerPair } from "./register";

const HOST = "https://yce-api-01.makeupar.com";
const KEY = process.env.YOUCAM_API_KEY;
const STATE = p("state.json");
const JSONB = JSONbig({ storeAsString: true });
const HARD_CEILING_UNITS = 8; // approved by integrator 2026-10-20, from the Reserve
const UNITS_PER_RENDER = 1;
const INPUT = p("inputs/p2b_hd.jpg");
const FOLLOWUP_START_MS = Date.parse("2026-10-20T10:40:00Z"); // first lv_ submit was at 10:42:48Z; the first spike ended 10:06:18Z

type State = { files: Record<string, string>; tasks: Record<string, { slug: string; id: string; done?: boolean; failed?: boolean }> };
const readState = (): State => JSON.parse(fs.readFileSync(STATE, "utf8"));
const saveState = (s: State) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
const write = (name: string, data: unknown) => fs.writeFileSync(p(name), typeof data === "string" ? data : JSON.stringify(data, null, 2));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, urlPath: string, body?: unknown) {
  if (!KEY) throw new Error("YOUCAM_API_KEY missing (run with --env-file=.env)");
  // GETs are retried on network errors. POSTs never are: a connection reset after the server accepted a submit still charges.
  let res: Response | undefined;
  for (let attempt = 0; attempt < (method === "GET" ? 4 : 1); attempt++) {
    try {
      res = await fetch(HOST + urlPath, {
        method,
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (e) {
      if (method !== "GET" || attempt === 3) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  const text = await res!.text();
  let json: any;
  try { json = JSONB.parse(text); } catch { json = { nonJson: text.slice(0, 500) }; }
  return { status: res!.status, json };
}

// ---------------- render plan ----------------
const SHADE: string = JSON.parse(fs.readFileSync(p("p2b_shade.json"), "utf8")).shade; // "#8a5840", same shade as the first spike
const SMOOTH0 = { category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 };
const conc = (ci: number, ue: number, cov: number) => ({ category: "concealer", palettes: [{ color: SHADE, colorIntensity: ci, colorUnderEyeIntensity: ue, coverageLevel: cov }] });
const found = (cov: number) => ({ category: "foundation", palettes: [{ color: SHADE, colorIntensity: 50, glowIntensity: 0, coverageIntensity: cov }] });

/** label -> { effects, desc }. Every render sends skin_smooth 0/0 first. */
export const PLAN: Record<string, { effects: unknown[]; desc: string; core: boolean }> = {
  lv_base_s0: { effects: [SMOOTH0], desc: "skin_smooth 0/0 only (no makeup)", core: true },
  lv_conc_ue10: { effects: [SMOOTH0, conc(50, 10, 50)], desc: "concealer ci50 ue10 cov50", core: true },
  lv_conc_ue90: { effects: [SMOOTH0, conc(50, 90, 50)], desc: "concealer ci50 ue90 cov50", core: true },
  lv_conc_ci90: { effects: [SMOOTH0, conc(90, 50, 50)], desc: "concealer ci90 ue50 cov50", core: true },
  lv_found_c100: { effects: [SMOOTH0, found(100)], desc: "foundation cov100 ci50 glow0", core: true },
  lv_found_c50: { effects: [SMOOTH0, found(50)], desc: "foundation cov50 ci50 glow0", core: true },
  lv_conc_mid: { effects: [SMOOTH0, conc(50, 50, 50)], desc: "concealer ci50 ue50 cov50 (centre point)", core: true },
  // spare (8th and last unit): same concealer as lv_conc_mid / mu_conc50_p2b but with skin_smooth 100/100, giving a 3-point smoothing series (0 / default 50 / 100)
  lv_conc_mid_s100: { effects: [{ category: "skin_smooth", skinSmoothStrength: 100, skinSmoothColorIntensity: 100 }, conc(50, 50, 50)], desc: "concealer ci50 ue50 cov50 + skin_smooth 100/100", core: false },
};

// ---------------- upload (free) ----------------
async function ensureFile(st: State, label: string, file: string, force = false) {
  if (st.files[label] && !force) return st.files[label];
  const buf = fs.readFileSync(file);
  const r = await api("POST", "/s2s/v2.0/file", { files: [{ content_type: "image/jpeg", file_name: path.basename(file), file_size: buf.length }] });
  const f = r.json?.data?.files?.[0];
  if (r.status !== 200 || !f?.file_id) throw new Error(`upload ${label} failed: ${JSON.stringify(r).slice(0, 300)}`);
  const req = f.requests[0];
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) if (k.toLowerCase() !== "content-length") headers[k] = String(v);
  const put = await fetch(req.url, { method: req.method ?? "PUT", headers, body: buf });
  if (!put.ok) throw new Error(`PUT ${label} failed: ${put.status}`);
  st.files[label] = f.file_id;
  saveState(st);
  return f.file_id as string;
}

// ---------------- submit / poll / download ----------------
async function submit(label: string) {
  let st = readState();
  if (st.tasks[label]) return; // already created: never pay twice
  const used = Object.keys(st.tasks).filter((k) => k.startsWith("lv_")).length;
  if ((used + 1) * UNITS_PER_RENDER > HARD_CEILING_UNITS) throw new Error(`budget guard: ${used} lv_ renders already created, ceiling ${HARD_CEILING_UNITS} units`);
  const plan = PLAN[label];
  if (!plan) throw new Error(`unknown label ${label}`);
  // reuse the already-uploaded p2b file (state.files.p2b); a re-upload (if it expired) goes to files.p2b_lv
  let fileKey = st.files.p2b_lv ? "p2b_lv" : "p2b";
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = { src_file_id: st.files[fileKey], version: "1.0", effects: plan.effects };
    let r: Awaited<ReturnType<typeof api>>;
    try {
      r = await api("POST", "/s2s/v2.0/task/makeup-vto", body);
    } catch (e) {
      console.log(`  ! ${label}: network error during submit (${(e as Error).message}); the server may have accepted it. Recovering from credit history (free).`);
      write(`submit_${label}.json`, { request: body, response: "network error: no response received" });
      await sleep(3000);
      await recoverFromHistory(label);
      return;
    }
    write(`submit_${label}.json`, { request: body, response: r });
    const id = r.json?.data?.task_id;
    if (r.status === 200 && id) {
      st = readState();
      st.tasks[label] = { slug: "v2.0/task/makeup-vto", id: String(id) };
      saveState(st); // task id recorded BEFORE polling
      console.log(`  submitted ${label} (${plan.desc}): task ${String(id).slice(0, 10)}...`);
      return;
    }
    const msg = JSON.stringify(r.json).slice(0, 300);
    console.log(`  ! ${label}: submit failed (${r.status}) ${msg}`);
    if (attempt === 0 && /file/i.test(msg)) {
      console.log("  file error: re-uploading p2b (free) and retrying once");
      st = readState();
      await ensureFile(st, "p2b_lv", INPUT, true);
      fileKey = "p2b_lv";
      continue;
    }
    return;
  }
}

async function poll(label: string) {
  const st0 = readState();
  const t = st0.tasks[label];
  if (!t) return null;
  const started = Date.now();
  for (;;) {
    const r = await api("GET", `/s2s/${t.slug}/${t.id}`);
    const status = r.json?.data?.task_status;
    if (status === "success" || status === "error" || r.status !== 200) {
      write(`result_${label}.json`, r);
      const st = readState();
      st.tasks[label].done = true;
      if (status !== "success") st.tasks[label].failed = true;
      saveState(st);
      console.log(`  ${label}: ${status ?? r.status} after ${((Date.now() - started) / 1000).toFixed(1)}s of polling`);
      return r.json;
    }
    if (Date.now() - started > 4 * 60_000) throw new Error(`${label} still running after 4 min`);
    await sleep(2000);
  }
}

async function download(label: string, json: any) {
  const url = json?.data?.results?.url;
  if (!url) return null;
  const dir = p(label);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).find((f) => f.startsWith("result."));
  if (existing) return path.join(dir, existing);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const ext = buf[0] === 0x89 && buf[1] === 0x50 ? "png" : buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : "bin"; // sniff, do not trust the URL
  const dest = path.join(dir, `result.${ext}`);
  fs.writeFileSync(dest, buf);
  return dest;
}

// ---------------- free cross-check ----------------
async function credit(tag: string) {
  const r = await api("GET", "/s2s/v1.0/client/credit");
  write(`credit_levers_${tag}.json`, r);
  const bal = (r.json?.results ?? []).reduce((s: number, x: any) => s + Number(x.amount_dec ?? x.amount ?? 0), 0);
  console.log(`  balance (${tag}): ${bal} units (HTTP ${r.status})`);
  return bal;
}
/** makeup-vto charges since the follow-up started whose task id is not in state.json (history target_id is "<task_id>:<suffix>") */
async function orphanCharges() {
  const r = await api("GET", "/s2s/v1.0/client/credit/history?page_size=30");
  const items: any[] = r.json?.result?.history ?? [];
  const known = Object.values(readState().tasks).map((t) => t.id);
  return items
    .filter((x) => x.action === "api_makeup_vto" && Number(x.timestamp) >= FOLLOWUP_START_MS)
    .map((x) => ({ taskId: String(x.target_id).split(":")[0], ts: new Date(Number(x.timestamp)).toISOString() }))
    .filter((x) => !known.includes(x.taskId));
}
async function recoverFromHistory(label: string) {
  if (readState().tasks[label]) { console.log(`  ${label}: already recorded in state.json`); return; }
  const orphans = await orphanCharges();
  if (orphans.length === 0) { console.log(`  ${label}: no orphan charge in history, so the submit was not accepted; safe to re-run`); return; }
  if (orphans.length > 1) throw new Error(`${orphans.length} orphan charges in history; resolve manually before any further submit`);
  const st = readState();
  st.tasks[label] = { slug: "v2.0/task/makeup-vto", id: orphans[0].taskId };
  saveState(st);
  console.log(`  ${label}: recovered task ${orphans[0].taskId.slice(0, 10)}... (charged ${orphans[0].ts}) and recorded it in state.json`);
}

async function history() {
  const r = await api("GET", "/s2s/v1.0/client/credit/history?page_size=30");
  write("credit_history_levers.json", r);
  const items: any[] = r.json?.result?.history ?? [];
  const charge = (x: any) => Math.abs((x.info?.credits ?? []).reduce((s: number, c: any) => s + Number(c.amount_dec ?? c.amount ?? 0), 0));
  const mine = Object.entries(readState().tasks).filter(([k]) => k.startsWith("lv_"));
  let sum = 0;
  for (const [k, t] of mine) {
    const hit = items.find((x) => String(x.target_id).startsWith(t.id));
    console.log(`  ${k.padEnd(14)} charge: ${hit ? `${hit.action} ${charge(hit)} unit(s) at ${new Date(Number(hit.timestamp)).toISOString()}` : "not in first 30 history rows"}`);
    if (hit) sum += charge(hit);
  }
  console.log(`  history rows for lv_ tasks sum to ${sum} units (${mine.length} tasks recorded)`);
}

// ---------------- analysis (free, local) ----------------
type Sampler = (x: number, y: number) => readonly [number, number, number] | null;
const sampler = (im: Img, dx: number, dy: number): Sampler => (x, y) => {
  const xx = x + dx, yy = y + dy;
  if (xx < 0 || yy < 0 || xx >= im.w || yy >= im.h) return null;
  const o = (yy * im.w + xx) * im.ch;
  return [im.data[o], im.data[o + 1], im.data[o + 2]] as const;
};
const meanLum = (S: Sampler, idx: number[], W: number, wts?: number[]) => {
  let s = 0, w = 0;
  for (let k = 0; k < idx.length; k++) {
    const c = S(idx[k] % W, (idx[k] / W) | 0);
    if (!c) continue;
    const wt = wts ? wts[k] : 1;
    s += wt * lumY(c[0], c[1], c[2]); w += wt;
  }
  return w ? s / w : NaN;
};
const meanLab = (S: Sampler, idx: number[], W: number) => {
  let L = 0, a = 0, b = 0, n = 0;
  for (const i of idx) { const c = S(i % W, (i / W) | 0); if (!c) continue; const l = lab(c[0], c[1], c[2]); L += l[0]; a += l[1]; b += l[2]; n++; }
  return [L / n, a / n, b / n];
};
const med = (a: number[]) => (stats(a) as any).median as number;
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const r4 = (v: number) => +v.toFixed(4);

async function alphaPlane(file: string, W: number, H: number) {
  const m = await load(p(file), true);
  if (m.w !== W || m.h !== H) throw new Error(`mask ${file} is ${m.w}x${m.h}`);
  const A = new Uint8Array(W * H);
  for (let i = 0; i < A.length; i++) A[i] = m.data[i * 4 + 3];
  return A;
}

async function analyze() {
  const st = readState();
  const inp = await load(INPUT);
  const W = inp.w, H = inp.h;
  const dc = await alphaPlane("sa_hd_p2b/hd_dark_circle.png", W, H);
  const eb = await alphaPlane("sa_hd_p2b/hd_eye_bag.png", W, H);
  const pore = await alphaPlane("sa_hd_p2b/hd_pore_whole.png", W, H);
  const spot = await alphaPlane("sa_hd_p2b/hd_age_spot.png", W, H);
  const acne = await alphaPlane("sa_hd_p2b/hd_acne_whole.png", W, H);
  const tex = await alphaPlane("sa_hd_p2b/hd_texture_whole.png", W, H);

  // exclusion map (marks dilated 4 px), as in analyze-vto.ts
  const excl = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (dc[i] > 0 || eb[i] > 0 || spot[i] !== 51 || acne[i] !== 92 || pore[i] !== 102)
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) excl[yy * W + xx] = 1; }
  }
  const rect = (x0: number, y0: number, x1: number, y1: number) => { const a: number[] = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!excl[y * W + x]) a.push(y * W + x); return a; };

  // dark-circle regions: two largest crescents, core = alpha >= 64, reference band 25..95 px below the crescent (inner 60% of x range)
  const dcc = components(W, H, (i) => dc[i] > 0);
  const big = dcc.comps.map((c, k) => ({ c, id: k + 1 })).sort((a, b) => b.c.area - a.c.area).slice(0, 2);
  const sides = big.map((b) => {
    const core: number[] = [], all: number[] = [], aw: number[] = [];
    for (let i = 0; i < W * H; i++) if (dcc.label[i] === b.id) { all.push(i); aw.push(dc[i] / 255); if (dc[i] >= 64) core.push(i); }
    const bw = b.c.x1 - b.c.x0;
    const band = rect(Math.round(b.c.x0 + 0.2 * bw), b.c.y1 + 25, Math.round(b.c.x1 - 0.2 * bw), b.c.y1 + 95);
    // lower part of the core (below the crescent centroid): the under-eye zone a concealer targets, without the upper lid
    const lower = core.filter((i) => ((i / W) | 0) > b.c.cy + 5);
    return { name: b.c.cx < W / 2 ? "L" : "R", core, all, aw, band, lower };
  });
  const cheeks = rect(270, 800, 370, 880).concat(rect(760, 790, 860, 870));
  const bgIdx = Array.from({ length: 100 * 100 }, (_, k) => (20 + ((k / 100) | 0)) * W + 20 + (k % 100));
  const skinWin: number[] = [];
  for (let i = 0; i < W * H; i += 3) if (tex[i] === 0 && !excl[i]) skinWin.push(i);

  // feature families (same definitions as analyze-vto.ts)
  const ringFor = (lbl: Int32Array, id: number, c: { x0: number; y0: number; x1: number; y1: number }) => {
    const r: number[] = [], f: number[] = [];
    const x0 = Math.max(0, c.x0 - 10), x1 = Math.min(W - 1, c.x1 + 10), y0 = Math.max(0, c.y0 - 10), y1 = Math.min(H - 1, c.y1 + 10);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (lbl[i] === id) { f.push(i); continue; }
      if (excl[i]) continue;
      const near = Math.max(c.x0 - x, 0, x - c.x1, c.y0 - y, 0, y - c.y1);
      if (near >= 3 && near <= 10) r.push(i);
    }
    return { f, r };
  };
  type Fe = { f: number[]; r: number[]; interior?: number[] };
  const fam: Record<string, Fe[]> = { age_spot: [], acne: [], pore: [] };
  const addFam = (key: string, cc: ReturnType<typeof components>, maxF = 1e9, interiorOf?: (i: number) => boolean) =>
    cc.comps.forEach((c, k) => {
      const { f, r } = ringFor(cc.label, k + 1, c);
      if (f.length >= 20 && r.length >= 30 && f.length < maxF) fam[key].push({ f, r, interior: interiorOf ? f.filter(interiorOf) : undefined });
    });
  addFam("age_spot", components(W, H, (i) => spot[i] !== 51));
  addFam("acne", components(W, H, (i) => acne[i] !== 92), 1e9, (i) => acne[i] === 0);
  addFam("pore", components(W, H, (i) => pore[i] > 128), 150);
  fam.acne = fam.acne.filter((e) => (e.interior?.length ?? 0) >= 10);
  const famN = Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, v.length]));
  console.log("feature counts", JSON.stringify(famN));

  // renders to measure: the input, the original five (smoothing 50) and every lv_ render
  const entries: { label: string; file: string; desc: string }[] = [{ label: "input", file: INPUT, desc: "input p2b" }];
  const old: Record<string, string> = { mu_conc20_p2b: "old: concealer cov20 (smooth 50)", mu_conc50_p2b: "old: concealer cov50 (smooth default 50)", mu_conc90_p2b: "old: concealer cov90 (smooth 50)", mu_found30_p2b: "old: foundation cov30 (smooth 50)", mu_found80_p2b: "old: foundation cov80 (smooth 50)" };
  for (const [k, d] of Object.entries(old)) { const f = findResult(k); if (f) entries.push({ label: k, file: f, desc: d }); }
  for (const k of Object.keys(PLAN)) { const f = findResult(k); if (f) entries.push({ label: k, file: f, desc: PLAN[k].desc }); }

  const out: any = { sidesPx: sides.map((s) => ({ side: s.name, core: s.core.length, lower: s.lower.length, band: s.band.length })), refPx: { cheeks: cheeks.length, bg: bgIdx.length, skinWin: skinWin.length }, famN, renders: {} };
  const imgs: Record<string, Img> = {};
  const shifts: Record<string, { dx: number; dy: number }> = { input: { dx: 0, dy: 0 } };
  const comp: Record<string, Record<string, number[]>> = {}; // per-render per-family per-component weber (for strongest-10)

  for (const e of entries) {
    const im = e.label === "input" ? inp : await load(e.file);
    imgs[e.label] = im;
    let reg: any = null;
    if (e.label !== "input") {
      reg = (await registerPair(INPUT, e.file, e.label)).summary;
      const dx = Math.round(reg.dx_mean), dy = Math.round(reg.dy_mean);
      shifts[e.label] = { dx, dy };
    }
    const sh = shifts[e.label];
    const S = sampler(im, sh.dx, sh.dy);
    const row: any = { desc: e.desc, size: `${im.w}x${im.h}`, registration: reg && { dx: reg.dx_mean, dy: reg.dy_mean, dy_sd: reg.dy_sd, patches: reg.goodPatches, minNcc: reg.minNcc, applied: sh } };

    // global brightness: untouched background and face skin, linear luminance
    row.L_background = r4(meanLum(S, bgIdx, W));
    row.L_cheeks = r4(meanLum(S, cheeks, W));
    row.L_skinWindow = r4(meanLum(S, skinWin, W));

    // dark circles
    const dcRows: any = {};
    let wSum = 0, dESum = 0, wAlpha = 0, wLow = 0;
    for (const s of sides) {
      const Lc = meanLum(S, s.core, W), Lb = meanLum(S, s.band, W), La = meanLum(S, s.all, W, s.aw), Ll = meanLum(S, s.lower, W);
      const lc = meanLab(S, s.core, W), lb = meanLab(S, s.band, W);
      const dE = Math.hypot(lc[0] - lb[0], lc[1] - lb[1], lc[2] - lb[2]);
      const w = (Lc - Lb) / Lb;
      dcRows[s.name] = { L_core: r4(Lc), L_band: r4(Lb), weber: r4(w), weber_alphaW: r4((La - Lb) / Lb), L_lower: r4(Ll), weber_lower: r4((Ll - Lb) / Lb), dE76: +dE.toFixed(2) };
      wLow += (Ll - Lb) / Lb;
      wSum += w; dESum += dE; wAlpha += (La - Lb) / Lb;
    }
    row.darkCircle = { ...dcRows, weber_mean: r4(wSum / 2), weber_alphaW_mean: r4(wAlpha / 2), weber_lower_mean: r4(wLow / 2), L_core_mean: r4((dcRows.L.L_core + dcRows.R.L_core) / 2), L_lower_mean: r4((dcRows.L.L_lower + dcRows.R.L_lower) / 2), L_band_mean: r4((dcRows.L.L_band + dcRows.R.L_band) / 2), dE76_mean: +(dESum / 2).toFixed(2) };

    // spots, acne, pores
    row.families = {};
    comp[e.label] = {};
    for (const [fk, list] of Object.entries(fam)) {
      const wv = list.map(({ f, r }) => { const Lf = meanLum(S, f, W), Lr = meanLum(S, r, W); return (Lf - Lr) / Lr; });
      comp[e.label][fk] = wv;
      const ab = wv.map(Math.abs);
      const fr: any = { n: wv.length, median_weber: r4(med(wv)), median_abs_weber: r4(med(ab)), mean_abs_weber: r4(avg(ab)) };
      if (fk === "acne") {
        const wi = list.map(({ interior, r }) => { const Lf = meanLum(S, interior!, W), Lr = meanLum(S, r, W); return (Lf - Lr) / Lr; });
        comp[e.label]["acne_interior"] = wi;
        fr.interior_median_weber = r4(med(wi));
        fr.interior_median_abs_weber = r4(med(wi.map(Math.abs)));
      }
      row.families[fk] = fr;
    }
    out.renders[e.label] = row;
    console.log(`${e.label.padEnd(15)} dy ${reg ? reg.dy_mean : 0} | bg ${row.L_background} | DC weber ${row.darkCircle.weber_mean} (lower ${row.darkCircle.weber_lower_mean}) dE ${row.darkCircle.dE76_mean} | spot ${row.families.age_spot.median_abs_weber} acne ${row.families.acne.median_abs_weber}/${row.families.acne.interior_median_abs_weber} pore ${row.families.pore.median_abs_weber}`);
  }

  // strongest-10 spots / acne by input contrast
  for (const fk of ["age_spot", "acne"]) {
    const base = comp.input[fk];
    const order = base.map((v, i) => [Math.abs(v), i] as const).sort((a, b) => b[0] - a[0]).slice(0, 10).map((x) => x[1]);
    for (const e of entries) out.renders[e.label].families[fk].strongest10_mean_abs_weber = r4(avg(order.map((i) => Math.abs(comp[e.label][fk][i]))));
  }

  // ratios vs input and vs baseline, brightness shift vs input
  const baseKey = out.renders.lv_base_s0 ? "lv_base_s0" : null;
  const ratio = (a: number, b: number) => (b ? +(a / b).toFixed(3) : null);
  for (const e of entries) {
    const r = out.renders[e.label];
    const vsIn = out.renders.input, vsBase = baseKey ? out.renders[baseKey] : null;
    if (vsBase) r.darkCircle.luminance_vs_baseline = { core: ratio(r.darkCircle.L_core_mean, vsBase.darkCircle.L_core_mean), lower: ratio(r.darkCircle.L_lower_mean, vsBase.darkCircle.L_lower_mean), band: ratio(r.darkCircle.L_band_mean, vsBase.darkCircle.L_band_mean), cheeks: ratio(r.L_cheeks, vsBase.L_cheeks), background: ratio(r.L_background, vsBase.L_background) };
    r.brightness_vs_input = { background: ratio(r.L_background, vsIn.L_background), cheeks: ratio(r.L_cheeks, vsIn.L_cheeks), skinWindow: ratio(r.L_skinWindow, vsIn.L_skinWindow) };
    const metrics = (x: any) => ({
      dc_weber_abs: Math.abs(x.darkCircle.weber_mean), dc_lower_weber_abs: Math.abs(x.darkCircle.weber_lower_mean), dc_dE76: x.darkCircle.dE76_mean,
      spot_median_abs: x.families.age_spot.median_abs_weber, spot_strongest10: x.families.age_spot.strongest10_mean_abs_weber,
      acne_median_abs: x.families.acne.median_abs_weber, acne_interior_median_abs: x.families.acne.interior_median_abs_weber, pore_median_abs: x.families.pore.median_abs_weber,
    });
    const m = metrics(r);
    r.ratio_vs_input = Object.fromEntries(Object.entries(metrics(vsIn)).map(([k, v]) => [k, ratio((m as any)[k], v as number)]));
    if (vsBase) r.ratio_vs_baseline = Object.fromEntries(Object.entries(metrics(vsBase)).map(([k, v]) => [k, ratio((m as any)[k], v as number)]));
  }

  // pairwise mean abs difference (0-255 RGB) in regions, each render registered to input coordinates
  const dcCore = sides.flatMap((s) => s.core);
  const spotMarks: number[] = []; for (let i = 0; i < W * H; i++) if (spot[i] !== 51) spotMarks.push(i);
  const regions: Record<string, number[]> = { wholeImage: rect(10, 10, W - 10, H - 12), darkCircleCore: dcCore, ageSpotMarks: spotMarks, cheeks, background: bgIdx };
  const sam = Object.fromEntries(entries.map((e) => [e.label, sampler(imgs[e.label], shifts[e.label].dx, shifts[e.label].dy)]));
  const mad = (a: Sampler, b: Sampler, idx: number[]) => {
    let s = 0, n = 0;
    for (const i of idx) { const x = i % W, y = (i / W) | 0; const A = a(x, y), B = b(x, y); if (!A || !B) continue; s += (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2])) / 3; n++; }
    return +(s / n).toFixed(3);
  };
  out.pairwiseMAD = {};
  const labels = entries.map((e) => e.label);
  const pairs: [string, string][] = [];
  for (const l of labels) { if (l !== "input") pairs.push(["input", l]); if (baseKey && l !== baseKey && l !== "input") pairs.push([baseKey, l]); }
  const lv = labels.filter((l) => l.startsWith("lv_") && l !== baseKey);
  for (const [a, b] of [["lv_conc_ue10", "lv_conc_mid"], ["lv_conc_mid", "lv_conc_ue90"], ["lv_conc_ue10", "lv_conc_ue90"], ["lv_conc_mid", "lv_conc_ci90"], ["lv_found_c50", "lv_found_c100"]] as [string, string][]) if (labels.includes(a) && labels.includes(b)) pairs.push([a, b]);
  void lv;
  for (const [a, b] of pairs) out.pairwiseMAD[`${a} vs ${b}`] = Object.fromEntries(Object.entries(regions).map(([k, idx]) => [k, mad(sam[a], sam[b], idx)]));
  for (const [k, v] of Object.entries(out.pairwiseMAD)) console.log(k.padEnd(34), JSON.stringify(v));

  // difference heat maps vs baseline (gain 8) for quick visual inspection
  if (baseKey) {
    for (const l of lv) {
      const buf = Buffer.alloc(W * H * 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const A = sam[baseKey](x, y), B = sam[l](x, y);
        const d = A && B ? Math.min(255, 8 * (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2])) / 3) : 0;
        const o = (y * W + x) * 3; buf[o] = d; buf[o + 1] = d; buf[o + 2] = d;
      }
      await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).resize({ width: 540 }).png().toFile(p("overlays", `lv_diff_${l}_vs_base_x8.png`));
    }
  }
  writeJson("vto_levers.json", out);
  console.log("wrote vto_levers.json");
}

/** Left-eye crops (input coordinates, VTO renders shifted by the measured 1 row), side by side, for visual inspection. */
async function crops() {
  const X0 = 215, Y0 = 520, CW = 270, CH = 190;
  const names = ["input", "lv_base_s0", "lv_conc_ue90", "lv_found_c100", "lv_conc_mid_s100"];
  const tiles: Buffer[] = [];
  for (const n of names) {
    const file = n === "input" ? INPUT : findResult(n);
    if (!file) continue;
    const dy = n === "input" ? 0 : 1;
    tiles.push(await sharp(file).removeAlpha().extract({ left: X0, top: Y0 + dy, width: CW, height: CH }).resize({ width: CW * 2 }).png().toBuffer());
  }
  const composite = tiles.map((input, i) => ({ input, left: i * (CW * 2 + 6), top: 0 }));
  await sharp({ create: { width: tiles.length * (CW * 2 + 6), height: CH * 2, channels: 3, background: "#ffffff" } }).composite(composite).png().toFile(p("overlays", "lv_eye_crops.png"));
  console.log("wrote overlays/lv_eye_crops.png (" + names.join(" | ") + ")");
}

function findResult(label: string): string | null {
  const dir = p(label);
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((x) => /^result\.(png|jpe?g)$/i.test(x));
  return f ? path.join(dir, f) : null;
}

// ---------------- main ----------------
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--analyze")) { await analyze(); return; }
  if (args.includes("--crops")) { await crops(); return; }
  if (args.includes("--credit")) { await credit("check"); await history(); return; }
  const recIdx = args.indexOf("--recover");
  if (recIdx >= 0) { await recoverFromHistory(args[recIdx + 1]); await history(); return; }
  const onlyIdx = args.indexOf("--only");
  const labels = onlyIdx >= 0 ? args[onlyIdx + 1].split(",") : Object.entries(PLAN).filter(([, v]) => v.core).map(([k]) => k);
  const st = readState();
  const planned = labels.filter((l) => !st.tasks[l]).length + Object.keys(st.tasks).filter((k) => k.startsWith("lv_")).length;
  console.log(`labels: ${labels.join(", ")} (lv_ tasks after this run: ${planned}, ceiling ${HARD_CEILING_UNITS})`);
  if (planned * UNITS_PER_RENDER > HARD_CEILING_UNITS) throw new Error("would exceed the unit ceiling");
  await credit("before_" + Date.now());
  const orphans = await orphanCharges();
  if (orphans.length) throw new Error(`${orphans.length} charged makeup-vto task(s) in history are not in state.json (run --recover <label>): refusing to submit`);
  for (const l of labels) {
    await submit(l);
    await sleep(400);
  }
  for (const l of labels) {
    const t = readState().tasks[l];
    if (!t) continue;
    const resFile = p(`result_${l}.json`);
    const json = fs.existsSync(resFile) ? JSONB.parse(fs.readFileSync(resFile, "utf8")).json : await poll(l);
    if (json?.data?.task_status === "success") console.log(`  ${l}: ${await download(l, json)}`);
  }
  await credit("after_" + Date.now());
  await history();
  await analyze();
}

main().catch((e) => { console.error(e); process.exit(1); });
void ROOT;
