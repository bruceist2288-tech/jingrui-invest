import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "e2e.spec.ts",
  timeout: 60000,
  outputDir: "test-results",
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:43123", locale: "zh-TW" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:43123",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
