import { describe, expect, test } from "vitest";
import { describeConcern, describeWorthIt, orderReliefFirst, stepBackCounter, summaryLine, youcamScoreOf } from "@/lib/copy";
import { lintText } from "@/lib/copy/lint";
import { buildSentences } from "./sentences";
import { DEMO_IDS, loadBundle } from "./demo";
import { buildResultsData } from "./viewModel";
import type { ReadingBundle } from "./types";

const bundles = DEMO_IDS.map((id) => [id, loadBundle(id)!] as const);

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe("demo bundles", () => {
  test.each(bundles)("%s is a real reading: labelled synthetic, with measurements, a report and sentences", (id, bundle) => {
    expect(bundle).toBeTruthy();
    expect(`${bundle.label} ${bundle.description}`.toLowerCase()).toContain("synthetic");
    expect(bundle.source).toBe("demo");
    expect(bundle.measurements.features.length).toBeGreaterThan(100);
    expect(bundle.report.concerns.length).toBeGreaterThanOrEqual(5);
    expect(bundle.scale.source).toBe("iris");
    expect(Object.keys(bundle.sentences.concerns).sort()).toEqual(bundle.report.concerns.map((c) => c.concern).sort());
    expect(bundle.worthIt.length).toBeGreaterThanOrEqual(5);
    expect(id).toBe(bundle.id);
  });

  test.each(bundles)("%s: the stored sentences are what lib/copy says about the stored numbers", (_id, bundle) => {
    const fresh = buildSentences(bundle.report, bundle.analysis, bundle.worthIt);
    expect(bundle.sentences).toEqual(fresh);
  });

  test.each(bundles)("%s: no stored or derived string breaks the content rules", (_id, bundle) => {
    const data = buildResultsData(bundle);
    const text = [...strings(bundle.sentences), ...strings(data.concerns), ...strings(data.coverage), ...strings(data.worthIt), ...strings(data.share), ...strings(data.outOfScope)];
    for (const s of text) expect(lintText(s), s).toEqual([]);
  });
});

describe("buildResultsData", () => {
  const p2b = loadBundle("p2b")!;

  test("concern order and tone are lib/copy's, not the UI's", () => {
    const data = buildResultsData(p2b);
    const expected = orderReliefFirst(p2b.report.concerns).map((c) => c.concern);
    expect(data.concerns.map((c) => c.concern)).toEqual(expected);
    for (const c of data.concerns) {
      const cv = p2b.report.concerns.find((x) => x.concern === c.concern)!;
      const described = describeConcern(cv, { youcamScore: youcamScoreOf(p2b.analysis.results, c.concern) });
      expect(c.headline).toBe(described.headline);
      expect(c.detail).toBe(described.detail);
      expect(c.tone).toBe(described.tone);
    }
  });

  test("regions carry the soft-area framing and YouCam's score line", () => {
    const dark = buildResultsData(p2b).concerns.find((c) => c.concern === "dark_circle")!;
    expect(dark.detail).toMatch(/large, soft area/i);
    expect(dark.detail).toMatch(/YouCam rates yours \d+\/100/);
  });

  test("the share summary and the Step back counter come from lib/copy", () => {
    const data = buildResultsData(p2b);
    expect(data.summary).toBe(summaryLine(p2b.report));
    const pores = p2b.report.concerns.find((c) => c.concern === "pore")!;
    expect(stepBackCounter(pores, 1)).toMatch(/^At most \d+ of 649 pores detectable from here$/);
    expect(data.share.lines.length).toBe(3);
  });

  test("Worth it? lists every improved concern with the half-strength credit and a simulation image", () => {
    const view = buildResultsData(p2b).worthIt!;
    expect(view.state).toBe("ready");
    expect(view.items.map((i) => i.concern).sort()).toEqual(["acne", "age_spot", "dark_circle", "eye_bag", "pore", "wrinkle"]);
    for (const item of view.items) {
      expect(item.detail).toContain("YouCam Skin Simulation, half strength");
      expect(item.afterImage).toMatch(/^\/demo\/p2b\/sim-[ab]\.jpg$/);
      const w = p2b.worthIt.find((x) => x.concern === item.concern)!;
      expect(item.headline).toBe(
        describeWorthIt({
          concern: item.concern,
          targetCount: w.targetCount,
          differenceMaxDistanceM: w.whatIf.differenceMaxDistanceM ?? 0,
          differenceProfile: w.whatIf.differenceProfile,
        }).headline,
      );
    }
    const far = view.items.map((i) => i.whatIf.differenceMaxDistanceM ?? 0);
    expect(far).toEqual([...far].sort((a, b) => b - a));
  });

  test("coverage covers dark spots, pores and breakouts on a recorded face, with honest sentences", () => {
    const view = buildResultsData(p2b).coverage!;
    expect(view.targetM).toBe(1.5);
    expect(view.options.map((o) => o.concern)).toEqual(["age_spot", "pore", "acne"]);
    for (const o of view.options) {
      expect(o.state).toBe("ready");
      expect(o.plan).toBeTruthy();
      expect(o.headline).toMatch(/at most \d+ of/i);
      if (o.plan!.chosen) expect(o.afterImage).toMatch(/^\/demo\/p2b\/coverage-/);
    }
  });

  test("a face without recorded renders has no coverage section; receipts exist for every concern", () => {
    const p5a = buildResultsData(loadBundle("p5a")!);
    expect(p5a.coverage).toBeNull();
    for (const [, bundle] of bundles) {
      const data = buildResultsData(bundle);
      expect(data.receipts.length).toBe(data.concerns.length);
      for (const r of data.receipts) {
        const known = [...bundle.measurements.features, ...bundle.measurements.regions].some((t) => t.id === r.targetId);
        expect(known).toBe(true);
        expect(r.outline.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("a live bundle waiting for its simulation shows pending, and coverage is offered on request", () => {
    const live: ReadingBundle = { ...p2b, source: "live", worthIt: [], coverageEntries: [], coverage: [], whatIfs: [], sentences: { ...p2b.sentences, worthIt: {} } };
    const waiting = buildResultsData(live, { worthIt: { state: "pending" } });
    expect(waiting.worthIt?.state).toBe("pending");
    expect(waiting.coverage!.options.every((o) => o.state === "idle" && o.plan === null)).toBe(true);
    const running = buildResultsData(live, { coverage: { pore: { state: "running" } } });
    expect(running.coverage!.options.find((o) => o.concern === "pore")!.state).toBe("running");
    expect(waiting.provenance).toMatch(/Your photo/);
    expect(live.source === "live" && buildResultsData(live).source).toBe("live");
  });

  test("an enlarged photo, a standard-detail analysis and replay mode each say so", () => {
    const upscaled = buildResultsData({ ...p2b, source: "live", capture: { upscaled: true, upscale: 1.9, engine: "hd" } });
    expect(upscaled.notices.join(" ")).toMatch(/enlarged/);
    const sd = buildResultsData({ ...p2b, source: "live", capture: { upscaled: false, engine: "sd" } });
    expect(sd.notices.join(" ")).toMatch(/pores and breakouts get no distance/);
    expect(buildResultsData({ ...p2b, source: "replay" }).notices.join(" ")).toMatch(/Replay mode/);
  });
});
