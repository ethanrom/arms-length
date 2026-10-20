import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import {
  DEFAULT_VIEWING, MAX_DISTANCE_M, PROFILE_DISTANCES_M, type VisibilityReport,
} from "@/lib/contracts/vision";
import type { ConcernVisibilityExt } from "@/lib/vision/report";
import {
  BANNED_LISTS,
  BOUND_TO_NOMINAL_RATIO,
  CONCERN_COPY,
  COVERAGE_INTRO,
  COVERAGE_LEVER_CONCERNS,
  COVERAGE_TITLE,
  DISCLAIMERS,
  DISTANCE_ANCHORS,
  DOC_LISTS,
  MARK_SAFETY_LINE,
  MAX_HEADLINE_CHARS,
  UI_LISTS,
  WORTH_IT_CREDIT,
  anchorFor,
  boundFractionAt,
  concernTitle,
  coverageHook,
  describeConcern,
  describeCoverage,
  describeWorthIt,
  formatDistance,
  formatInterval,
  hasCoverageLever,
  nominalFractionAt,
  nominalMaxM,
  orderReliefFirst,
  profileAt,
  proxemicZone,
  reachM,
  receiptCounts,
  safetyLineFor,
  shareWord,
  stepBackCounter,
  stepBackShare,
  summaryLine,
  youcamScoreLine,
  youcamScoreOf,
} from "./index";
import { lintDocs, lintFiles, lintText } from "./lint";

const IDS = Object.keys(CONCERNS) as ConcernId[];

function cv(concern: ConcernId, d: number, o: Partial<ConcernVisibilityExt> = {}): ConcernVisibilityExt {
  return {
    concern,
    targetCount: 4,
    maxDistanceM: d,
    medianDistanceM: d / 2,
    intervalM: [d * 0.96, d * 1.04],
    topTargets: [],
    confidence: "high",
    ...o,
  };
}

/** A profile from counts at each PROFILE_DISTANCES_M entry. */
const profileOf = (total: number, counts: number[]): NonNullable<ConcernVisibilityExt["profile"]> =>
  PROFILE_DISTANCES_M.map((distanceM, i) => ({ distanceM, count: counts[i], fraction: counts[i] / total }));

/** A many-feature concern: counts at 0.25 / 0.3 / 0.6 / 1 / 1.5 / 2.5 / 4 / 6 m. */
function many(concern: ConcernId, total: number, counts: number[], o: Partial<ConcernVisibilityExt> = {}): ConcernVisibilityExt {
  const farthest = PROFILE_DISTANCES_M.filter((_, i) => counts[i] > 0).pop() ?? 0;
  return cv(concern, farthest, { targetCount: total, profile: profileOf(total, counts), ...o });
}

const report = (concerns: ConcernVisibilityExt[]): VisibilityReport => ({ viewing: DEFAULT_VIEWING, targets: [], concerns });

describe("distance", () => {
  test("formatDistance follows the rounding rules", () => {
    const cases: [number, string][] = [
      [0.4, "40 cm"],
      [0.43, "45 cm"],
      [0.01, "5 cm"],
      [0.98, "1 m"],
      [1.54, "1.5 m"],
      [2, "2 m"],
      [2.96, "3 m"],
      [4.4, "4 m"],
      [MAX_DISTANCE_M, "10 m+"],
      [50, "10 m+"],
      [0, "0 cm"],
    ];
    for (const [m, text] of cases) expect(formatDistance(m), String(m)).toBe(text);
    expect(() => formatDistance(NaN)).toThrow(RangeError);
  });

  test("formatInterval keeps units honest", () => {
    expect(formatInterval([0.35, 0.45])).toBe("35–45 cm");
    expect(formatInterval([0.8, 1.2])).toBe("80 cm–1.2 m");
    expect(formatInterval([4, 10])).toBe("4–10 m+");
    expect(formatInterval([0.4, 0.41])).toBe("40 cm");
  });

  test("anchorFor is locked to the anchor table", () => {
    const everyday = DISTANCE_ANCHORS.filter((a) => a.phrase !== null);
    expect(everyday.map((a) => a.phrase)).toEqual([
      "closer than arm's length",
      "at conversation distance",
      "across a table",
      "across a room",
    ]);
    for (const a of everyday) expect(anchorFor(a.m), a.id).toBe(a.phrase);
    // Log-scale boundaries: about 0.7 m, 1.2 m, 2.5 m.
    expect([0.4, 0.69, 0.72, 1.2, 1.23, 2, 2.4, 2.5, 10].map(anchorFor)).toEqual([
      "closer than arm's length",
      "closer than arm's length",
      "at conversation distance",
      "at conversation distance",
      "across a table",
      "across a table",
      "across a table",
      "across a room",
      "across a room",
    ]);
    expect(DISTANCE_ANCHORS.find((a) => a.id === "mirror")?.m).toBe(0.25);
    expect(DISTANCE_ANCHORS.find((a) => a.id === "selfie")?.m).toBe(0.3);
    for (const a of DISTANCE_ANCHORS) expect(a.source.length, a.id).toBeGreaterThan(10);
    expect([0.3, 0.45, 1.19, 1.2, 3.59, 3.6].map(proxemicZone)).toEqual(["intimate", "personal", "personal", "social", "social", "public"]);
  });
});

const NO_METRES = /\d\s?(?:cm|m)\b|\bmetres?\b|\bm\+/i;
const ABSOLUTES = /\b(?:nobody|never|promise|no one)\b/i;

