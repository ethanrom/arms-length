import { describe, expect, it } from "vitest";
import { lintFiles } from "@/lib/copy/lint";

// The UI's own copy and mock sentences must stay kind and non-medical (CLAUDE.md content rules).
describe("UI copy", () => {
  it("has no banned words in pages, components or mock data", async () => {
    const violations = await lintFiles(["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/mock/**/*.ts"], {
      ignore: ["node_modules/", ".next/", ".test.ts", ".test.tsx", ".spec.ts", "components/capture/", "app/api/", "app/dev/"],
    });
    expect(violations.map((v) => `${v.file}:${v.line} ${v.word}`)).toEqual([]);
  });
});
