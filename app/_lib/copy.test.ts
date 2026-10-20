import { describe, expect, it } from "vitest";
import { lintFiles } from "@/lib/copy/lint";

// The UI and integration-layer sentences must stay kind and non-medical (CLAUDE.md content rules).
describe("UI copy", () => {
  it("has no banned words in pages, components or the integration layer", async () => {
    const violations = await lintFiles(["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/integration/**/*.ts"], {
      ignore: ["node_modules/", ".next/", ".test.ts", ".test.tsx", ".spec.ts", "components/capture/", "app/api/", "app/dev/"],
    });
    expect(violations.map((v) => `${v.file}:${v.line} ${v.word}`)).toEqual([]);
  });
});
