import { describe, expect, it } from "vitest";
import { polishDraft } from "./plan";
import { fitHeadline, polishText } from "./headline";
import { goodDraft } from "./test-helpers";

describe("polishText", () => {
  const polished = (text: string) => polishText(text).text;

  it("takes out simply, just and really, and tidies what is left", () => {
    expect(polished("That is simply what they see.")).toBe("That is what they see.");
    expect(polished("Your skin is seen in detail, just as it is.")).toBe("Your skin is seen in detail, as it is.");
    expect(polished("A viewer would really notice it.")).toBe("A viewer would notice it.");
    expect(polished("Pores fade from view, simply.")).toBe("Pores fade from view.");
    expect(polished("Pores fade from view, really, and the rest looks soft.")).toBe("Pores fade from view, and the rest looks soft.");
    expect(polished("It is JUST fine and Simply fine.")).toBe("It is fine and fine.");
  });

  it("keeps the capital of a sentence that began with a filler word", () => {
    expect(polished("Just as it is, your skin shows.")).toBe("As it is, your skin shows.");
    expect(polished("Simply, pores fade from view.")).toBe("Pores fade from view.");
    expect(polished("Pores fade. Just the rest shows.")).toBe("Pores fade. The rest shows.");
  });

  it("counts what it removed and returns the text unchanged when there is nothing to remove", () => {
    expect(polishText("It simply is, and just so.").removed).toBe(2);
    const clean = "Across the table, pores stay out of sight.";
    expect(polishText(clean)).toEqual({ text: clean, removed: 0 });
  });

  it("never touches a number, a quote's other words, or a word that only contains a filler", () => {
    const quoted = "At 1.5 m, about 1 in 12 of your pores (54 of 650) show.";
    expect(polishText(quoted)).toEqual({ text: quoted, removed: 0 });
    expect(polished("It is just 1.5 m, just 54 of 650, really about 1 in 12.")).toBe("It is 1.5 m, 54 of 650, about 1 in 12.");
    const others = "Adjust the justice of a juster realm; unreally so.";
    expect(polishText(others)).toEqual({ text: others, removed: 0 });
  });

  it("leaves the banned phrases it does not cover for the verifier", () => {
    expect(polished("That is just what the measurements say.")).toBe("That is what the measurements say.");
    expect(polished("It simply cannot change.")).toBe("It cannot change.");
  });
});

describe("polishDraft", () => {
  it("polishes every sentence a user reads and leaves titles, assumptions and refs alone", () => {
    const d = goodDraft();
    const m = d.moments[0];
    m.title = "Just dinner";
    m.assumptions = ["I just took dinner as a table."];
    m.headline = { text: "Across the table, your pores simply fade.", refs: ["r1"] };
    m.notice = [{ text: "A viewer could really pick out about 1 in 12 of your pores.", refs: ["r1"] }];
    m.outOfSight = [{ text: "Breakouts stay out of sight, just as they are.", refs: ["r1"] }];
    m.action = { kind: "none", claim: { text: "Simply nothing to do here.", refs: [] } };
    d.summary = { text: "It is really a relaxed evening.", refs: ["r1"] };

    const { draft, removed } = polishDraft(d);
    expect(removed).toBe(5);
    const out = draft.moments[0];
    expect(out.headline).toEqual({ text: "Across the table, your pores fade.", refs: ["r1"] });
    expect(out.notice[0].text).toBe("A viewer could pick out about 1 in 12 of your pores.");
    expect(out.outOfSight[0].text).toBe("Breakouts stay out of sight, as they are.");
    expect(out.action.claim.text).toBe("Nothing to do here.");
    expect(draft.summary.text).toBe("It is a relaxed evening.");
    expect(out.title).toBe("Just dinner");
    expect(out.assumptions).toEqual(["I just took dinner as a table."]);
    expect(out.notice[0].refs).toEqual(["r1"]);
    // The input is not changed.
    expect(d.moments[0].headline?.text).toContain("simply");
  });

  it("returns the same claims when there is nothing to polish", () => {
    const d = goodDraft();
    const { draft, removed } = polishDraft(d);
    expect(removed).toBe(0);
    expect(draft).toEqual(d);
  });
});

describe("fitHeadline", () => {
  const long = "In grey daylight at chatting distance, more of your skin shows plainly to everyone near; a touch of makeup is there if you'd like it.";

  it("cuts an over-long headline at its last semicolon, keeping the relief and dropping the offer", () => {
    expect(long.length).toBeGreaterThan(120);
    expect(fitHeadline(long, 120)).toBe("In grey daylight at chatting distance, more of your skin shows plainly to everyone near.");
  });

  it("leaves a headline that fits, and one with no clause to spare, as it is", () => {
    expect(fitHeadline("Short and warm.", 120)).toBe("Short and warm.");
    const noClause = "x".repeat(130);
    expect(fitHeadline(noClause, 120)).toBe(noClause);
  });
});
