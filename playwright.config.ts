import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
      },
});
