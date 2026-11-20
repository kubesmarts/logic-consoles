import { defineConfig, devices } from "@playwright/test";

// Phase 1 gate-zero spike proof: load the real app in a real Chromium browser and
// assert the PatternFly shell, Monaco YAML editor, the CNCF diagram editor and the
// React Flow canvas all render together in light AND dark themes. This is the only
// place the full dependency stack is exercised in a browser (jsdom cannot run
// canvas, WebGL or web workers).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
