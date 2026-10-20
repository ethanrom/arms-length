import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import {
  DEFAULT_VIEWING, MAX_DISTANCE_M, PROFILE_DISTANCES_M, type ConcernVisibility, type VisibilityReport,
} from "@/lib/contracts/vision";
import {
  BANNED_LISTS,
  CONCERN_COPY,
  DISTANCE_ANCHORS,
  MAX_HEADLINE_CHARS,
  anchorFor,
  describeConcern,
  formatDistance,
  formatInterval,
  orderReliefFirst,
  proxemicZone,
  profileAt,
  reachM,
  shareWords,
  stepBackCounter,
  summaryLine,
} from "./index";
import { lintFiles, lintText } from "./lint";

const IDS = Object.keys(CONCERNS) as ConcernId[];

function cv(concern: ConcernId, d: number, o: Partial<ConcernVisibility> = {}): ConcernVisibility {
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
const profileOf = (total: number, counts: number[]): NonNullable<ConcernVisibility["profile"]> =>
  PROFILE_DISTANCES_M.map((distanceM, i) => ({ distanceM, count: counts[i], fraction: counts[i] / total }));

/** A many-feature concern: counts at 0.25 / 0.3 / 0.6 / 1 / 1.5 / 2.5 / 4 / 6 m. */
function many(concern: ConcernId, total: number, counts: number[], o: Partial<ConcernVisibility> = {}): ConcernVisibility {
  const farthest = PROFILE_DISTANCES_M.filter((_, i) => counts[i] > 0).pop() ?? 0;
  return cv(concern, farthest, { targetCount: total, profile: profileOf(total, counts), ...o });
}

const report = (concerns: ConcernVisibility[]): VisibilityReport => ({ viewing: DEFAULT_VIEWING, targets: [], concerns });

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

describe("describeConcern", () => {
  test("relief and visible match the brief's register", () => {
    expect(describeConcern(cv("pore", 0.4))).toEqual({
      headline: "Nobody can see your pores from across a table.",
      detail: "Even someone with perfect eyesight would need to be closer than 40 cm.",
      tone: "relief",
    });
    const shadows = describeConcern(cv("dark_circle", 2));
    expect(shadows.headline).toBe("Your under-eye shadows are visible from about 2 m.");
    expect(shadows.detail).toMatch(/^That's across a table/);
    expect(shadows.tone).toBe("visible");
  });

  test("every visible concern gets the next-step hook, with the right pronoun", () => {
    for (const id of IDS.filter((i) => CONCERNS[i].visibility)) {
      const d = describeConcern(cv(id, 2));
      const them = CONCERN_COPY[id].agreement === "plural" ? "them" : "it";
      expect(d.detail.endsWith(`See what would make ${them} disappear at 1 m.`), id).toBe(true);
    }
    expect(describeConcern(cv("redness", 2)).headline).toBe("Your redness is visible from about 2 m.");
  });

  test("relief starts at conversation distance and has no hook", () => {
    expect(describeConcern(cv("redness", 1)).tone).toBe("relief");
    expect(describeConcern(cv("redness", 1.05)).tone).toBe("visible");
    expect(describeConcern(cv("pore", 0.9)).detail).not.toMatch(/See what/);
    expect(describeConcern(cv("pore", 0.3)).headline).toBe("Nobody can see your pores beyond 30 cm.");
    expect(describeConcern(cv("pore", 0)).headline).toBe("Nobody can see your pores, even up close.");
  });

  test("a relief bound uses the top of the interval, so the claim survives the error bars", () => {
    const d = describeConcern(cv("pore", 0.4, { intervalM: [0.38, 0.5] }));
    expect(d.detail).toContain("closer than 50 cm");
  });

  test("low confidence is said out loud; the cap is stated", () => {
    expect(describeConcern(cv("pore", 0.4, { confidence: "low" })).detail).toContain(" This one is a rough estimate.");
    const low = describeConcern(cv("redness", 2, { confidence: "low", intervalM: [1, 3] }));
    expect(low.detail).toContain("This one is a rough estimate: the range is about 1–3 m.");
    expect(describeConcern(cv("redness", 2)).detail).not.toMatch(/rough/);
    const capped = describeConcern(cv("redness", MAX_DISTANCE_M));
    expect(capped.headline).toBe("Your redness is visible from 10 m or more.");
    expect(capped.detail).toContain("We stop measuring at 10 m.");
  });

  test("nothing found, and concerns that aren't about visibility", () => {
    const none = describeConcern(cv("pore", 0, { targetCount: 0 }));
    expect(none.headline).toBe("We didn't find any pores to measure.");
    expect(none.tone).toBe("relief");
    expect(describeConcern(cv("texture", 3)).headline).toBe("We don't give skin texture a distance.");
  });

  test("a spread-out concern says where most of it fades", () => {
    const d = describeConcern(cv("age_spot", 3, { medianDistanceM: 0.8, targetCount: 6 }));
    expect(d.detail).toContain("Most of them fade from view beyond 80 cm.");
  });
});

describe("describeConcern from the detectability profile", () => {
  const pores = many("pore", 656, [656, 656, 600, 300, 9, 2, 0, 0]);
  const spots = many("age_spot", 600, [600, 600, 590, 500, 200, 100, 20, 0]);

  test("relief: at most N of M, always with a count because the profile is a bound", () => {
    expect(describeConcern(pores)).toEqual({
      headline: "At most 9 of your 656 pores show from across a table.",
      detail: "From across a table, at most 9 of your 656 pores could be seen, even by perfect eyes. At 1 m, that rises to at most 300.",
      tone: "relief",
    });
    const none = describeConcern(many("pore", 656, [656, 600, 300, 40, 0, 0, 0, 0]));
    expect(none.headline).toBe("Nobody can see your pores from across a table.");
    expect(none.detail).toMatch(/^From across a table, not one of your 656 pores could be seen, even by perfect eyes\./);
  });

  test("visible: the share, at the farthest anchor where at least 10% is still detectable", () => {
    expect(describeConcern(spots)).toEqual({
      headline: "About a third of your dark spots show from across a table.",
      detail:
        "From across a table, that's at most 200 of your 600 dark spots, for sharp eyes looking right at them. " +
        "See what would make them disappear at 1 m.",
      tone: "visible",
    });
    // 60/600 = 10% at 4 m: the farthest anchor that still holds 10% is across a room.
    const room = describeConcern(many("age_spot", 600, [600, 600, 590, 500, 200, 100, 60, 0]));
    expect(room.headline).toBe("About a tenth of your dark spots show from across a room.");
    expect(room.detail).toContain("From across a room, that's at most 60 of your 600 dark spots");
    const all = describeConcern(many("acne", 5, [5, 5, 5, 5, 5, 1, 0, 0]));
    expect(all.headline).toBe("Nearly all of your breakouts show from across a table.");
    expect(all.detail).toMatch(/^All 5 of your breakouts could be seen from across a table/);
  });

  test("the boundary: 10% or less across a table is relief, more is not", () => {
    expect(describeConcern(many("pore", 100, [100, 100, 90, 40, 10, 2, 0, 0])).tone).toBe("relief");
    const over = describeConcern(many("pore", 100, [100, 100, 90, 40, 11, 2, 0, 0]));
    expect(over.tone).toBe("visible");
    expect(over.headline).toBe("About a tenth of your pores show from across a table.");
  });

  test("regions, and concerns with fewer than 5 targets, keep the single-distance wording", () => {
    const circles = many("dark_circle", 8, [8, 8, 8, 8, 8, 8, 0, 0]);
    expect(describeConcern({ ...circles, maxDistanceM: 2 }).headline).toBe("Your under-eye shadows are visible from about 2 m.");
    expect(describeConcern(many("redness", 6, [6, 6, 0, 0, 0, 0, 0, 0], { maxDistanceM: 0.4 })).headline).toBe(
      "Nobody can see your redness from across a table.",
    );
    const few = many("pore", 4, [4, 4, 4, 0, 0, 0, 0, 0], { maxDistanceM: 0.8 });
    expect(describeConcern(few).headline).toBe("Nobody can see your pores from across a table.");
    expect(describeConcern(few).detail).toBe("Even someone with perfect eyesight would need to be closer than 80 cm.");
  });

  test("a rough estimate is said out loud on both sides", () => {
    expect(describeConcern({ ...pores, confidence: "low" }).detail).toContain("This one is a rough estimate");
    expect(describeConcern({ ...spots, confidence: "low" }).detail).toContain("This one is a rough estimate");
  });

  test("profileAt and reachM read the profile on a log axis", () => {
    const p = pores.profile!;
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

  test("shareWords is monotone and every phrase is true for its whole range", () => {
    expect([1, 0.9, 0.8, 0.6, 0.5, 0.33, 0.25, 0.18, 0.1].map(shareWords)).toEqual([
      "Nearly all", "Nearly all", "Most", "More than half", "About half", "About a third", "About a quarter", "About a fifth", "About a tenth",
    ]);
  });
});

describe("stepBackCounter", () => {
  const pores = many("pore", 656, [656, 656, 600, 300, 9, 2, 0, 0]);

  test("interpolates the profile for the slider", () => {
    expect(stepBackCounter(pores, 1)).toBe("300 of 656 pores detectable from here");
    expect(stepBackCounter(pores, 0.6)).toBe("600 of 656 pores detectable from here");
    expect(stepBackCounter(pores, Math.sqrt(0.6))).toBe("450 of 656 pores detectable from here");
    expect(stepBackCounter(pores, 0.1)).toBe("656 of 656 pores detectable from here");
    expect(stepBackCounter(pores, 8)).toBe("0 of 656 pores detectable from here");
    const counts = [0.25, 0.4, 0.7, 1, 1.2, 1.5, 2, 3, 5].map((d) => Number(stepBackCounter(pores, d).split(" ")[0]));
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  test("regions with a profile count zones; concerns without one get a yes or no", () => {
    expect(stepBackCounter(many("dark_circle", 2, [2, 2, 2, 2, 2, 2, 2, 2]), 3)).toBe("2 of 2 under-eye shadows detectable from here");
    expect(stepBackCounter(many("age_spot", 1, [1, 1, 1, 0, 0, 0, 0, 0]), 0.5)).toBe("1 of 1 dark spot detectable from here");
    expect(stepBackCounter(cv("redness", 4), 2)).toBe("Your redness is detectable from here");
    expect(stepBackCounter(cv("redness", 4), 5)).toBe("Your redness is no longer detectable from here");
    expect(stepBackCounter(cv("pore", 0, { targetCount: 0 }), 1)).toBe("We didn't find any pores to measure.");
    expect(stepBackCounter(cv("texture", 0), 1)).toBe("We don't give skin texture a distance.");
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

  test("summaryLine covers the mixed, all-relief, all-visible and empty cases", () => {
    expect(summaryLine(report([pore, redness]))).toBe("From a metre away, people see your redness, not your pores.");
    expect(summaryLine(report([redness, spots, pore]))).toBe("From a metre away, people see your redness and dark spots, not your pores.");
    expect(summaryLine(report([pore, wrinkle]))).toBe("From a metre away, nobody can see your pores or lines.");
    expect(summaryLine(report([redness]))).toBe("From a metre away, people see your redness.");
    expect(summaryLine(report([none, texture]))).toBe("We didn't find anything to measure this time.");
    expect(summaryLine(report([]))).toBe("We didn't find anything to measure this time.");
    expect(summaryLine(report([cv("redness", 4, { confidence: "low" }), pore]))).toContain("people may see");
  });

  test("with profiles: grouped by the share across a table, and the sentence is about a table, not a metre", () => {
    const poresRelief = many("pore", 656, [656, 656, 600, 300, 9, 2, 0, 0]);
    const spotsVisible = many("age_spot", 600, [600, 600, 590, 500, 200, 100, 20, 0]);
    // Relief: the line (gone at 0.9 m, so none across a table) before 9 of 656. Visible: the whole concern before a third.
    const out = orderReliefFirst([spotsVisible, poresRelief, redness, wrinkle]);
    expect(out.map((c) => c.concern)).toEqual(["wrinkle", "pore", "redness", "age_spot"]);
    expect(summaryLine(report([poresRelief, redness]))).toBe("From across a table, people see your redness, not your pores.");
    expect(summaryLine(report([poresRelief, wrinkle]))).toBe("From across a table, nobody can see your lines or pores.");
    expect(summaryLine(report([spotsVisible, redness]))).toBe("From a metre away, people see your redness and dark spots.");
  });
});

describe("lint", () => {
  test("every banned entry is caught as a whole word, any case", () => {
    for (const [list, words] of Object.entries(BANNED_LISTS)) {
      for (const word of words) {
        for (const text of [`Some ${word} here`, `SOME ${word.toUpperCase()}!`]) {
          const hit = lintText(text).find((v) => v.word === word);
          expect(hit, `${list}: ${text}`).toMatchObject({ word, list, index: 5 });
        }
      }
    }
  });

  test("does not flag look-alikes, and reports indexes in order", () => {
    expect(lintText("Secure, incurred, treaty, curiosity, a rxy code, flawlessly, YouCam and Perfect Corp.")).toEqual([]);
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
});

describe("generated copy is clean", () => {
  const DISTANCES = [0, 0.05, 0.1, 0.2, 0.3, 0.35, 0.4, 0.7, 0.99, 1, 1.05, 1.2, 1.5, 2, 3, 4, 8, MAX_DISTANCE_M];

  function everything() {
    const strings: string[] = [];
    const headlines: string[] = [];
    for (const id of IDS) {
      strings.push(CONCERN_COPY[id].singular, CONCERN_COPY[id].plural, CONCERN_COPY[id].explainer);
      for (const d of DISTANCES) {
        for (const confidence of ["high", "medium", "low"] as const) {
          for (const targetCount of [0, 1, 6]) {
            const out = describeConcern(cv(id, d, { confidence, targetCount, medianDistanceM: d * 0.4 }));
            headlines.push(out.headline);
            strings.push(out.headline, out.detail);
          }
        }
      }
      // The profile path: shares from nothing to everything across a table, falling off gently or steeply.
      for (const total of [5, 6, 40, 656, 999]) {
        for (const share of [0, 0.5 / total, 0.05, 0.1, 0.11, 0.3, 0.7, 1]) {
          for (const steepness of [0.5, 1, 3]) {
            for (const confidence of ["high", "low"] as const) {
              const counts = PROFILE_DISTANCES_M.map((d) => Math.round(total * Math.min(1, share * (1.5 / d) ** steepness)));
              const c = many(id, total, counts, { confidence });
              const out = describeConcern(c);
              headlines.push(out.headline);
              strings.push(out.headline, out.detail);
              for (const d of DISTANCES) strings.push(stepBackCounter(c, d));
            }
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
    return { strings, headlines };
  }

  test("no banned word anywhere, and headlines fit on a card line", () => {
    const { strings, headlines } = everything();
    expect(strings.length).toBeGreaterThan(5000);
    const bad = strings.flatMap((s) => lintText(s).map((v) => `${v.word} in "${s}"`));
    expect(bad).toEqual([]);
    const long = headlines.filter((h) => h.length > MAX_HEADLINE_CHARS);
    expect(long).toEqual([]);
  });

  test("the copy source files pass the file linter", async () => {
    expect(await lintFiles(["lib/copy/**/*.ts"])).toEqual([]);
  });
});
