import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CONCERNS, type ConcernId } from "@/lib/contracts/concerns";
import { DEFAULT_VIEWING, MAX_DISTANCE_M, type ConcernVisibility, type VisibilityReport } from "@/lib/contracts/vision";
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
    }
    for (const a of DISTANCE_ANCHORS) strings.push(a.label, a.phrase ?? "");
    for (const d of DISTANCES) {
      for (const confidence of ["high", "low"] as const) {
        for (const pair of [[IDS[0], IDS[1]], [IDS[4], IDS[6]], IDS]) {
          const concerns = pair.map((id, i) => cv(id, d * (i + 1) * 0.7, { confidence }));
          strings.push(summaryLine(report(concerns)), formatDistance(d));
        }
      }
    }
    return { strings, headlines };
  }

  test("no banned word anywhere, and headlines fit on a card line", () => {
    const { strings, headlines } = everything();
    expect(strings.length).toBeGreaterThan(1000);
    const bad = strings.flatMap((s) => lintText(s).map((v) => `${v.word} in "${s}"`));
    expect(bad).toEqual([]);
    const long = headlines.filter((h) => h.length > MAX_HEADLINE_CHARS);
    expect(long).toEqual([]);
  });

  test("the copy source files pass the file linter", async () => {
    expect(await lintFiles(["lib/copy/**/*.ts"])).toEqual([]);
  });
});
