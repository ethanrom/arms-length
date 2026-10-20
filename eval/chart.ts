/**
 * Static SVG of a ModelFest report: predicted vs observed threshold, one dot per stimulus, y = x line.
 *
 * Form: scatter of two quantities on one shared scale (an all-pairs chart, so at most three categorical hues).
 * Colours are slots 1-3 of the validated categorical palette (light and dark runs of validate_palette.js
 * pass --pairs all); shape is the second channel for the skin-relevant family, and the aqua slot is under 3:1
 * on the light surface, so every point carries a native tooltip and the full table is in modelfest.json.
 */
import type { ModelFestReport, StimulusResult } from "./modelfest/run";

const W = 720;
const H = 880;
const PLOT = { left: 84, top: 176, size: 560 };

type Group = "skin" | "gabor" | "pattern";
const GROUPS: { id: Group; label: string }[] = [
  { id: "skin", label: "Skin-relevant shapes" },
  { id: "gabor", label: "Gabor patches, strings and plaids" },
  { id: "pattern", label: "Bessel and checkerboard patterns" },
];
const groupOf = (r: StimulusResult): Group => (r.skinRelevant ? "skin" : r.family === "pattern" ? "pattern" : "gabor");

type Shape = "circle" | "square" | "diamond" | "triangle";
const shapeOf = (r: StimulusResult): Shape =>
  r.family === "disk" ? "square" : r.family === "line" ? "diamond" : r.family === "edge" ? "triangle" : "circle";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f1 = (x: number): string => x.toFixed(2).replace("-", "−");
const signed = (x: number): string => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);

function marker(shape: Shape, cx: number, cy: number, cls: string): string {
  const r = 5.5;
  switch (shape) {
    case "square":
      return `<rect class="${cls}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="1.5"/>`;
    case "diamond":
      return `<path class="${cls}" d="M${cx} ${cy - r - 1.5}L${cx + r + 1.5} ${cy}L${cx} ${cy + r + 1.5}L${cx - r - 1.5} ${cy}Z"/>`;
    case "triangle":
      return `<path class="${cls}" d="M${cx} ${cy - r - 1}L${cx + r + 1} ${cy + r}L${cx - r - 1} ${cy + r}Z"/>`;
    default:
      return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
  }
}

