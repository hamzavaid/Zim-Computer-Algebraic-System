const { test, expect } = require("@playwright/test");

test("keyboard workflow solves and exposes the result accessibly", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Expression or equation").fill("x^2 = 4");
  await page.getByLabel("Solve for").fill("x");
  await page.getByLabel("Expression or equation").press("ControlOrMeta+Enter");
  await expect(page.getByText("x = -2, 2", { exact: true })).toBeAttached();
  await expect(page.locator("#status-output")).toHaveText("Ready");
  await expect(page.locator("#steps-output li").first()).toBeVisible();
});

test("history migrates, can be recalled, and can be deleted", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("zim-history", '["x + 1"]'));
  await page.goto("/");
  await page.getByRole("button", { name: "x + 1" }).click();
  await expect(page.getByLabel("Expression or equation")).toHaveValue("x + 1");
  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(page.locator("#history-output li")).toHaveCount(0);
});

test("responsive layout and 200 percent zoom retain usable controls", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(page.getByRole("button", { name: "Solve", exact: true })).toBeVisible();
  await expect(page.getByLabel("Expression or equation")).toBeEditable();
});

test("forced colors preserve semantic controls and error announcements", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Solve", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("INPUT_REQUIRED");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
});
