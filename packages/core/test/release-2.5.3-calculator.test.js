const test = require("node:test");
const assert = require("node:assert/strict");
const { calculate, executeV2, parse } = require("../dist");

test("scientific calculator keeps exact arithmetic exact", () => {
  const result = calculate(parse("1/3 + 1/6"), { mode: "exact" });
  assert.equal(result.kind, "exact");
  assert.equal(result.text, "1/2");
  assert.equal(result.latex, "\\frac{1}{2}");
});

test("scientific calculator evaluates supported constants and functions safely", () => {
  const radians = calculate(parse("sin(pi / 2) + sqrt(9)"), { mode: "decimal" });
  assert.equal(radians.kind, "decimal");
  assert.equal(radians.value, 4);
  assert.equal(radians.text, "4");

  const degrees = calculate(parse("sin(30)"), { mode: "decimal", angleUnit: "degrees" });
  assert.equal(degrees.kind, "decimal");
  assert.ok(Math.abs(degrees.value - 0.5) < 1e-14);
});

test("scientific calculator rejects variables and invalid domains explicitly", () => {
  assert.equal(calculate(parse("x + 1"), { mode: "decimal" }).kind, "unsupported");
  assert.equal(calculate(parse("sqrt(-1)"), { mode: "decimal" }).kind, "invalid");
  assert.equal(calculate(parse("1 / 0"), { mode: "decimal" }).kind, "invalid");
  assert.equal(
    calculate(parse("tan(90)"), { mode: "decimal", angleUnit: "degrees" }).kind,
    "invalid",
  );
  assert.equal(calculate(parse("10^10000"), { mode: "decimal" }).kind, "invalid");
});

test("API v2 exposes JSON-safe scientific calculation", () => {
  const response = executeV2({
    apiVersion: "2.0-beta",
    operation: "calculate",
    expression: "cos(60) + 2^3",
    mode: "decimal",
    angleUnit: "degrees",
    precisionDigits: 12,
  });
  assert.equal(response.status, "ok");
  assert.equal(response.result.kind, "decimal");
  assert.equal(response.result.text, "8.5");
  assert.equal(response.result.latex, "8.5");
});