export function renderModelFestSvg(report: ModelFestReport, detectorLabel: string): string {
  const rs = report.results;
  const vals = rs.flatMap((r) => [r.observedDb, r.predictedDb]);
  const lo = Math.floor((Math.min(...vals) - 0.5) / 5) * 5;
  const hi = Math.ceil((Math.max(...vals) + 0.5) / 5) * 5;
  const tickStep = hi - lo > 40 ? 10 : 5;
  const sx = (v: number) => PLOT.left + ((v - lo) / (hi - lo)) * PLOT.size;
  const sy = (v: number) => PLOT.top + PLOT.size - ((v - lo) / (hi - lo)) * PLOT.size;

  const ticks: number[] = [];
  for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) ticks.push(t);

  const grid = ticks
    .map(
      (t) =>
        `<line class="grid" x1="${sx(t)}" y1="${PLOT.top}" x2="${sx(t)}" y2="${PLOT.top + PLOT.size}"/>` +
        `<line class="grid" x1="${PLOT.left}" y1="${sy(t)}" x2="${PLOT.left + PLOT.size}" y2="${sy(t)}"/>` +
        `<text class="tick" x="${sx(t)}" y="${PLOT.top + PLOT.size + 18}" text-anchor="middle">${f1(t)}</text>` +
        `<text class="tick" x="${PLOT.left - 10}" y="${sy(t) + 4}" text-anchor="end">${f1(t)}</text>`,
    )
    .join("");

  // Points, plus direct labels for the skin-relevant family and the two pattern stimuli (collision-avoiding).
  const dots = [...rs].sort((a, b) => a.observedDb - b.observedDb);
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const centres = dots.map((r) => ({ x: sx(r.observedDb), y: sy(r.predictedDb) }));
  const hits = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0) ||
    centres.some((c) => c.x > b.x0 - 7 && c.x < b.x1 + 7 && c.y > b.y0 - 7 && c.y < b.y1 + 7);

  const marks = dots
    .map((r, i) => {
      const { x, y } = centres[i];
      const g = groupOf(r);
      let label = "";
      if (g === "skin" || g === "pattern") {
        const text = `#${r.id}`;
        const tw = text.length * 6.4;
        // Near candidates first; the far ones (below-right of the dense cluster) get a leader line.
        const cands = [
          [9, 4],
          [-9 - tw, 4],
          [-tw / 2, -10],
          [-tw / 2, 17],
          [9, -9],
          [-9 - tw, -9],
          [9, 17],
          [-9 - tw, 17],
          [24, 34],
          [-24 - tw, -26],
          [24, -26],
          [-24 - tw, 34],
          [40, 50],
          [-40 - tw, -42],
        ];
        for (const [dx, dy] of cands) {
          const box = { x0: x + dx, y0: y + dy - 10, x1: x + dx + tw, y1: y + dy + 3 };
          if (box.x0 < PLOT.left || box.x1 > PLOT.left + PLOT.size || box.y0 < PLOT.top || box.y1 > PLOT.top + PLOT.size) continue;
          if (!hits(box)) {
            placed.push(box);
            const far = Math.abs(dx) > 20 || Math.abs(dy) > 20;
            const lx = dx > 0 ? box.x0 - 2 : box.x1 + 2;
            const leader = far ? `<line class="leader" x1="${x}" y1="${y}" x2="${lx}" y2="${box.y0 + 7}"/>` : "";
            label = `${leader}<text class="dlabel" x="${x + dx}" y="${y + dy}">${text}</text>`;
            break;
          }
        }
      }
      const tip = `#${r.id} ${r.name}: observed ${f1(r.observedDb)} dB (observer SD ${r.observerSdDb.toFixed(1)}), predicted ${f1(r.predictedDb)} dB, error ${signed(r.errorDb)} dB`;
      return `<g><title>${esc(tip)}</title>${marker(shapeOf(r), x, y, `dot s-${g}`)}${label}</g>`;
    })
    .join("");

  // Legend: one row per group; the first row also names the four shapes.
  const legend = GROUPS.map((g, i) => {
    const y = 104 + i * 22;
    const swatch = marker("circle", 48, y - 4, `dot s-${g.id}`);
    let extra = "";
    if (g.id === "skin") {
      const items: [Shape, string][] = [
        ["circle", "blob"],
        ["square", "disk"],
        ["diamond", "line, dipole"],
        ["triangle", "edge"],
      ];
      let x = 250;
      extra = items
        .map(([s, t]) => {
          const out = marker(s, x, y - 4, "dot s-skin") + `<text class="legend muted" x="${x + 11}" y="${y}">${t}</text>`;
          x += 11 + t.length * 6.6 + 16;
          return out;
        })
        .join("");
    }
    return `${swatch}<text class="legend" x="62" y="${y}">${esc(g.label)}</text>${extra}`;
  }).join("");

  const excl = report.excluded.map((e) => `#${e.id} ${e.name.split(" x ")[0]}`).join("; ");
  const yEqX = `<line class="ref" x1="${sx(lo)}" y1="${sy(lo)}" x2="${sx(hi)}" y2="${sy(hi)}"/>` +
    `<text class="legend muted" x="${sx(hi) - 8}" y="${sy(hi) + 18}" text-anchor="end">y = x</text>`;

  const summary = `${detectorLabel} detector, ${report.nAll} analytic stimuli. RMS error ${report.rmsAllDb.toFixed(2)} dB over all, ${report.rmsSkinDb.toFixed(2)} dB over the ${report.nSkin} skin-relevant shapes.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">ModelFest: predicted versus observed detection thresholds</title>
<desc id="d">${esc(summary)} Points on the line are perfect predictions; points above it mean the model needs more contrast than observers did. Per-stimulus values are in modelfest.json.</desc>
<style>
  svg { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .bg { fill: #fcfcfb; }
  .title { fill: #0b0b0b; font-size: 18px; font-weight: 600; }
  .sub, .legend, .axt, .dlabel { fill: #52514e; }
  .sub { font-size: 13px; }
  .legend, .axt { font-size: 12.5px; }
  .dlabel { font-size: 11.5px; }
  .muted, .tick, .note { fill: #898781; }
  .tick, .note { font-size: 11.5px; }
  .tick { font-variant-numeric: tabular-nums; }
  .grid { stroke: #e1e0d9; stroke-width: 1; }
  .leader { stroke: #c3c2b7; stroke-width: 1; }
  .axis { stroke: #c3c2b7; stroke-width: 1; }
  .ref { stroke: #898781; stroke-width: 2; stroke-linecap: round; }
  .dot { stroke: #fcfcfb; stroke-width: 2; paint-order: stroke; }
  .s-skin { fill: #2a78d6; } .s-gabor { fill: #eb6834; } .s-pattern { fill: #1baf7a; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #1a1a19; }
    .title { fill: #f0efec; }
    .sub, .legend, .axt, .dlabel { fill: #c3c2b7; }
    .muted, .tick, .note { fill: #898781; }
    .grid { stroke: #2c2c2a; }
    .leader { stroke: #383835; }
    .axis { stroke: #383835; }
    .dot { stroke: #1a1a19; }
    .s-skin { fill: #3987e5; } .s-gabor { fill: #d95926; } .s-pattern { fill: #199e70; }
  }
</style>
<rect class="bg" width="${W}" height="${H}"/>
<text class="title" x="40" y="38">ModelFest: predicted vs observed thresholds</text>
<text class="sub" x="40" y="62">${esc(summary)}</text>
${legend}
${grid}
<line class="axis" x1="${PLOT.left}" y1="${PLOT.top + PLOT.size}" x2="${PLOT.left + PLOT.size}" y2="${PLOT.top + PLOT.size}"/>
<line class="axis" x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.left}" y2="${PLOT.top + PLOT.size}"/>
${yEqX}
${marks}
<text class="axt" x="${PLOT.left + PLOT.size / 2}" y="${PLOT.top + PLOT.size + 44}" text-anchor="middle">Observed threshold, mean of 16 observers (dB; lower = more sensitive)</text>
<text class="axt" transform="translate(26 ${PLOT.top + PLOT.size / 2}) rotate(-90)" text-anchor="middle">Predicted threshold (dB)</text>
<text class="note" x="40" y="${H - 52}">Above the line: the model needs more contrast than observers did. Below: it predicts the feature as easier to see.</text>
<text class="note" x="40" y="${H - 34}">Not predicted (random or photographic, not parametric): ${esc(excl)}.</text>
<text class="note" x="40" y="${H - 16}">Observed: ModelFest baseline data, Watson &amp; Ahumada 2005, J. Vision 5(9):6. Per-stimulus table: modelfest.json.</text>
</svg>
`;
}
