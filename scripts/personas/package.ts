/**
 * Free, local: turns the recorder's raw downloads (scripts/personas/work/) into fixtures/youcam/<persona>/ files, in the
 * layout documented in fixtures/youcam/README.md. Adds files only: an existing file is never overwritten (a byte-different
 * one stops the run). Task ids, file ids and signed URLs are dropped.
 *
 *   npx tsx scripts/personas/package.ts [path to spike-data]
 *
 * Also copies p2b's two smooth-0 foundation renders from the Phase 0 spike data (lv_found_c50, lv_found_c100).
 */
import fs from "node:fs";
import path from "node:path";
import JSONbig from "json-bigint";
import sharp from "sharp";
import { FIXTURES, WORK, buildPlan } from "./common";

const JSONB = JSONbig({ storeAsString: true });
const SPIKE = process.argv[2] ?? "E:/hackathons/youcam-api/internal/research/spike-data";

let added = 0;
function put(dest: string, bytes: Uint8Array | string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const next = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  if (fs.existsSync(dest)) {
    if (!fs.readFileSync(dest).equals(next)) throw new Error(`${path.relative(FIXTURES, dest)} exists and differs; not overwriting`);
    return;
  }
  fs.writeFileSync(dest, next);
  added++;
  console.log(`  + ${path.relative(FIXTURES, dest)} (${next.length} bytes)`);
}
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

async function packageAnalysis(label: string, persona: string): Promise<void> {
  const dir = path.join(WORK, label);
  const result = JSONB.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8")).json.data;
  if (result.task_status !== "success") throw new Error(`${label} is not a success`);
  const input = path.join(FIXTURES, persona, "input.jpg");
  const inMeta = await sharp(input).metadata();
  const output = [];
  for (const item of result.results.output) {
    const out = { ...item };
    if (item.type === "resize_image") {
      const re = path.join(dir, "files", "resize_image.jpg");
      const m = await sharp(re).metadata();
      if (m.width !== inMeta.width || m.height !== inMeta.height) throw new Error("resize_image differs in size from the input: masks would not match");
      out.mask_urls = ["input.jpg"]; // the API re-encodes the input; the re-encode is not stored
    } else if (item.mask_urls?.length) {
      const name = `${item.type}${item.region ? "_" + item.region : ""}.png`;
      const file = path.join(dir, "files", name);
      const m = await sharp(file).metadata();
      if (m.width !== inMeta.width || m.height !== inMeta.height) throw new Error(`${name}: ${m.width}x${m.height}, input ${inMeta.width}x${inMeta.height}`);
      put(path.join(FIXTURES, persona, "masks", "hd", name), fs.readFileSync(file));
      out.mask_urls = [`masks/hd/${name}`];
    }
    output.push(out);
  }
  const text = json({ error: result.error, results: { output }, task_status: result.task_status });
  if (/https?:|X-Amz|task_id/i.test(text)) throw new Error("analysis JSON still holds a URL or id");
  put(path.join(FIXTURES, persona, "analysis.hd.json"), text);
}

function packageRender(label: string, persona: string, stem: string, request: unknown, from?: string): void {
  const src = from ?? path.join(WORK, label, "result.png");
  put(path.join(FIXTURES, persona, "renders", `${stem}.png`), fs.readFileSync(src));
  put(path.join(FIXTURES, persona, "renders", `${stem}.request.json`), json(request));
}

async function main() {
  const plan = buildPlan();
  const state = fs.existsSync(path.join(WORK, "..", "state.json")) ? JSON.parse(fs.readFileSync(path.join(WORK, "..", "state.json"), "utf8")) : { tasks: {} };

  await packageAnalysis("p1a_hd", "p1a");

  for (const [label, item] of Object.entries(plan)) {
    if (item.kind === "analysis" || !state.tasks[label]?.done) continue;
    packageRender(label, item.persona, item.stem!, item.body); // VTO: version + effects; simulation: the strengths
  }

  // p2b: the two smooth-0 foundation renders recorded in Phase 0 (same request shape as the new grid renders).
  for (const cov of [50, 100]) {
    const sent = JSON.parse(fs.readFileSync(path.join(SPIKE, `submit_lv_found_c${cov}.json`), "utf8")).request;
    const { src_file_id: _drop, ...request } = sent;
    void _drop;
    packageRender(`lv_found_c${cov}`, "p2b", `foundation_cov${cov}`, request, path.join(SPIKE, `lv_found_c${cov}`, "result.png"));
  }
  console.log(`${added} file(s) added`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
