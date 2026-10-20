/**
 * Static SVG for the head-to-head (results/chart.svg).
 *
 * Panel 1: per synthetic patch, the model's five answers as dots against our nominal-to-bound range (a bar), on a log
 * distance axis. Panel 2: the size-doubling ratios against the ideal 2.0, log axis.
 * Colours are slots 1 and 2 of the validated categorical palette (validate_palette.js --pairs all passes in light and
 * dark). The second channel is shape: dots are the LLM, bars and lines are our model. Every mark has a native tooltip
 * and the full table is in summary.json.
 */
import type { Summary } from "./summary";

const W = 720;
const LEFT = 128;
const RIGHT = W - 36;
const ROW = 38;
const R = 5;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (x: number, d = 2): string => (Math.round(x * 10 ** d) / 10 ** d).toString();
const metres = (x: number): string => `${x >= 10 ? Math.round(x) : num(x, 1)} m`;

/** Vertical offsets for the dots of one row: identical or touching values are stacked so each stays visible. */
function dodge(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const offsets = new Array<number>(xs.length).fill(0);
  const placed: { x: number; dy: number }[] = [];
  const candidates = [0, -11, 11, -22, 22];
  for (const [x, i] of order) {
    const dy = candidates.find((c) => placed.every((p) => Math.hypot(p.x - x, p.dy - c) >= 2 * R + 1)) ?? 0;
    placed.push({ x, dy });
    offsets[i] = dy;
  }
  return offsets;
}

