const test = require("node:test");
const assert = require("node:assert/strict");
const { executeV2 } = require("../dist");

test("solve isolates a variable against a nonzero symbolic coefficient", () => {
  const result = executeV2({
    apiVersion: "2.0-beta",
    operation: "solve",
    expression: "x * y = 2",
    variable: "x",
  });
  assert.equal(result.status, "ok");
  assert.equal(result.result.text, "x = 2 / y, where y != 0");
  assert.deepEqual(result.result.solution.conditions, ["y != 0"]);
  assert.match(result.result.latex, /\\frac\{2\}\{y\}/);
});

test("symbolic product solving does not drop zero-coefficient branches", () => {
  const zeroRight = executeV2({
    apiVersion: "2.0-beta",
    operation: "solve",
    expression: "x * y = 0",
    variable: "x",
  });
  assert.notEqual(zeroRight.result?.text, "x = 0 / y");
  const reversed = executeV2({
    apiVersion: "2.0-beta",
    operation: "solve",
    expression: "2 = y * x",
    variable: "x",
  });
  assert.equal(reversed.result.text, "x = 2 / y, where y != 0");
});
