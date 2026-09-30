import { defineConfig, devices } from "/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/node_modules/@playwright/test/index.mjs";
export default defineConfig({
  testDir: "/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/tests/e2e",
  testMatch: ["return-candidate-browser.spec.ts", "return-car.spec.ts", "rental-directory.spec.ts"],
  fullyParallel: true, workers: 2, retries: 0,
  reporter: [["list"], ["json", { outputFile: "/tmp/fmj-return-candidate-webkit-results.json" }]],
  outputDir: "/tmp/fmj-return-candidate-webkit-artifacts",
  use: { baseURL: "http://127.0.0.1:4174", screenshot: "only-on-failure" },
  projects: [
    { name: "Return-iPhone-WebKit", grep: /return candidates paginate|return browser columns|page number entry/, use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "Return-Desktop-WebKit", grep: /candidate hover|return candidates paginate|return browser columns align and fit 1280px|bounded list without moving|1280px: page number entry|page number entry preserves/, use: { ...devices["Desktop Safari"], browserName: "webkit" } },
  ],
});
