import { describe, expect, test } from "vitest";
import { describeConcern, describeWorthIt, orderReliefFirst, stepBackCounter, summaryLine } from "@/lib/copy";
import { lintText } from "@/lib/copy/lint";
import { buildSentences, worthItInput } from "./sentences";
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
    const fresh = buildSentences(bundle.report, bundle.worthIt);
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
      const described = describeConcern(cv);
      expect(c.headline).toBe(described.headline);
      // The coverage hook and the mark-safety line moved out of the detail into fields of their own.
      expect(described.detail.startsWith(c.detail)).toBe(true);
      expect(c.detail).not.toMatch(/lightest touch|ask a doctor or pharmacist/);
      expect(c.safety).toBe(described.safety);
      expect(c.tone).toBe(described.tone);
    }
  });

  test("soft areas state no distance, and the UI's flag agrees with the sentence lib/copy wrote", () => {
    for (const [, bundle] of bundles) {
      for (const c of buildResultsData(bundle).concerns) {
        expect(c.soft, `${bundle.id} ${c.concern}: ${c.headline}`).toBe(/carr(y|ies) far, on every face/.test(c.headline));
        if (c.soft) {
          expect(c.detail).toMatch(/large, soft area|broad area/i);
          expect(c.keyLine).toBe("A large, soft area");
          expect(c.detail + c.headline).not.toMatch(/\d+ ?(m|cm)\b/);
        }
      }
    }
    // The YouCam N/100 score line is gone from every card.
    for (const c of buildResultsData(p2b).concerns) expect(c.detail).not.toMatch(/YouCam rates|higher is healthier|\/100/);
  });

  test("the main surface carries words, not counts: those live in the receipts", () => {
    for (const [, bundle] of bundles) {
      const data = buildResultsData(bundle);
      const surface = [
        ...data.concerns.flatMap((c) => [c.headline, c.detail, c.keyLine, c.explainer, c.confidence]),
        ...data.share.lines.map((l) => l.sentence),
        ...(data.worthIt?.items.flatMap((i) => [i.headline, i.detail]) ?? []),
        ...(data.coverage?.options.flatMap((o) => [o.headline, o.detail]) ?? []),
        data.summary,
      ];
      for (const text of surface) expect(text, text).not.toMatch(/\b\d+ of (your )?\d+\b|\(\d+%\)/);
    }
  });

  test("the share summary and the Step back counter come from lib/copy", () => {
    const data = buildResultsData(p2b);
    expect(data.summary).toBe(summaryLine(p2b.report));
    const pores = p2b.report.concerns.find((c) => c.concern === "pore")!;
    expect(stepBackCounter(pores, 0.25)).not.toMatch(/^All /);
    expect(stepBackCounter(pores, 6)).toBe("All of your pores are out of sight from here");
    expect(data.share.lines.length).toBe(3);
  });

  test("Worth it? lists every improved concern with the YouCam Skin Simulation credit and a simulation image", () => {
    const view = buildResultsData(p2b).worthIt!;
    expect(view.state).toBe("ready");
    expect(view.items.map((i) => i.concern).sort()).toEqual(["acne", "age_spot", "dark_circle", "eye_bag", "pore", "wrinkle"]);
    for (const item of view.items) {
      expect(item.detail).toContain("YouCam Skin Simulation");
      expect(`${item.headline} ${item.detail}`).not.toMatch(/half strength/i);
      expect(item.afterImage).toMatch(/^\/demo\/p2b\/sim-[ab]\.jpg$/);
      const w = p2b.worthIt.find((x) => x.concern === item.concern)!;
      expect(item.headline).toBe(describeWorthIt(worthItInput(w)).headline);
    }
    const far = view.items.map((i) => i.typicalM);
    expect(far).toEqual([...far].sort((a, b) => b - a));
    expect(view.items.find((i) => i.concern === "dark_circle")!.soft).toBe(true);
  });

  test("coverage covers dark spots, pores and breakouts on a recorded face, with honest sentences", () => {
    const view = buildResultsData(p2b).coverage!;
    expect(view.targetM).toBe(1.5);
    expect(view.options.map((o) => o.concern)).toEqual(["age_spot", "pore", "acne"]);
    for (const o of view.options) {
      expect(o.state).toBe("ready");
      expect(o.plan).toBeTruthy();
      expect(o.headline.length).toBeLessThanOrEqual(60);
      if (o.plan!.chosen) {
        expect(o.afterImage).toMatch(/^\/demo\/p2b\/coverage-/);
        expect(o.leverLabel).toMatch(/^foundation coverage \d+%$/);
      }
    }
  });

  test("the coverage hook shows only where the lightest touch has an option for that concern", () => {
    const withHooks = buildResultsData(p2b);
    const hooked = withHooks.concerns.filter((c) => c.hook);
    expect(hooked.length).toBeGreaterThan(0);
    for (const c of hooked) expect(withHooks.coverage!.options.some((o) => o.concern === c.concern)).toBe(true);
    // p5a has no recorded try-ons, so nothing points at a section that is not there.
    expect(buildResultsData(loadBundle("p5a")!).concerns.some((c) => c.hook)).toBe(false);
  });

  test("dark spots and breakouts keep the mark-safety line as a field of their own", () => {
    for (const [, bundle] of bundles) {
      for (const c of buildResultsData(bundle).concerns) {
        expect(Boolean(c.safety), `${bundle.id} ${c.concern}`).toBe(c.concern === "age_spot" || c.concern === "acne");
      }
    }
  });

  test("share cards are face-less relief lines from a closed vocabulary; an own photo never gets a face", () => {
    for (const [, bundle] of bundles) {
      const { share } = buildResultsData(bundle);
      expect(share.cardKey).toBe(bundle.id);
      expect(share.faceAllowed).toBe(true);
      expect(share.tag).toBe("Synthetic face (AI-generated)");
      expect(share.defaults.length).toBeLessThanOrEqual(3);
      for (const c of share.choices) {
        expect(c.text, c.text).toMatch(/^[A-Za-z -]+: (mostly )?out of sight (at conversation distance|across a table|across a room|beyond [\d.]+ ?c?m)$/);
        expect(lintText(c.text)).toEqual([]);
      }
    }
    const live = buildResultsData({ ...p2b, source: "live" });
    expect(live.share.cardKey).toBe("live");
    expect(live.share.faceAllowed).toBe(false);
    expect(live.share.tag).toBeNull();
    expect(live.alt).toBe("Your photo");
    expect(live.ownPhoto).toBe(true);
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
    expect(upscaled.notices.join(" ")).toMatch(/deleted from YouCam when you leave this page/);
    expect(upscaled.notices.join(" ")).toMatch(/We don't store your photo/);
    expect(upscaled.notices.join(" ")).toMatch(/simulated picture for up to 24 hours/);
    const sd = buildResultsData({ ...p2b, source: "live", capture: { upscaled: false, engine: "sd" } });
    expect(sd.notices.join(" ")).toMatch(/pores and breakouts get no distance/);
    expect(buildResultsData({ ...p2b, source: "replay" }).notices.join(" ")).toMatch(/Replay mode/);
  });
});
