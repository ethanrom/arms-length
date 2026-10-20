import { describe, expect, it } from "vitest";
import { CORE_LISTS } from "@/lib/copy/banned";
import { lintFiles } from "@/lib/copy/lint";

// The UI sentences must stay kind and non-medical (CLAUDE.md content rules), with the old concern names gone too.
describe("UI copy", () => {
  it("has no banned words in pages, components, route handlers or public JSON (every list)", async () => {
    const violations = await lintFiles();
    expect(violations.map((v) => `${v.file}:${v.line} ${v.word}`)).toEqual([]);
  });

  it("keeps the integration layer's sentences kind and non-medical", async () => {
    // lib/integration is not in the default globs. Its self-test target still says "an age spot" (selfTest.ts); the
    // self-test component words it as "a dark spot" for the reader, so the integrator can rename it and drop the restriction.
    const violations = await lintFiles(["lib/integration/**/*.ts"], { lists: CORE_LISTS });
    expect(violations.map((v) => `${v.file}:${v.line} ${v.word}`)).toEqual([]);
  });
});
