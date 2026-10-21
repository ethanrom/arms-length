import { describe, expect, test } from "vitest";
import { lintText } from "@/lib/copy/lint";
import { DEMO_IDS, loadBundle } from "./demo";
import { decodeShareLine, encodeShareLine, parseShareLines, reliefShareLines, shareLineText, shareSafetyFor } from "./shareLines";

describe("share lines", () => {
  test("a line survives the round trip and reads as relief", () => {
    const pores = decodeShareLine("pore.mostly.room")!;
    expect(encodeShareLine(pores)).toBe("pore.mostly.room");
    expect(shareLineText(pores)).toBe("Pores: mostly out of sight across a room");
    expect(shareLineText(decodeShareLine("wrinkle.all.table")!)).toBe("Fine lines: out of sight across a table");
    expect(shareLineText(decodeShareLine("redness.beyond.1.2")!)).toBe("Redness: out of sight beyond 1.2 m");
  });

  test("anything outside the vocabulary is refused, so nobody can put their own words on a card", () => {
    for (const bad of ["", "pore", "pore.mostly", "pore.mostly.moon", "texture.all.room", "nope.all.room", "pore.beyond.abc", "pore.beyond.99", "pore.all.room.extra", "<b>.all.room"]) {
      expect(decodeShareLine(bad), bad).toBeNull();
    }
    const parsed = parseShareLines("pore.all.room,pore.mostly.table,wrinkle.all.table,junk,acne.all.table,redness.beyond.1");
    expect(parsed.map(encodeShareLine)).toEqual(["pore.all.room", "wrinkle.all.table", "acne.all.table"]);
  });

  test("only the concerns about marks carry the safety line", () => {
    expect(shareSafetyFor(parseShareLines("pore.all.room"))).toBeNull();
    expect(shareSafetyFor(parseShareLines("pore.all.room,age_spot.mostly.room"))).toMatch(/ask a doctor or pharmacist/);
  });

  test.each(DEMO_IDS)("%s: every offered line is true by the bound and passes the content rules", (id) => {
    const bundle = loadBundle(id)!;
    for (const spec of reliefShareLines(bundle.report)) {
      expect(lintText(shareLineText(spec))).toEqual([]);
      const cv = bundle.report.concerns.find((c) => c.concern === spec.concern)!;
      if (spec.kind !== "beyond") {
        const at = { conversation: 1, table: 1.5, room: 4 }[spec.anchor];
        const nearest = cv.profile!.reduce((best, p) => (Math.abs(p.distanceM - at) < Math.abs(best.distanceM - at) ? p : best));
        expect(nearest.fraction, `${id} ${spec.concern}`).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