describe("describeConcern", () => {
  test("relief is the bound, with the conditions in the sentence; visible is the typical observer", () => {
    expect(describeConcern(cv("pore", 0.4))).toEqual({
      headline: "Even perfect eyes couldn't pick out your pores past 40 cm.",
      detail: "Looking right at them in normal indoor light, even perfect eyes would need to be closer than 40 cm.",
      tone: "relief",
    });
    // Nominal 1.7 m (a typical eye) against a bound of 2.6 m: the visible side quotes the typical eye.
    const lines = describeConcern(cv("wrinkle", 2.6, { nominalMaxDistanceM: 1.7 }));
    expect(lines.headline).toBe("Your fine lines can be picked out from about 1.7 m.");
    expect(lines.detail).toMatch(/^That's across a table, for a typical sharp-eyed person looking right at them\./);
    expect(lines.tone).toBe("visible");
    // A report without nominal numbers estimates them from the bound (about 1.5 times shorter).
    expect(describeConcern(cv("wrinkle", 3)).headline).toBe("Your fine lines can be picked out from about 2 m.");
  });

  test("the lightest-touch pointer appears only for concerns with a lever", () => {
    for (const id of IDS.filter((i) => CONCERNS[i].visibility)) {
      const d = describeConcern(cv(id, 2, { nominalMaxDistanceM: 1.5 }));
      const them = CONCERN_COPY[id].agreement === "plural" ? "them" : "it";
      const hook = `See the lightest touch that puts ${them} out of sight, on a virtual try-on.`;
      expect(d.detail.includes(hook), id).toBe(hasCoverageLever(id) && d.tone === "visible");
    }
    expect(COVERAGE_LEVER_CONCERNS).toEqual(["age_spot", "pore", "acne"]);
    expect(describeConcern(cv("wrinkle", 2)).detail).not.toMatch(/lightest touch/);
    expect(describeConcern(cv("pore", 0.9)).detail).not.toMatch(/lightest touch/);
  });

  test("relief starts at conversation distance", () => {
    expect(describeConcern(cv("redness", 1)).tone).toBe("relief");
    expect(describeConcern(cv("redness", 1.05)).tone).toBe("visible");
    expect(describeConcern(cv("pore", 0.3)).headline).toBe("Even perfect eyes couldn't pick out your pores past 30 cm.");
    expect(describeConcern(cv("pore", 0.3)).detail).toContain("mirror and selfie distance");
    expect(describeConcern(cv("pore", 0)).headline).toBe("Even up close, perfect eyes couldn't pick out your pores.");
  });

  test("a relief bound uses the top of the interval, so the claim survives the error bars", () => {
    const d = describeConcern(cv("pore", 0.4, { intervalM: [0.38, 0.5] }));
    expect(d.detail).toContain("closer than 50 cm");
  });

  test("low confidence is said out loud", () => {
    expect(describeConcern(cv("pore", 0.4, { confidence: "low" })).detail).toContain(" This one is a rough estimate.");
    const low = describeConcern(cv("wrinkle", 2, { confidence: "low", intervalM: [1, 3] }));
    expect(low.detail).toContain("This one is a rough estimate: the range is about 1–3 m.");
    expect(describeConcern(cv("wrinkle", 2)).detail).not.toMatch(/rough/);
  });

  test("a capped distance is said as a place, with no instrument cap", () => {
    const capped = describeConcern(cv("wrinkle", MAX_DISTANCE_M, { nominalMaxDistanceM: MAX_DISTANCE_M }));
    expect(capped.headline).toBe("Fine lines can be picked out from across a room or farther.");
    expect(capped.detail).not.toMatch(/stop measuring|10 m/);
  });

  test("nothing found, and concerns that aren't about visibility", () => {
    const none = describeConcern(cv("pore", 0, { targetCount: 0 }));
    expect(none.headline).toBe("We didn't find any pores to measure.");
    expect(none.tone).toBe("relief");
    expect(none.safety).toBeUndefined();
    expect(describeConcern(cv("texture", 3)).headline).toBe("We don't give skin texture a distance.");
  });

  test("dark spots and breakouts carry the mark-safety line, in the detail and as a field; other concerns do not", () => {
    for (const id of ["age_spot", "acne"] as const) {
      for (const d of [0.3, 0.9, 2]) {
        const out = describeConcern(cv(id, d, { nominalMaxDistanceM: d / 1.5 }));
        expect(out.safety, `${id} ${d}`).toBe(MARK_SAFETY_LINE);
        expect(out.detail.endsWith(MARK_SAFETY_LINE), `${id} ${d}`).toBe(true);
      }
      const profiled = describeConcern(many(id, 40, [40, 40, 30, 20, 10, 2, 0, 0]));
      expect(profiled.detail.endsWith(MARK_SAFETY_LINE)).toBe(true);
    }
    expect(MARK_SAFETY_LINE).toBe(
      "This measures how visible a mark is, not what it is. If one is new, changing or worrying you, ask a doctor or pharmacist.",
    );
    for (const id of IDS.filter((i) => i !== "age_spot" && i !== "acne")) {
      expect(describeConcern(cv(id, 2)).safety, id).toBeUndefined();
      expect(describeConcern(cv(id, 2)).detail, id).not.toMatch(/doctor|pharmacist/);
    }
  });
});

describe("large soft areas", () => {
  test("under-eye areas lead with the universal fact and never state a distance", () => {
    const shadows = describeConcern(cv("dark_circle", MAX_DISTANCE_M), { youcamScore: 69 });
    expect(shadows.headline).toBe("Under-eye shadows carry far, on every face.");
    expect(shadows.detail).toBe(
      "Under-eye shadows are a large, soft area; on everyone, they're among the last things to fade with distance. " +
        "That says how big the area is, not how much there is.",
    );
    const bags = describeConcern(cv("eye_bag", 6));
    expect(bags.headline).toBe("Under-eye puffiness carries far, on every face.");
    expect(bags.detail).toMatch(/^Under-eye puffiness is a large, soft area; on everyone, it's among the last things to fade with distance\./);
    // Whatever the measured distance, as long as it isn't a relief.
    for (const id of ["dark_circle", "eye_bag"] as const) {
      for (const d of [1.1, 2, 4, 8, MAX_DISTANCE_M]) {
        for (const confidence of ["high", "low"] as const) {
          const out = describeConcern(cv(id, d, { confidence, intervalM: [d * 0.5, d] }));
          expect(`${out.headline} ${out.detail}`, `${id} ${d} ${confidence}`).not.toMatch(NO_METRES);
          expect(out.tone).toBe("visible");
        }
      }
    }
  });

  test("redness is soft only when large; a small patch keeps its (typical-eye) distance", () => {
    expect(describeConcern(cv("redness", 2, { nominalMaxDistanceM: 1.4 })).headline).toBe("Your redness can be picked out from about 1.4 m.");
    const broad = describeConcern(cv("redness", 8, { nominalMaxDistanceM: 5 }));
    expect(broad.headline).toBe("Redness over a broad area carries far, on every face.");
    expect(`${broad.headline} ${broad.detail}`).not.toMatch(NO_METRES);
    // Other concerns never get the soft-area wording.
    expect(describeConcern(cv("wrinkle", 8)).detail).not.toMatch(/soft area/);
  });

  test("the YouCam N/100 rating is gone from the cards", () => {
    expect(youcamScoreLine(69)).toBe("");
    expect(describeConcern(cv("pore", 0.4), { youcamScore: 92 }).detail).not.toMatch(/YouCam|\/100|healthier/);
    expect(describeConcern(cv("wrinkle", 2), { youcamScore: 53 }).detail).not.toMatch(/YouCam|\/100|healthier/);
    const results = [
      { concern: "dark_circle" as const, region: "left", rawScore: 1, uiScore: 40, maskRef: null },
      { concern: "dark_circle" as const, region: "whole", rawScore: 1, uiScore: 69, maskRef: null },
    ];
    expect(youcamScoreOf(results, "dark_circle")).toBe(69);
    expect(youcamScoreOf(results, "pore")).toBeUndefined();
  });
});

describe("shareWord", () => {
  test("buckets a share into plain words; 'all' only at exactly 1", () => {
    const cases: [number, string][] = [
      [0, "none"],
      [0.001, "a few"],
      [0.04, "a few"],
      [0.05, "a small share"],
      [0.12, "a small share"],
      [0.2, "some"],
      [0.3, "some"],
      [0.35, "about a third"],
      [0.5, "about half"],
      [0.58, "about half"],
      [0.7, "most"],
      [0.92, "most"],
      [0.9985, "nearly all"],
      [1, "all"],
    ];
    for (const [share, word] of cases) expect(shareWord(share), String(share)).toBe(word);
  });
});

describe("nominal first, bound for relief", () => {
  // p2b-like: the bound (perfect eyes) reaches half the pores at a table; a typical eye, about a fifth.
  const bound = [649, 649, 600, 472, 342, 86, 5, 0];
  const nominal = [649, 640, 500, 300, 120, 20, 0, 0];
  const pores = many("pore", 649, bound, { nominalProfile: profileOf(649, nominal), nominalMaxDistanceM: 2.7 });

  test("the visible headline reads the nominal profile at a table, in words", () => {
    const out = describeConcern(pores);
    expect(out.tone).toBe("visible");
    expect(out.headline).toBe("Some of your pores can be seen from across a table.");
    expect(out.detail).toMatch(/^A typical sharp-eyed person looking right at them could pick out some of your pores from across a table\./);
    // The words follow the nominal profile, not the bound: a typical eye picking out hardly any reads "a few".
    const keen = describeConcern({ ...pores, nominalProfile: profileOf(649, [649, 640, 500, 300, 5, 0, 0, 0]) });
    expect(keen.headline).toBe("A few of your pores can be seen from across a table.");
    // With no nominal numbers they are estimated from the bound (1.5 m reads like 2.25 m on the bound).
    expect(describeConcern({ ...pores, nominalProfile: undefined, nominalMaxDistanceM: undefined }).headline).toBe(
      "Some of your pores can be seen from across a table.",
    );
  });

  test("the relief headline is out of sight in words; the detail gives the bound and its conditions", () => {
    const relief = many("pore", 649, [649, 649, 600, 300, 9, 2, 0, 0], { nominalProfile: profileOf(649, [649, 640, 400, 100, 1, 0, 0, 0]) });
    expect(describeConcern(relief)).toEqual({
      headline: "Nearly all of your pores are out of sight across a table.",
      detail:
        "Looking right at them in normal indoor light, even perfect eyes could pick out only a few of your pores from across a table. " +
        "Closer, at 1 m, perfect eyes could pick out about half of them.",
      tone: "relief",
    });
    const none = describeConcern(many("pore", 656, [656, 600, 300, 40, 0, 0, 0, 0]));
    expect(none.headline).toBe("Even perfect eyes couldn't pick out pores across a table.");
    expect(none.detail).toMatch(/^Looking right at them in normal indoor light, even perfect eyes couldn't pick out any of your pores from across a table\./);
  });

  test("when a typical eye sees none but perfect eyes could, it says so and keeps the visible tone", () => {
    const edge = many("pore", 100, [100, 100, 90, 60, 30, 5, 0, 0], { nominalProfile: profileOf(100, [100, 90, 40, 5, 0, 0, 0, 0]) });
    const out = describeConcern(edge);
    expect(out.tone).toBe("visible");
    expect(out.headline).toBe("Hardly any of your pores can be seen across a table.");
    expect(out.detail).toContain("Sharper eyes could pick out some of them.");
  });

  test("every proportion is a word, never a count", () => {
    for (const x of [pores, many("age_spot", 600, [600, 600, 590, 500, 200, 100, 20, 0]), many("acne", 5, [5, 5, 5, 5, 5, 1, 0, 0])]) {
      const out = describeConcern(x);
      expect(out.headline, x.concern).not.toMatch(/\d/);
      expect(out.detail.replace(/\d+ m\b/g, ""), x.concern).not.toMatch(/\d/);
    }
  });
});

describe("describeConcern from the detectability profile", () => {
  const spots = many("age_spot", 600, [600, 600, 600, 590, 400, 200, 60, 5], {
    nominalProfile: profileOf(600, [600, 600, 590, 500, 200, 100, 20, 0]),
  });

  test("visible: the share across a table in words, with a second look from across a room", () => {
    const out = describeConcern(spots);
    expect(out.headline).toBe("About a third of your dark spots can be seen across a table.");
    expect(out.detail).toBe(
      "A typical sharp-eyed person looking right at them could pick out about a third of your dark spots from across a table. " +
        "From across a room, a few could still be picked out. " +
        "See the lightest touch that puts them out of sight, on a virtual try-on. " +
        MARK_SAFETY_LINE,
    );
    const all = describeConcern(many("acne", 5, [5, 5, 5, 5, 5, 1, 0, 0], { nominalProfile: profileOf(5, [5, 5, 5, 5, 5, 0, 0, 0]) }));
    expect(all.headline).toBe("All of your breakouts can be seen from across a table.");
    expect(all.detail).toMatch(/^A typical sharp-eyed person looking right at them could pick out all of your breakouts from across a table/);
  });

  test("the boundary: 10% or less across a table (the bound) is relief, more is not", () => {
    expect(describeConcern(many("pore", 100, [100, 100, 90, 40, 10, 2, 0, 0])).tone).toBe("relief");
    const over = describeConcern(many("pore", 100, [100, 100, 90, 40, 11, 2, 0, 0]));
    expect(over.tone).toBe("visible");
  });

  test("regions, and concerns with fewer than 5 targets, keep the single-distance wording", () => {
    const circles = many("dark_circle", 8, [8, 8, 8, 8, 8, 8, 0, 0]);
    expect(describeConcern({ ...circles, maxDistanceM: 2 }).headline).toBe("Under-eye shadows carry far, on every face.");
    expect(describeConcern(many("redness", 6, [6, 6, 0, 0, 0, 0, 0, 0], { maxDistanceM: 0.4 })).headline).toBe(
      "Even perfect eyes couldn't pick out your redness past 40 cm.",
    );
    const few = many("pore", 4, [4, 4, 4, 0, 0, 0, 0, 0], { maxDistanceM: 0.8 });
    expect(describeConcern(few).headline).toBe("Even perfect eyes couldn't pick out your pores past 80 cm.");
    expect(describeConcern(few).detail).toBe("Looking right at them in normal indoor light, even perfect eyes would need to be closer than 80 cm.");
  });

  test("a rough estimate is said out loud on both sides", () => {
    const relief = many("pore", 656, [656, 656, 600, 300, 9, 2, 0, 0]);
    expect(describeConcern({ ...relief, confidence: "low" }).detail).toContain("This one is a rough estimate");
    expect(describeConcern({ ...spots, confidence: "low" }).detail).toContain("This one is a rough estimate");
  });

  test("profileAt and reachM read the profile on a log axis", () => {
    const p = many("pore", 656, [656, 656, 600, 300, 9, 2, 0, 0]).profile!;
    expect(profileAt(p, 1)).toEqual({ count: 300, fraction: 300 / 656 });
    // The geometric mean of 0.6 and 1 m is halfway on a log axis.
    expect(profileAt(p, Math.sqrt(0.6)).count).toBeCloseTo(450, 6);
    expect(profileAt(p, 0.05).count).toBe(656);
    expect(profileAt(p, 50).count).toBe(0);
    // 10% of 656 sits between 1 m (45.7%) and 1.5 m (1.4%).
    const reach = reachM(p, 0.1);
    expect(reach).toBeGreaterThan(1);
    expect(reach).toBeLessThan(1.5);
    expect(profileAt(p, reach).fraction).toBeCloseTo(0.1, 6);
    expect(reachM(profileOf(10, [10, 10, 10, 10, 10, 10, 10, 10]), 0.1)).toBe(6);
    expect(reachM(profileOf(10, [0, 0, 0, 0, 0, 0, 0, 0]), 0.1)).toBe(0.1);
  });

  test("a report with no nominal numbers estimates them from the bound, never above it", () => {
    const p = many("age_spot", 100, [100, 100, 90, 60, 40, 20, 5, 0]);
    expect(nominalMaxM(cv("pore", 3))).toBeCloseTo(3 / BOUND_TO_NOMINAL_RATIO, 12);
    for (const d of [0.3, 0.6, 1, 1.5, 3, 6]) expect(nominalFractionAt(p, d), String(d)).toBeLessThanOrEqual(boundFractionAt(p, d) + 1e-12);
    expect(nominalFractionAt(p, 1)).toBeCloseTo(profileAt(p.profile!, 1.5).fraction, 12);
    // A real nominal profile wins.
    expect(nominalFractionAt({ ...p, nominalProfile: profileOf(100, [100, 50, 10, 1, 0, 0, 0, 0]) }, 0.6)).toBeCloseTo(0.1, 12);
  });
});

describe("stepBackCounter and stepBackShare", () => {
  const pores = many("pore", 656, [656, 656, 600, 300, 9, 2, 0, 0], {
    nominalProfile: profileOf(656, [656, 600, 400, 100, 2, 0, 0, 0]),
  });

  test("the counter is an out-of-sight framing in words", () => {
    expect(stepBackCounter(pores, 0.25)).toBe("None of your pores are out of sight yet");
    expect(stepBackCounter(pores, 0.6)).toBe("About a third of your pores are out of sight from here");
    expect(stepBackCounter(pores, 1)).toBe("Most of your pores are out of sight from here");
    expect(stepBackCounter(pores, 1.5)).toBe("Nearly all of your pores are out of sight from here");
    // "All" is a bound claim: only where even perfect eyes couldn't pick out any (the bound hits zero by 4 m).
    expect(stepBackCounter(pores, 4)).toBe("All of your pores are out of sight from here");
    expect(stepBackCounter(pores, 2.5)).toBe("Nearly all of your pores are out of sight from here");
    for (const d of [0.25, 0.4, 0.7, 1, 1.2, 1.5, 2, 3, 5, 8]) expect(stepBackCounter(pores, d), String(d)).not.toMatch(/\d/);
  });

  test("the share is the out-of-sight fraction for a bar: 0..1, never falling as you step back", () => {
    const shares = [0.1, 0.25, 0.4, 0.7, 1, 1.2, 1.5, 2, 3, 5, 8].map((d) => stepBackShare(pores, d));
    expect(shares[0]).toBe(0);
    expect(shares[shares.length - 1]).toBe(1);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
    for (const s of shares) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    expect(stepBackShare(pores, 1)).toBeCloseTo(1 - 100 / 656, 12);
    // Halfway between 0.6 m (400) and 1 m (100) on a log axis: 250.
    expect(stepBackShare(pores, Math.sqrt(0.6))).toBeCloseTo(1 - 250 / 656, 6);
    // Nothing measured, or not a visibility concern: no bar.
    expect(stepBackShare(cv("pore", 0, { targetCount: 0 }), 1)).toBe(0);
    expect(stepBackShare(cv("texture", 3), 1)).toBe(0);
  });

  test("single areas and single marks get a yes or no; a typical eye decides 'can still', the bound 'out of sight'", () => {
    const circles = many("dark_circle", 2, [2, 2, 2, 2, 2, 2, 2, 2]);
    expect(stepBackCounter(circles, 3)).toBe("Your under-eye shadows can still be picked out from here");
    expect(stepBackCounter(many("age_spot", 1, [1, 1, 1, 0, 0, 0, 0, 0]), 0.5)).toBe("Your dark spot can still be picked out from here");
    const redness = cv("redness", 3, { nominalMaxDistanceM: 2 });
    expect(stepBackCounter(redness, 1.5)).toBe("Your redness can still be picked out from here");
    expect(stepBackCounter(redness, 2.5)).toBe("Your redness is most likely out of sight from here");
    expect(stepBackCounter(redness, 5)).toBe("Your redness is out of sight from here");
    expect(stepBackShare(redness, 1.5)).toBe(0);
    expect(stepBackShare(redness, 5)).toBe(1);
    expect(stepBackCounter(cv("pore", 0, { targetCount: 0 }), 1)).toBe("We didn't find any pores to measure.");
    expect(stepBackCounter(cv("texture", 0), 1)).toBe("We don't give skin texture a distance.");
  });
});

describe("receiptCounts", () => {
  const pores = many("pore", 649, [649, 649, 600, 472, 342, 86, 5, 0], {
    nominalProfile: profileOf(649, [649, 640, 500, 300, 120, 20, 0, 0]),
  });

  test("exact counts, one row per distance, both observers", () => {
    const r = receiptCounts(pores)!;
    expect(r.rows.map((x) => [x.label, x.nominalCount, x.boundCount])).toEqual([
      ["1 m", 300, 472],
      ["1.5 m", 120, 342],
      ["4 m", 0, 5],
    ]);
    expect(r.rows[1].sentence).toBe(
      "At 1.5 m: about 120 of 649 pores for a typical sharp-eyed person looking right at them; at most 342 for even perfect eyes.",
    );
    expect(r.nominalEstimated).toBe(false);
    expect(r.safety).toBeNull();
    for (const row of r.rows) expect(row.nominalCount).toBeLessThanOrEqual(row.boundCount);
  });

  test("estimated nominal counts are flagged; marks carry the safety line; areas and empties have no counts", () => {
    expect(receiptCounts({ ...pores, nominalProfile: undefined })!.nominalEstimated).toBe(true);
    expect(receiptCounts(many("age_spot", 89, [89, 89, 80, 60, 30, 8, 0, 0]))!.safety).toBe(MARK_SAFETY_LINE);
    expect(receiptCounts(cv("redness", 3))).toBeNull();
    expect(receiptCounts(cv("pore", 0, { targetCount: 0, profile: profileOf(1, [0, 0, 0, 0, 0, 0, 0, 0]) }))).toBeNull();
  });
});

describe("describeWorthIt", () => {
  const w = (concern: ConcernId, d: number, o: Partial<Parameters<typeof describeWorthIt>[0]> = {}) =>
    describeWorthIt({ concern, targetCount: 1, differenceMaxDistanceM: d, ...o });

  test("a simulation of the picture, with the credit inside the sentence", () => {
    const near = w("pore", 0.4);
    expect(near.headline).toBe("A typical person wouldn't see the change beyond 40 cm.");
    expect(near.detail).toBe(
      "If your pores looked noticeably softer (YouCam Skin Simulation, half strength), a typical person wouldn't see the difference beyond 40 cm.",
    );
    expect(w("pore", 0.3).detail).toContain("That's a difference for the mirror, more than for anyone else.");
    expect(w("pore", 0.05).headline).toBe("A typical person wouldn't see the change, even up close.");
    expect(w("wrinkle", 2).detail).toMatch(/^If your fine lines looked noticeably softer \(YouCam Skin Simulation, half strength\), a typical sharp-eyed person looking right at them could see the difference from about 1\.3 m, /);
    for (const x of [near, w("age_spot", 3), w("dark_circle", 1)]) expect(x.detail).toContain(WORTH_IT_CREDIT);
  });

  test("the far side is the typical eye, estimated from the bound unless a nominal distance is given", () => {
    expect(w("age_spot", 3).headline).toBe("The change could show from about 2 m.");
    expect(w("age_spot", 3, { differenceNominalMaxDistanceM: 2.5 }).headline).toBe("The change could show from about 2.5 m.");
    expect(w("age_spot", 3, { differenceNominalMaxDistanceM: MAX_DISTANCE_M }).headline).toBe("The change could show from across a room or farther.");
  });

  test("large soft areas state no distance", () => {
    const far = w("dark_circle", MAX_DISTANCE_M);
    expect(far.headline).toBe("A large, soft area shows even a small change.");
    expect(far.detail).toBe(
      "Because it's a large area, even a small change can be seen from a distance. " +
        "If your under-eye shadows looked noticeably lighter (YouCam Skin Simulation, half strength), a typical person could tell the difference on any face.",
    );
    for (const id of ["dark_circle", "eye_bag"] as const) {
      for (const d of [1.6, 3, 8, MAX_DISTANCE_M]) {
        const out = w(id, d);
        expect(`${out.headline} ${out.detail}`, `${id} ${d}`).not.toMatch(NO_METRES);
      }
    }
  });

  test("many-feature concerns use words from the typical eye across a table", () => {
    const bound = profileOf(656, [656, 656, 600, 300, 12, 2, 0, 0]);
    const d = w("pore", 2.8, { targetCount: 656, differenceProfile: bound, differenceNominalProfile: profileOf(656, [656, 600, 300, 12, 0, 0, 0, 0]) });
    expect(d.headline).toBe("A typical person wouldn't see the change across a table.");
    const some = w("age_spot", 2.8, { targetCount: 89, differenceProfile: profileOf(89, [89, 89, 80, 70, 50, 20, 3, 0]), differenceNominalProfile: profileOf(89, [89, 85, 60, 40, 20, 2, 0, 0]) });
    expect(some.headline).toBe("The change could show on some of your dark spots.");
    expect(some.detail).toMatch(/could see the difference on some of your dark spots from across a table\.$/);
    // Nothing reaching a table is a near change, whatever the count.
    expect(w("pore", 1.2, { targetCount: 656, differenceProfile: profileOf(656, [656, 656, 600, 300, 0, 0, 0, 0]) }).headline).toBe(
      "A typical person wouldn't see the change beyond 1.2 m.",
    );
  });

  test("no 'half as', refine, calm or brighten, and no efficacy verbs, ever", () => {
    for (const id of IDS) {
      for (const d of [0, 0.05, 0.3, 1, 2, 4, MAX_DISTANCE_M]) {
        for (const targetCount of [0, 1, 656]) {
          const out = describeWorthIt({ concern: id, targetCount, differenceMaxDistanceM: d, differenceProfile: profileOf(Math.max(1, targetCount), PROFILE_DISTANCES_M.map((x) => (x <= d ? Math.max(1, targetCount) : 0))) });
          expect(`${out.headline} ${out.detail}`, `${id} ${d}`).not.toMatch(/half as|refin|calm|brighten|soften|smoothing|even out/i);
        }
      }
    }
  });

  test("nothing measured", () => {
    expect(w("acne", 0, { targetCount: 0 }).headline).toBe("There's no change to compare for this one.");
    expect(w("texture", 3).headline).toBe("There's no change to compare for this one.");
  });
});

describe("describeCoverage", () => {
  const step = (value: number, fractionAtTarget: number) => ({
    lever: { category: "foundation", field: "coverageIntensity", value },
    render: { imageRef: "", width: 1, height: 1, offset: { dx: 0, dy: 0 }, unitsCharged: 0, source: "replay" as const },
    maxDistanceM: 1,
    fractionAtTarget,
  });
  const plan = (o: Partial<Parameters<typeof describeCoverage>[0]>) => ({
    concern: "age_spot" as ConcernId,
    status: "met" as const,
    targetDistanceM: 1.5,
    chosen: null,
    steps: [],
    ...o,
  });

  test("the title and the intro name a virtual try-on", () => {
    expect(COVERAGE_TITLE).toBe("The lightest touch");
    expect(COVERAGE_INTRO).toMatch(/virtual try-on/);
  });

  test("met: at this coverage a typical person across a table wouldn't pick them out", () => {
    const out = describeCoverage(plan({ chosen: step(50, 0.05) }));
    expect(out.headline).toBe("A light layer is enough in the try-on.");
    expect(out.detail).toBe(
      "At about 50 on the try-on's scale, a typical person across a table wouldn't pick them out. " +
        "Checked on a virtual try-on; real makeup, shade and light will differ.",
    );
    expect(describeCoverage(plan({ reason: "already_met" })).detail).toBe("With no makeup at all, a typical person across a table wouldn't pick them out.");
    expect(describeCoverage(plan({ reason: "no_targets" })).headline).toBe("There's nothing to cover here.");
  });

  test("not met: the knee, most of the effect at 50% and more adds little", () => {
    const out = describeCoverage(plan({ status: "not_met", chosen: step(50, 0.25), steps: [step(50, 0.25), step(100, 0.2)] }));
    expect(out.headline).toBe("Most of the effect comes at 50%; more adds little.");
    expect(out.detail).toBe(
      "In the try-on, most of the effect arrives by about 50% coverage; more adds little. " +
        "Even at full coverage, sharp eyes could still pick out some of your dark spots from across a table. " +
        "Checked on a virtual try-on; real makeup, shade and light will differ.",
    );
    expect(describeCoverage(plan({ status: "not_met", reason: "no_effect" })).headline).toBe("Makeup didn't change this one in the try-on.");
  });

  test("no lever", () => {
    const out = describeCoverage(plan({ concern: "dark_circle", status: "no_lever", reason: "no_makeup_lever" }));
    expect(out.headline).toBe("No makeup setting we tried changed this one.");
    expect(out.detail).toContain("neither concealer nor foundation");
    expect(describeCoverage(plan({ concern: "wrinkle", status: "no_lever", reason: "lever_not_tested" })).headline).toBe("We haven't tested makeup on this one.");
  });

  test("every coverage sentence is clean, short in the headline and free of absolutes", () => {
    const sentences: string[] = [];
    const heads: string[] = [];
    for (const concern of IDS) {
      for (const status of ["met", "not_met", "no_lever"] as const) {
        for (const reason of [undefined, "already_met", "no_targets", "no_effect", "no_makeup_lever", "lever_not_tested", "not_a_visible_mark"]) {
          for (const chosen of [null, step(25, 0.05), step(50, 0.3), step(75, 0.12), step(100, 0.4)]) {
            for (const targetDistanceM of [1, 1.5, 4]) {
              const out = describeCoverage({ concern, status, reason, chosen, targetDistanceM, steps: chosen ? [chosen, step(100, 0.2)] : [] });
              heads.push(out.headline);
              sentences.push(out.headline, out.detail);
            }
          }
        }
      }
    }
    expect(sentences.flatMap((s) => lintText(s, UI_LISTS))).toEqual([]);
    expect(sentences.filter((s) => ABSOLUTES.test(s))).toEqual([]);
    expect(heads.filter((h) => h.length > MAX_HEADLINE_CHARS)).toEqual([]);
  });
});

describe("disclaimers", () => {
  test("short, linter-clean and unambiguous about what they are", () => {
    for (const [id, line] of Object.entries(DISCLAIMERS)) {
      expect(lintText(line, UI_LISTS), id).toEqual([]);
      expect(line.length, id).toBeLessThanOrEqual(150);
    }
    expect(DISCLAIMERS.estimate).toMatch(/estimate/);
    expect(DISCLAIMERS.estimate).toMatch(/not a guarantee/);
    expect(DISCLAIMERS.synthetic).toMatch(/Synthetic/);
    expect(DISCLAIMERS.simulation).toMatch(/^A simulation\./);
    expect(DISCLAIMERS.notHealth).toBe("Visibility, not health. Not health advice.");
    expect(DISCLAIMERS.privacy).not.toMatch(/delete|deleted|don't keep|never/i);
    expect(safetyLineFor("age_spot")).toBe(MARK_SAFETY_LINE);
    expect(safetyLineFor("acne")).toBe(MARK_SAFETY_LINE);
    expect(safetyLineFor("pore")).toBeNull();
  });
});

describe("one noun per concern", () => {
  test("the titles are the product's names, and each noun is its title in the lower case", () => {
    expect(IDS.map(concernTitle)).toEqual([
      "Breakouts", "Dark spots", "Pores", "Fine lines", "Under-eye shadows", "Under-eye puffiness", "Redness", "Skin texture",
    ]);
    for (const id of IDS) expect(CONCERN_COPY[id].title.toLowerCase(), id).toBe(CONCERN_COPY[id].plural.toLowerCase());
  });
});

describe("ordering and summary", () => {
  const pore = cv("pore", 0.4);
  const wrinkle = cv("wrinkle", 0.9);
  const redness = cv("redness", 4);
  const spots = cv("age_spot", 1.5);
  const none = cv("acne", 0, { targetCount: 0 });
  const texture = cv("texture", 0);

  test("relief first (closest first), then visible (most visible first), unmeasured last", () => {
    const input = [spots, none, redness, wrinkle, texture, pore];
    const out = orderReliefFirst(input);
    expect(out.map((c) => c.concern)).toEqual(["pore", "wrinkle", "redness", "age_spot", "acne", "texture"]);
    expect(input[0]).toBe(spots);
  });

  test("summaryLine covers the mixed, all-relief, all-visible and empty cases, relief first and with no absolutes", () => {
    expect(summaryLine(report([pore, redness]))).toBe("From a metre away, your pores are mostly out of sight, while your redness can still be picked out.");
    expect(summaryLine(report([redness, spots, pore]))).toBe(
      "From a metre away, your pores are mostly out of sight, while your redness and dark spots can still be picked out.",
    );
    expect(summaryLine(report([pore, wrinkle]))).toBe("From a metre away, your pores and fine lines are mostly out of sight.");
    expect(summaryLine(report([redness]))).toBe("From a metre away, a typical sharp-eyed person could pick out your redness.");
    expect(summaryLine(report([none, texture]))).toBe("We didn't find anything to measure this time.");
    expect(summaryLine(report([]))).toBe("We didn't find anything to measure this time.");
    expect(summaryLine(report([cv("redness", 4, { confidence: "low" }), pore]))).toContain("may still be picked out");
    expect(summaryLine(report([pore, cv("wrinkle", 0.9, { confidence: "low" })]))).toContain("are probably out of sight");
  });

  test("with profiles: grouped by the share across a table, and the sentence is about a table, not a metre", () => {
    const poresRelief = many("pore", 656, [656, 656, 600, 300, 9, 2, 0, 0]);
    const spotsVisible = many("age_spot", 600, [600, 600, 590, 500, 200, 100, 20, 0]);
    // Relief: the line (gone at 0.9 m, so none across a table) before 9 of 656. Visible: the whole concern before a third.
    const out = orderReliefFirst([spotsVisible, poresRelief, redness, wrinkle]);
    expect(out.map((c) => c.concern)).toEqual(["wrinkle", "pore", "redness", "age_spot"]);
    expect(summaryLine(report([poresRelief, redness]))).toBe(
      "From across a table, your pores are mostly out of sight, while your redness can still be picked out.",
    );
    expect(summaryLine(report([poresRelief, wrinkle]))).toBe("From across a table, your fine lines and pores are mostly out of sight.");
    expect(summaryLine(report([spotsVisible, redness]))).toBe(
      "From a metre away, a typical sharp-eyed person could pick out your redness and dark spots.",
    );
  });
});

describe("lint", () => {
  test("every banned entry is caught as a whole word, any case", () => {
    for (const [list, words] of Object.entries(BANNED_LISTS)) {
      for (const word of words) {
        for (const text of [`Some ${word} here`, `SOME ${word.toUpperCase()}!`]) {
          const hit = lintText(text, UI_LISTS).find((v) => v.word === word);
          expect(hit, `${list}: ${text}`).toMatchObject({ word, list, index: 5 });
        }
      }
    }
  });

  test("the panel's additions are on the lists, and the UI-only ones are skipped for docs", () => {
    for (const word of ["healthier", "nobody notices", "refine", "refining", "age spot", "acne mark"]) {
      expect(lintText(`about ${word}`, UI_LISTS).map((v) => v.word), word).toContain(word);
    }
    expect(lintText("Pores, nobody notices.").map((v) => v.word)).toEqual(["nobody notices"]);
    // The default is the core set; the UI-only words need UI_LISTS.
    expect(lintText("Your age spots, refining")).toEqual([]);
    expect(lintText("Age spots and acne marks", DOC_LISTS)).toEqual([]);
    expect(lintText("Refining by bisection, a healthier skin", DOC_LISTS).map((v) => v.word)).toEqual(["healthier"]);
    expect(lintText("Refining by bisection", UI_LISTS).map((v) => v.word)).toEqual(["refining"]);
  });

  test("does not flag look-alikes, and reports indexes in order", () => {
    expect(lintText("Secure, incurred, treaty, curiosity, a rxy code, flawlessly, a refinement, YouCam and Perfect Corp.")).toEqual([]);
    const text = "Skin care without a Treatment plan, or ANTI aging.";
    expect(lintText(text)).toEqual([
      { word: "treatment", list: "medical", index: text.indexOf("Treatment") },
      { word: "anti-aging", list: "shaming", index: text.indexOf("ANTI") },
    ]);
    expect(lintText("Not a problem area, and no Rx.").map((v) => v.word)).toEqual(["problem area", "rx"]);
  });

  test("lintFiles checks strings and JSX text, not identifiers or comments", async () => {
    const dir = await mkdtemp(join(tmpdir(), "copy-lint-"));
    try {
      await mkdir(join(dir, "ui"));
      await writeFile(
        join(dir, "ui", "a.tsx"),
        [
          "// a flaw in a comment is fine",
          "const condition = true;",
          'const a = "Hide the imperfection";',
          "export const B = () => <p>Try Sephora ${condition}</p>;",
          "const c = `ok ${condition} but ugly`;",
        ].join("\n"),
      );
      await writeFile(join(dir, "ui", "notes.md"), "Line one\nA cure for all\n");
      const found = await lintFiles(["ui/**/*"], { cwd: dir });
      expect(found.map((v) => [v.file, v.line, v.word])).toEqual([
        ["ui/a.tsx", 3, "imperfection"],
        ["ui/a.tsx", 4, "sephora"],
        ["ui/a.tsx", 5, "ugly"],
        ["ui/notes.md", 2, "cure"],
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("the defaults reach the capture flow, route handlers (strings only) and public JSON (string values, no image data)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "copy-lint-defaults-"));
    try {
      for (const sub of ["components/capture", "app/api/x", "public/demo", "lib/skin"]) await mkdir(join(dir, sub), { recursive: true });
      await writeFile(join(dir, "components/capture/Cam.tsx"), 'export const C = () => <p>Hold still, nobody notices a flaw</p>;\n');
      await writeFile(join(dir, "app/api/x/route.ts"), 'const ok = schema.refine(() => true);\nexport const e = "This cure takes a minute";\n');
      await writeFile(
        join(dir, "public/demo/a.json"),
        JSON.stringify({ title: "Flawless skin", image: `data:image/png;base64,${"Rx/Rx+".repeat(40)}`, blob: "Rx/".repeat(60), n: 1 }),
      );
      await writeFile(join(dir, "lib/skin/ignored.ts"), 'export const s = "a flaw";\n');
      const found = await lintFiles(undefined, { cwd: dir });
      expect(found.map((v) => [v.file, v.word])).toEqual([
        ["app/api/x/route.ts", "cure"],
        ["components/capture/Cam.tsx", "nobody notices"],
        ["components/capture/Cam.tsx", "flaw"],
        ["public/demo/a.json", "flawless"],
      ]);
      // The UI-only list is opt-in for files until the last old names are renamed.
      await writeFile(join(dir, "components/capture/Cam.tsx"), 'export const C = () => <p>Your age spots</p>;\n');
      expect(await lintFiles(undefined, { cwd: dir, lists: UI_LISTS })).toContainEqual(expect.objectContaining({ file: "components/capture/Cam.tsx", word: "age spots" }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the repository's own copy", () => {
  // Strings that still say "age spots" or "acne marks". Rename them to "dark spots" and "breakouts" (lib/copy/concerns.ts),
  // then empty this list and make UI_LISTS the default of lintFiles. The test only lets the list shrink.
  const PENDING_RENAME = ["app/how-it-works/page.tsx", "app/page.tsx", "lib/mock/copy.ts", "lib/mock/selfTest.ts"];

  test("pages, components (capture included), route handlers and public JSON pass the core lists", async () => {
    expect((await lintFiles()).map((v) => `${v.file}:${v.line} ${v.word}`)).toEqual([]);
  });

  test("the old concern names live only in the files still waiting to be renamed", async () => {
    const found = await lintFiles(undefined, { lists: ["ui"] });
    expect([...new Set(found.map((v) => v.file))].filter((f) => !PENDING_RENAME.includes(f))).toEqual([]);
  });

  test("the copy sources pass every list", async () => {
    expect(await lintFiles(["lib/copy/**/*.ts"], { lists: UI_LISTS })).toEqual([]);
  });

  test("the docs pass the softer list", async () => {
    expect((await lintDocs()).map((v) => `${v.file}:${v.line} ${v.word}`)).toEqual([]);
  });
});

describe("generated copy is clean", () => {
  const DISTANCES = [0, 0.05, 0.1, 0.2, 0.3, 0.35, 0.4, 0.7, 0.99, 1, 1.05, 1.2, 1.5, 2, 3, 4, 8, MAX_DISTANCE_M];

  function everything() {
    const strings: string[] = [];
    const headlines: string[] = [];
    const multiHeadlines: string[] = [];
    const softTexts: string[] = [];
    for (const id of IDS) {
      strings.push(CONCERN_COPY[id].title, CONCERN_COPY[id].singular, CONCERN_COPY[id].plural, CONCERN_COPY[id].explainer);
      for (const d of DISTANCES) {
        for (const confidence of ["high", "medium", "low"] as const) {
          for (const targetCount of [0, 1, 6]) {
            for (const nominal of [undefined, d / 1.5, d / 3]) {
              const c = cv(id, d, { confidence, targetCount, medianDistanceM: d * 0.4, nominalMaxDistanceM: nominal });
              const out = describeConcern(c);
              headlines.push(out.headline);
              strings.push(out.headline, out.detail, stepBackCounter(c, d + 0.1));
              if (targetCount > 0 && out.tone === "visible" && (id === "dark_circle" || id === "eye_bag")) softTexts.push(out.headline, out.detail);
            }
          }
        }
      }
      // The profile path: shares from nothing to everything across a table, falling off gently or steeply.
      for (const total of [5, 6, 40, 656, 999]) {
        for (const share of [0, 0.5 / total, 0.05, 0.1, 0.11, 0.3, 0.7, 1]) {
          for (const steepness of [0.5, 1, 3]) {
            for (const confidence of ["high", "low"] as const) {
              for (const nominalSquash of [undefined, 0.6, 0]) {
                const counts = PROFILE_DISTANCES_M.map((d) => Math.round(total * Math.min(1, share * (1.5 / d) ** steepness)));
                const nominalCounts = counts.map((n) => Math.round(n * (nominalSquash ?? 0)));
                const c = many(id, total, counts, {
                  confidence,
                  ...(nominalSquash === undefined ? {} : { nominalProfile: profileOf(total, nominalCounts), nominalMaxDistanceM: 2 }),
                });
                const out = describeConcern(c);
                // Counts live in receipts: a many-feature headline is a proportion in words, with no digits.
                if (CONCERNS[id].visibility && CONCERNS[id].maskKind !== "region") {
                  expect(out.headline, `${id} ${total} ${share}`).not.toMatch(/\d/);
                  expect(stepBackCounter(c, 1)).toMatch(/^(?:None|All|Nearly all|Most|About (?:a third|half)|Some|A few|A small share) of your /);
                  multiHeadlines.push(out.headline);
                }
                headlines.push(out.headline);
                strings.push(out.headline, out.detail);
                for (const d of DISTANCES) strings.push(stepBackCounter(c, d));
              }
            }
          }
        }
      }
    }
    for (const id of IDS) {
      for (const score of [undefined, 0, 69, 100]) {
        for (const d of DISTANCES) strings.push(describeConcern(cv(id, d), { youcamScore: score }).detail);
      }
      for (const d of DISTANCES) {
        for (const targetCount of [0, 1, 6, 656]) {
          const profile = profileOf(Math.max(1, targetCount), PROFILE_DISTANCES_M.map((x) => (x <= d ? Math.max(1, targetCount) : 0)));
          const nominalProfile = profileOf(Math.max(1, targetCount), PROFILE_DISTANCES_M.map((x) => (x <= d / 1.5 ? Math.max(1, targetCount) : 0)));
          for (const extra of [{}, { differenceNominalProfile: nominalProfile, differenceNominalMaxDistanceM: d / 1.5 }]) {
            const out = describeWorthIt({ concern: id, targetCount, differenceMaxDistanceM: d, differenceProfile: profile, ...extra });
            headlines.push(out.headline);
            strings.push(out.headline, out.detail);
          }
        }
      }
    }
    for (const a of DISTANCE_ANCHORS) strings.push(a.label, a.phrase ?? "");
    for (const d of DISTANCES) {
      for (const confidence of ["high", "low"] as const) {
        for (const pair of [[IDS[0], IDS[1]], [IDS[4], IDS[6]], IDS]) {
          const concerns = pair.map((id, i) => cv(id, d * (i + 1) * 0.7, { confidence }));
          strings.push(summaryLine(report(concerns)), formatDistance(d));
          const share = (reach: number) => PROFILE_DISTANCES_M.map((x) => Math.round(50 * Math.min(1, reach / x)));
          const profiled = pair.map((id, i) => many(id, 50, share(d * (i + 1) * 0.7), { confidence }));
          strings.push(summaryLine(report(profiled)));
        }
      }
    }
    strings.push(...Object.values(DISCLAIMERS), COVERAGE_TITLE, COVERAGE_INTRO, ...IDS.map(coverageHook));
    return { strings, headlines, multiHeadlines, softTexts };
  }

  let cached: ReturnType<typeof everything> | undefined;
  const generated = () => (cached ??= everything());

  test("no banned word anywhere, no absolutes, and headlines fit on a card line", () => {
    const { strings, headlines, multiHeadlines, softTexts } = generated();
    expect(strings.length).toBeGreaterThan(6000);
    // Many templates repeat; the linter runs once per distinct sentence.
    const distinct = [...new Set(strings)];
    expect(distinct.length).toBeGreaterThan(300);
    const bad = distinct.flatMap((s) => lintText(s, UI_LISTS).map((v) => `${v.word} in "${s}"`));
    expect(bad).toEqual([]);
    expect(distinct.filter((s) => ABSOLUTES.test(s))).toEqual([]);
    expect(headlines.filter((h) => h.length > MAX_HEADLINE_CHARS)).toEqual([]);
    expect(multiHeadlines.length).toBeGreaterThan(500);
    expect(multiHeadlines.filter((h) => /\d/.test(h))).toEqual([]);
    expect(softTexts.length).toBeGreaterThan(50);
    expect(softTexts.filter((s) => NO_METRES.test(s))).toEqual([]);
  }, 30_000);

  test("the copy never says 'healthier', quotes a score, or names the instrument's cap", () => {
    const { strings } = generated();
    expect(strings.filter((s) => /healthier|\/100|stop measuring|YouCam rates/i.test(s))).toEqual([]);
  });
});
