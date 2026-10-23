import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: baseURL,
    // Recorded answers only: the live path is exercised end to end with no units (see app/api/youcam/analysis).
    env: { YOUCAM_MODE: "replay", REPLAY_UPLOADS: "1", AGENT_ENABLED: "1", AGENT_MODE: "replay" },
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
  },
});
