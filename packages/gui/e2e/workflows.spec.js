const { test, expect } = require("@playwright/test");

test("keyboard workflow solves and exposes the result accessibly", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Expression or equation").fill("x^2 = 4");
  await page.getByLabel("Solve for").fill("x");
  await page.getByLabel("Expression or equation").press("ControlOrMeta+Enter");
  await expect(page.getByText("x = -2, 2", { exact: true })).toBeAttached();
  await expect(page.locator("#status-output")).toHaveText("Ready");
  await expect(page.locator("#steps-output li").first()).toBeVisible();
  await expect(page.locator("#steps-output details")).toHaveCount(7);
  await expect(page.locator("#steps-output summary").first()).toContainText("solve.result");
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

test("API v2 workbench exercises every developer operation", async ({ page }) => {
  await page.goto("/");
  const expression = page.getByLabel("Expression or equation");
  const operation = page.getByLabel("Operation");
  const run = page.getByRole("button", { name: "Run selected operation" });
  const response = page.locator("#raw-response-output");
  const cases = [
    ["parse", "x + 1"],
    ["simplify", "1 * (2 + 3)"],
    ["solve", "x^2 - 4 < 0"],
    ["solveSystem", "x + y = 5; x - y = 1"],
    ["solveRelation", "x^2 - 4 < 0"],
    ["analyzePolynomial", "x^3 - 2"],
    ["solveNonlinearSystem", "x * y = 2; x + y = 3"],
    ["derive", "sqrt(x + 1) = x - 1"],
    ["format", "(x + 1) * (x - 1)"],
    ["latex", "x^2 = 4"],
  ];
  for (const [name, source] of cases) {
    await operation.selectOption(name);
    await expression.fill(source);
    await run.click();
    await expect(response).toContainText(
      `"operation": "${name === "solve" ? "solveRelation" : name}"`,
    );
  }
  await operation.selectOption("capabilities");
  await run.click();
  await expect(response).toContainText('"release": "2.4.5"');
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(page.locator("#history-output li")).not.toHaveCount(0);
});

test("raw API request mode submits API v2 envelopes", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Request JSON")
    .fill(
      JSON.stringify({ apiVersion: "2.0-beta", requestId: "raw-e2e", operation: "capabilities" }),
    );
  await page.getByRole("button", { name: "Submit raw API request" }).click();
  await expect(page.locator("#raw-response-output")).toContainText('"requestId": "raw-e2e"');
});
