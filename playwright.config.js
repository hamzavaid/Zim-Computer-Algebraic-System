const { defineConfig, devices } = require("@playwright/test");
const port = Number(process.env.ZIM_TEST_PORT ?? "3210");
const url = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: "./packages/gui/e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: url,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node packages/gui/dist/server.js",
    url,
    env: { ZIM_GUI_PORT: String(port) },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
