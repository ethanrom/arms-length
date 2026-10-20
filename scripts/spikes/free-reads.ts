// Free (non-billed) GETs only: remaining feature-cost pages + unit history. Never creates tasks.
import fs from "node:fs";
import JSONbig from "json-bigint";
import { p, writeJson } from "./lib";
const JB = JSONbig({ storeAsString: true });
const H = { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}` };
const base = "https://yce-api-01.makeupar.com";
async function get(path: string) {
  const r = await fetch(base + path, { headers: H });
  const t = await r.text();
  return { status: r.status, json: JB.parse(t) };
}
async function main() {
  const skus: any[] = [];
  let token: string | undefined;
  for (let i = 0; i < 10; i++) {
    const r = await get(`/s2s/v2.0/credit/feature-cost?page_size=20${token ? `&starting_token=${encodeURIComponent(token)}` : ""}`);
    if (r.status !== 200) { console.log("feature-cost page", i, "status", r.status); break; }
    skus.push(...r.json.result.skus);
    token = r.json.result.next_token;
    if (!token) break;
  }
  writeJson("feature_cost_all.json", skus);
  console.log("total SKUs:", skus.length);
  for (const s of skus) if (/skin|makeup|simulat|tone|camera|face|analysis/i.test(s.description + s.run_task_url)) console.log(JSON.stringify(s));
  const h = await get("/s2s/v1.0/client/credit/history?page_size=30");
  writeJson("credit_history.json", h);
  console.log("history status", h.status);
  const items = h.json?.results?.history ?? h.json?.result?.history ?? h.json?.data?.history ?? [];
  console.log("history keys", Object.keys(h.json ?? {}), "items", items.length);
  for (const it of items.slice(0, 14)) console.log(new Date(Number(it.timestamp)).toISOString(), it.action, JSON.stringify(it.info?.credits?.map((c: any) => c.amount_dec ?? c.amount) ?? it.info).slice(0, 80), String(it.target_id).slice(0, 12));
}
main();
