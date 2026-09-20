const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./packages/gui/e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm.cmd run start:gui",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