export function renderChart(s: Summary): string {
  const patches = s.testB.patches;
  const scaling = s.testB.scaling;
  const agg = s.testB.aggregate;

  // ---- Panel 1
  const all1 = patches.flatMap((p) => [...p.llm.values, p.truth.nominalM, p.truth.boundM]).filter((v) => v > 0);
  const lo1 = 2 ** Math.floor(Math.log2(Math.min(...all1) * 0.9));
  const hi1 = 2 ** Math.ceil(Math.log2(Math.max(...all1) * 1.05));
  const x1 = (v: number) => LEFT + ((Math.log2(v) - Math.log2(lo1)) / (Math.log2(hi1) - Math.log2(lo1))) * (RIGHT - LEFT);
  const ticks1: number[] = [];
  for (let t = lo1; t <= hi1 * 1.0001; t *= 2) ticks1.push(t);

  const P1_TOP = 206;
  const GROUP_H = 22;
  const GROUP_GAP = 10;
  const groups = [5, 15, 30];
  const p1Bottom = P1_TOP + groups.length * (GROUP_H + 3 * ROW + GROUP_GAP) - GROUP_GAP;

  let p1 = ticks1
    .map((t) => `<line class="grid" x1="${x1(t)}" y1="${P1_TOP - 4}" x2="${x1(t)}" y2="${p1Bottom}"/><text class="tick" x="${x1(t)}" y="${p1Bottom + 18}" text-anchor="middle">${t} m</text>`)
    .join("");
  groups.forEach((c, g) => {
    const top = P1_TOP + g * (GROUP_H + 3 * ROW + GROUP_GAP);
    p1 += `<text class="group" x="40" y="${top + 14}">Spot ${c}% darker than the surrounding skin</text>`;
    [1, 2, 4].forEach((d, k) => {
      const p = patches.find((q) => q.diameterMm === d && q.weberPct === c)!;
      const cy = top + GROUP_H + k * ROW + ROW / 2;
      const a = x1(p.truth.nominalM);
      const b = x1(p.truth.boundM);
      const tip = `Our model, ${d} mm at ${c}%: average observer ${metres(p.truth.nominalM)}, bound ${metres(p.truth.boundM)}`;
      p1 += `<text class="rowlab" x="${LEFT - 12}" y="${cy + 4}" text-anchor="end">${d} mm</text>`;
      p1 += `<g><title>${esc(tip)}</title><rect class="ours" x="${a}" y="${cy - 3}" width="${b - a}" height="6" rx="3"/></g>`;
      const xs = p.llm.values.map(x1);
      const off = dodge(xs);
      p.llm.values.forEach((v, i) => {
        p1 += `<g><title>${esc(`Claude Opus 5.5 answer ${i + 1} of ${p.llm.values.length}, ${d} mm at ${c}%: ${metres(v)}`)}</title><circle class="llm" cx="${xs[i]}" cy="${cy + off[i]}" r="${R}"/></g>`;
      });
    });
  });
  p1 += `<line class="axis" x1="${LEFT}" y1="${p1Bottom}" x2="${RIGHT}" y2="${p1Bottom}"/>`;
  p1 += `<text class="axt" x="${(LEFT + RIGHT) / 2}" y="${p1Bottom + 40}" text-anchor="middle">Farthest distance at which the spot can still be seen (log scale: each gridline doubles it)</text>`;

  // ---- Panel 2
  const ratioRows: { label: string; med: number | null; range: [number, number] | null }[] = [];
  for (const r of scaling) {
    ratioRows.push({ label: "1 mm to 2 mm", med: r.llm2over1, range: r.llm2over1Range });
    ratioRows.push({ label: "2 mm to 4 mm", med: r.llm4over2, range: r.llm4over2Range });
  }
  const vals2 = ratioRows.flatMap((r) => [r.med ?? 2, ...(r.range ?? []), 2]);
  const lo2 = 0.9;
  const hi2 = Math.max(4.5, Math.max(...vals2) * 1.05);
  const x2 = (v: number) => LEFT + ((Math.log2(v) - Math.log2(lo2)) / (Math.log2(hi2) - Math.log2(lo2))) * (RIGHT - LEFT);
  const P2_HEAD = p1Bottom + 92;
  const P2_TOP = P2_HEAD + 72;
  const p2Bottom = P2_TOP + groups.length * (GROUP_H + 2 * ROW + GROUP_GAP) - GROUP_GAP;
  const ticks2 = [1, 1.5, 2, 3, 4].filter((t) => t <= hi2);

  let p2 = ticks2
    .map((t) => `<line class="grid" x1="${x2(t)}" y1="${P2_TOP - 4}" x2="${x2(t)}" y2="${p2Bottom}"/><text class="tick" x="${x2(t)}" y="${p2Bottom + 18}" text-anchor="middle">${t}</text>`)
    .join("");
  p2 += `<line class="idealline" x1="${x2(2)}" y1="${P2_TOP - 8}" x2="${x2(2)}" y2="${p2Bottom}"/>`;
  p2 += `<text class="note2" x="${x2(2) + 8}" y="${P2_TOP - 14}">Ideal 2.0: our model gives 2.00 for every pair</text>`;
  groups.forEach((c, g) => {
    const top = P2_TOP + g * (GROUP_H + 2 * ROW + GROUP_GAP);
    p2 += `<text class="group" x="40" y="${top + 14}">Spot ${c}% darker</text>`;
    [0, 1].forEach((k) => {
      const row = ratioRows[g * 2 + k];
      const cy = top + GROUP_H + k * ROW + ROW / 2;
      p2 += `<text class="rowlab" x="${LEFT - 12}" y="${cy + 4}" text-anchor="end">${row.label}</text>`;
      if (row.range) {
        p2 += `<g><title>${esc(`Lowest to highest of all 25 pairs of answers: ${num(row.range[0])} to ${num(row.range[1])}`)}</title><line class="whisker" x1="${x2(row.range[0])}" y1="${cy}" x2="${x2(row.range[1])}" y2="${cy}"/></g>`;
      }
      if (row.med !== null) {
        p2 += `<g><title>${esc(`Claude Opus 5.5, ${row.label} at ${c}%: ratio of median answers ${num(row.med)}`)}</title><circle class="llm" cx="${x2(row.med)}" cy="${cy}" r="${R}"/></g>`;
        p2 += `<text class="val" x="${x2(row.med)}" y="${cy - 10}" text-anchor="middle">${num(row.med, 1)}</text>`;
      }
    });
  });
  p2 += `<line class="axis" x1="${LEFT}" y1="${p2Bottom}" x2="${RIGHT}" y2="${p2Bottom}"/>`;
  p2 += `<text class="axt" x="${(LEFT + RIGHT) / 2}" y="${p2Bottom + 40}" text-anchor="middle">Distance after doubling the spot's diameter, divided by the distance before (log scale)</text>`;

  const H = p2Bottom + 136;
  const allRatios = ratioRows.map((r) => r.med).filter((v): v is number => v !== null);
  const sub1 = `Told the size and contrast, Claude Opus 5.5 lands a typical ${num(agg.geometricMeanFactorOfMedianVsNominal, 1)}x from the model's average-observer distance,`;
  const sub2 = `but identical asks spread by ${Math.round(agg.medianCv * 100)}% (median CV), and doubling the spot raised its answer by ${num(Math.min(...allRatios), 1)}x to ${num(Math.max(...allRatios), 1)}x, not 2.0x.`;
  const desc = `${sub1} ${sub2} ${agg.answersInsideModelRange} of ${agg.answersTotal} answers fall inside the model's range. Per-patch values are in summary.json.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Asking an AI versus measuring it: visibility distance of a dark spot</title>
<desc id="d">${esc(desc)}</desc>
<style>
  svg { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .bg { fill: #fcfcfb; }
  .title { fill: #0b0b0b; font-size: 18px; font-weight: 600; }
  .ptitle { fill: #0b0b0b; font-size: 14.5px; font-weight: 600; }
  .sub, .legend, .axt, .rowlab, .group, .note2, .val { fill: #52514e; }
  .sub { font-size: 13px; }
  .legend, .axt, .rowlab, .note2 { font-size: 12.5px; }
  .group { font-size: 12.5px; font-weight: 600; }
  .val { font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .tick, .note { fill: #898781; }
  .tick, .note { font-size: 11.5px; }
  .tick { font-variant-numeric: tabular-nums; }
  .grid { stroke: #e1e0d9; stroke-width: 1; }
  .axis { stroke: #c3c2b7; stroke-width: 1; }
  .ours { fill: #2a78d6; }
  .idealline { stroke: #2a78d6; stroke-width: 2; stroke-linecap: round; }
  .llm { fill: #eb6834; stroke: #fcfcfb; stroke-width: 2; paint-order: stroke; }
  .whisker { stroke: #c3c2b7; stroke-width: 2; stroke-linecap: round; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #1a1a19; }
    .title, .ptitle { fill: #f0efec; }
    .sub, .legend, .axt, .rowlab, .group, .note2, .val { fill: #c3c2b7; }
    .tick, .note { fill: #898781; }
    .grid { stroke: #2c2c2a; }
    .axis { stroke: #383835; }
    .ours { fill: #3987e5; }
    .idealline { stroke: #3987e5; }
    .llm { fill: #d95926; stroke: #1a1a19; }
    .whisker { stroke: #383835; }
  }
</style>
<rect class="bg" width="${W}" height="${H}"/>
<text class="title" x="40" y="38">Why not just ask an AI?</text>
<text class="sub" x="40" y="62">${esc(sub1)}</text>
<text class="sub" x="40" y="80">${esc(sub2)}</text>
<circle class="llm" cx="48" cy="108" r="${R}"/><text class="legend" x="62" y="112">Claude Opus 5.5 on Amazon Bedrock: each of its 5 answers per patch</text>
<rect class="ours" x="37" y="127" width="22" height="6" rx="3"/><text class="legend" x="66" y="134">Our model: average observer (left end) to one-sided bound (right end)</text>
<text class="ptitle" x="40" y="168">1. How far away can the dark spot on a 60 mm skin patch still be seen?</text>
<text class="sub" x="40" y="188">Asked with the spot's size and contrast stated, for 20/20 vision in indoor light.</text>
${p1}
<text class="ptitle" x="40" y="${P2_HEAD}">2. Does doubling the spot double the distance?</text>
<text class="sub" x="40" y="${P2_HEAD + 20}">Ratio of the median answers. At fixed contrast, distance scales with size, so the ideal is 2.0.</text>
<text class="sub" x="40" y="${P2_HEAD + 38}">Grey whisker: lowest to highest ratio over all 25 pairs of one answer per size.</text>
${p2}
<text class="note" x="40" y="${H - 62}">Model: Watson &amp; Ahumada (2005) Standard A, validated on ModelFest observers (0.69 dB RMS), at 45 cd/m2 for 20/20 vision.</text>
<text class="note" x="40" y="${H - 44}">Bound = the same model made 6 dB more sensitive (a sharper-than-average eye). Distances are not capped at 10 m here.</text>
<text class="note" x="40" y="${H - 26}">Raw answers and prompts: eval/llm-baseline/. ${s.meta.calls} calls, ${s.meta.tokens.input + s.meta.tokens.output} tokens, about $${num(s.meta.estimatedCostUsd, 2)} at list price.</text>
</svg>
`;
}
