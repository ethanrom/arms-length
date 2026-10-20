import fs from "node:fs";
import { p } from "./lib";
import JSONbig from "json-bigint";
const JB = JSONbig({ storeAsString: true });
(async () => {
  const r = await fetch("https://yce-api-01.makeupar.com/s2s/v1.0/client/credit/history?page_size=30", { headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`, "Content-Type": "application/json" } });
  const t = await r.text();
  const j = JB.parse(t);
  fs.writeFileSync(p("credit_history.json"), JSON.stringify({ status: r.status, json: j }, null, 2));
  console.log("status", r.status, Object.keys(j));
  const items = j.results?.history ?? j.result?.history ?? j.data?.history ?? j.history ?? [];
  console.log("items", items.length, "keys", j.results ? Object.keys(j.results) : "");
  for (const it of items.slice(0, 14)) console.log(new Date(Number(it.timestamp)).toISOString(), it.action, JSON.stringify(it.info).slice(0, 110), String(it.target_id).slice(0, 14));
})();
