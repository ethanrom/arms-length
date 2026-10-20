/**
 * Phase 0 spike: answers the questions in internal/PLAN.md §5 with about 53 units.
 * Run: npx tsx --env-file=.env scripts/spikes/youcam-spike.ts
 *
 * Idempotent: every created task id is written to state.json before polling, and a
 * re-run polls the recorded task instead of creating (and paying for) a new one.
 * All responses and downloads go to internal/research/spike-data/ (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import JSONbig from "json-bigint";

const HOST = "https://yce-api-01.makeupar.com";
const KEY = process.env.YOUCAM_API_KEY;
if (!KEY) throw new Error("YOUCAM_API_KEY missing (run with --env-file=.env)");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "internal/research/spike-data");
const RAW = path.join(ROOT, "internal/personas/raw");
const STATE = path.join(OUT, "state.json");
const JSONB = JSONbig({ storeAsString: true });

fs.mkdirSync(OUT, { recursive: true });
type State = { files: Record<string, string>; tasks: Record<string, { slug: string; id: string; done?: boolean }> };
const state: State = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { files: {}, tasks: {} };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
const write = (name: string, data: unknown) =>
  fs.writeFileSync(path.join(OUT, name), typeof data === "string" ? data : JSON.stringify(data, null, 2));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, urlPath: string, body?: unknown) {
  const res = await fetch(HOST + urlPath, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSONB.parse(text);
  } catch {
    json = { nonJson: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

// ---------- 1. inputs ----------
async function prepare() {
  const dir = path.join(OUT, "inputs");
  fs.mkdirSync(dir, { recursive: true });
  // p2-b: face fills ~69% of width already; upscale 928 -> 1080 short side for HD.
  const p2 = path.join(dir, "p2b_hd.jpg");
  if (!fs.existsSync(p2)) await sharp(path.join(RAW, "p2-b.jpg")).resize({ width: 1080, kernel: "lanczos3" }).jpeg({ quality: 95 }).toFile(p2);
  // p3-a: face ~56% of width; crop sides to ~790 px (face ~66%), then upscale to 1080 short side.
  const p3 = path.join(dir, "p3a_hd.jpg");
  if (!fs.existsSync(p3))
    await sharp(path.join(RAW, "p3-a.jpg"))
      .extract({ left: 75, top: 0, width: 790, height: 1152 })
      .resize({ width: 1080, kernel: "lanczos3" })
      .jpeg({ quality: 95 })
      .toFile(p3);
  const meta: Record<string, unknown> = {};
  for (const f of [p2, p3]) {
    const m = await sharp(f).metadata();
    meta[path.basename(f)] = { width: m.width, height: m.height, bytes: fs.statSync(f).size };
  }
  write("inputs.json", meta);
  return { p2, p3 };
}

// ---------- 2. upload ----------
async function upload(label: string, file: string) {
  if (state.files[label]) return state.files[label];
  const buf = fs.readFileSync(file);
  const r = await api("POST", "/s2s/v2.0/file", {
    files: [{ content_type: "image/jpeg", file_name: path.basename(file), file_size: buf.length }],
  });
  write(`upload_${label}.json`, r);
  const f = r.json?.data?.files?.[0];
  if (r.status !== 200 || !f?.file_id) throw new Error(`upload ${label} failed: ${JSON.stringify(r).slice(0, 400)}`);
  const req = f.requests[0];
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) if (k.toLowerCase() !== "content-length") headers[k] = String(v);
  const put = await fetch(req.url, { method: req.method ?? "PUT", headers, body: buf });
  if (!put.ok) throw new Error(`PUT ${label} failed: ${put.status} ${await put.text()}`);
  state.files[label] = f.file_id;
  save();
  return f.file_id as string;
}

// ---------- 3. tasks ----------
async function submit(label: string, slug: string, body: unknown, version = "v2.0") {
  if (state.tasks[label]) return;
  const r = await api("POST", `/s2s/${version}/task/${slug}`, body);
  write(`submit_${label}.json`, { request: body, response: r });
  const id = r.json?.data?.task_id;
  if (r.status !== 200 || !id) {
    console.log(`  ! ${label}: submit failed (${r.status}) ${JSON.stringify(r.json).slice(0, 300)}`);
    return;
  }
  state.tasks[label] = { slug: `${version}/task/${slug}`, id: String(id) };
  save();
  console.log(`  submitted ${label}: ${id}`);
  await sleep(400);
}

async function poll(label: string) {
  const t = state.tasks[label];
  if (!t) return null;
  const started = Date.now();
  for (;;) {
    const r = await api("GET", `/s2s/${t.slug}/${t.id}`);
    const st = r.json?.data?.task_status;
    if (st === "success" || st === "error" || r.status !== 200) {
      write(`result_${label}.json`, r);
      t.done = true;
      save();
      console.log(`  ${label}: ${st ?? r.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return r.json;
    }
    if (Date.now() - started > 6 * 60_000) throw new Error(`${label} still running after 6 min`);
    await sleep(3000);
  }
}

async function download(label: string, json: any) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const urls: { name: string; url: string }[] = [];
  const res = json?.data?.results;
  if (res?.url) urls.push({ name: "result", url: res.url });
  for (const o of res?.output ?? []) {
    (o.mask_urls ?? []).forEach((u: string, i: number) =>
      urls.push({ name: `${o.type}${o.region ? "_" + o.region : ""}${i ? "_" + i : ""}`, url: u }),
    );
  }
  for (const u of urls) {
    const ext = (new URL(u.url).pathname.match(/\.(png|jpe?g|zip)$/i)?.[0] ?? ".bin").toLowerCase();
    const dest = path.join(dir, u.name + ext);
    if (fs.existsSync(dest)) continue;
    const r = await fetch(u.url);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  }
  return dir;
}

async function describe(dir: string) {
  const rows: Record<string, unknown> = {};
  for (const f of fs.readdirSync(dir).filter((x) => /\.(png|jpe?g)$/i.test(x))) {
    const img = sharp(path.join(dir, f));
    const m = await img.metadata();
    let alpha: unknown = null;
    if (m.hasAlpha) {
      const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let nz = 0, sum = 0, max = 0;
      for (let i = 3; i < data.length; i += info.channels) {
        const a = data[i];
        if (a > 0) { nz++; sum += a; if (a > max) max = a; }
      }
      alpha = { nonzeroPx: nz, fraction: +(nz / (info.width * info.height)).toFixed(5), meanNonzero: nz ? +(sum / nz).toFixed(1) : 0, max };
    }
    rows[f] = { w: m.width, h: m.height, channels: m.channels, hasAlpha: m.hasAlpha, alpha };
  }
  write(path.relative(OUT, dir) + "_describe.json", rows);
  return rows;
}

async function skinPatchHex(file: string, left: number, top: number) {
  const { data } = await sharp(file).extract({ left, top, width: 40, height: 40 }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 3) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

async function main() {
  console.log("0. free checks");
  write("feature_cost.json", await api("GET", "/s2s/v2.0/credit/feature-cost"));
  const credit = await api("GET", "/s2s/v1.0/client/credit");
  write("credit_before.json", credit);
  console.log(`  credit endpoint with Bearer key: HTTP ${credit.status}`);

  console.log("1. inputs");
  const { p2, p3 } = await prepare();

  console.log("2. upload");
  const f2 = await upload("p2b", p2);
  const f3 = await upload("p3a", p3);

  console.log("3. submit (paid on success)");
  const HD = ["hd_acne", "hd_age_spot", "hd_pore", "hd_wrinkle", "hd_dark_circle", "hd_redness", "hd_eye_bag", "hd_texture"];
  const SD = ["acne", "age_spot", "pore", "wrinkle", "dark_circle_v2", "redness", "eye_bag", "texture"];
  await submit("sa_hd_p2b", "skin-analysis", { src_file_id: f2, dst_actions: HD, format: "json" }, "v2.1");
  await submit("sa_sd_p2b", "skin-analysis", { src_file_id: f2, dst_actions: SD, format: "json" }, "v2.1");
  await submit("sa_hd_p3a", "skin-analysis", { src_file_id: f3, dst_actions: HD, format: "json" }, "v2.1");

  const shade = await skinPatchHex(p2, 300, 820); // left cheek patch on the upscaled p2-b
  write("p2b_shade.json", { shade });
  for (const c of [20, 50, 90])
    await submit(`mu_conc${c}_p2b`, "makeup-vto", {
      src_file_id: f2,
      version: "1.0",
      effects: [{ category: "concealer", palettes: [{ color: shade, colorIntensity: 50, colorUnderEyeIntensity: 50, coverageLevel: c }] }],
    });
  for (const c of [30, 80])
    await submit(`mu_found${c}_p2b`, "makeup-vto", {
      src_file_id: f2,
      version: "1.0",
      effects: [{ category: "foundation", palettes: [{ color: shade, colorIntensity: 50, glowIntensity: 0, coverageIntensity: c }] }],
    });
  await submit("sim_p3a", "skin-simulation", { src_file_id: f3, spots: 0.5, redness: 0.5 });

  console.log("4. poll + download");
  for (const label of Object.keys(state.tasks)) {
    const json = fs.existsSync(path.join(OUT, `result_${label}.json`))
      ? JSONB.parse(fs.readFileSync(path.join(OUT, `result_${label}.json`), "utf8")).json
      : await poll(label);
    if (json?.data?.task_status === "success") await describe(await download(label, json));
  }

  write("credit_after.json", await api("GET", "/s2s/v1.0/client/credit"));
  console.log("done. see internal/research/spike-data/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
