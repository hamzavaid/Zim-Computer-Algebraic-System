const { test, expect } = require("@playwright/test");

test("keyboard workflow solves and exposes the result accessibly", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Expression or equation").fill("x^2 = 4");
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("Backend trace").check();
  await page.getByLabel("Solve for").fill("x");
  await page.getByLabel("Expression or equation").press("ControlOrMeta+Enter");
  await expect(page.locator("#result-output")).toHaveText("x = -2, 2");
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
  await expect(page.getByRole("button", { name: "Run Operation" })).toBeVisible();
  await expect(page.getByLabel("Expression or equation")).toBeEditable();
});

test("forced colors preserve semantic controls and error announcements", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Run Operation" }).click();
  await expect(page.getByRole("alert")).toContainText("INPUT_REQUIRED");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
});

test("API v2 workbench exercises every developer operation", async ({ page }) => {
  await page.goto("/");
  const expression = page.getByLabel("Expression or equation");
  const operation = page.getByLabel("Operation");
  const run = page.getByRole("button", { name: "Run Operation" });
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("API developer inspection").check();
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
  await expect(response).toContainText('"release": "2.5.0"');
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(page.locator("#history-output li")).not.toHaveCount(0);
});

test("raw API request mode submits API v2 envelopes", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("API developer inspection").check();
  await page
    .getByLabel("Request JSON")
    .fill(
      JSON.stringify({ apiVersion: "2.0-beta", requestId: "raw-e2e", operation: "capabilities" }),
    );
  await page.getByRole("button", { name: "Submit raw API request" }).click();
  await expect(page.locator("#raw-response-output")).toContainText('"requestId": "raw-e2e"');
});

test("relation result is visible above API inspection", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Expression or equation").fill("5 ≤ x - 2");
  await page.getByRole("button", { name: "Run Operation" }).click();
  await expect(page.locator("#result-output")).toHaveText("7 ≤ x");
  await expect(page.locator("#math-output")).toContainText("7 ≤ x");
  const order = await page
    .locator(".result, .raw-panel")
    .evaluateAll((elements) =>
      elements.map((element) => (element.classList.contains("result") ? "result" : "raw")),
    );
  expect(order).toEqual(["result", "raw"]);
});

test("operation controls, capability summary, and LaTeX follow selected operation", async ({
  page,
}) => {
  await page.goto("/");
  const operation = page.getByLabel("Operation");
  const run = page.getByRole("button", { name: "Run Operation" });
  await expect(page.getByLabel("Variables")).toBeHidden();
  await operation.selectOption("solveNonlinearSystem");
  await expect(page.getByLabel("Variables")).toBeVisible();
  await expect(page.getByLabel("Initial guess")).toBeHidden();
  await page.getByLabel("Mode", { exact: true }).selectOption("numeric");
  await expect(page.getByLabel("Initial guess")).toBeVisible();
  await operation.selectOption("capabilities");
  await expect(page.getByLabel("Expression or equation")).toBeHidden();
  await run.click();
  await expect(page.locator("#math-output")).toContainText("Release 2.5.0");
  await expect(page.locator(".raw-panel")).toBeHidden();
  await operation.selectOption("solveRelation");
  await page.getByLabel("Expression or equation").fill("sqrt(x + 1) = x - 1");
  await run.click();
  await expect(page.locator("#math-output")).toContainText("x ∈ {3}");
  await expect(page.locator("#latex-output")).toContainText("\\sqrt");
});

test("pretty results are default and JSON can be shown alongside them", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Operation").selectOption("solveNonlinearSystem");
  await page.getByLabel("Expression or equation").fill("x*y=2; x+y=3");
  await page.getByRole("button", { name: "Run Operation" }).click();
  await expect(page.locator("#math-output")).toContainText("x = 2, y = 1");
  await expect(page.locator("#result-json-output")).toBeHidden();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByLabel("Show result JSON").check();
  await expect(page.locator("#result-json-output")).toContainText('"kind": "finite"');
  await expect(page.locator("#math-output")).toContainText("x = 2, y = 1");
  await page.getByLabel("Operation").selectOption("analyzePolynomial");
  await page.getByLabel("Expression or equation").fill("x^3 - 2");
  await page.getByRole("button", { name: "Run Operation" }).click();
  await expect(page.locator("#math-output")).toContainText("Degree: 3");
  await expect(page.locator("#result-json-output")).toContainText('"complexRoots"');
});

test("calculus operations expose only their controls and render exact output", async ({ page }) => {
  await page.goto("/");
  const operation = page.getByLabel("Operation");
  const expression = page.getByLabel("Expression or equation");
  const run = page.getByRole("button", { name: "Run Operation" });

  await operation.selectOption("differentiate");
  await page.getByLabel("Variables").fill("x");
  await expression.fill("x^3");
  await run.click();
  await expect(page.locator("#result-output")).toContainText("3 * x ^ 2");
  await expect(page.locator("#latex-output")).toContainText("{x}^{2}");

  await operation.selectOption("limit");
  await expect(page.getByLabel("Approach")).toBeVisible();
  await expression.fill("sin(x) / x");
  await run.click();
  await expect(page.locator("#result-output")).toContainText("= 1");

  await operation.selectOption("integrate");
  await expect(page.getByLabel("Precision digits")).toBeHidden();
  await page.getByLabel("Integration mode").selectOption("numeric");
  await expect(page.getByLabel("Precision digits")).toBeVisible();
  await page.getByLabel("Lower bound").fill("0");
  await page.getByLabel("Upper bound").fill("1");
  await expression.fill("x^2");
  await run.click();
  await expect(page.locator("#result-output")).toContainText("0.333333");
});
