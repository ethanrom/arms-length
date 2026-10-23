import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["lib/**/*.test.ts", "eval/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
