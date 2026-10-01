import { defineConfig, devices } from "/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/node_modules/@playwright/test/index.mjs";
export default defineConfig({
  testDir: "/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/tests/e2e",
  testMatch: ["adsense-script.spec.ts"],
  fullyParallel: true, workers: 2, retries: 0,
  reporter: [["list"], ["json", { outputFile: "/tmp/fmj-adsense-script-20261001/webkit-results.json" }]],
  outputDir: "/tmp/fmj-adsense-script-20261001/webkit-artifacts",
  projects: [{ name: "AdSense-WebKit", use: { ...devices["iPhone 13"], browserName: "webkit", baseURL: "http://127.0.0.1:4188", screenshot: "only-on-failure" } }],
  webServer: { command: "npm run preview -- --port 4188 --strictPort", cwd: "/Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan", url: "http://127.0.0.1:4188", reuseExistingServer: false },
});
