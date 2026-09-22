const test = require("node:test");
const assert = require("node:assert/strict");
const { executeV2 } = require("../../core/dist");
const { presentResult } = require("../public/resultPresenter");

test("nonlinear system JSON becomes readable solution tuples", () => {
  const response = executeV2({
    apiVersion: "2.0-beta",
    operation: "solveNonlinearSystem",
    equations: ["x*y=2", "x+y=3"],
    variables: ["x", "y"],
  });
  const presented = presentResult("solveNonlinearSystem", response.result, ["x", "y"]);
  assert.match(presented.text, /2 solutions/);
  assert.match(presented.text, /x = 2, y = 1/);
  assert.match(presented.text, /x = 1, y = 2/);
  assert.doesNotMatch(presented.text, /"kind"/);
});

test("polynomial analysis JSON becomes a concise mathematical report", () => {
  const response = executeV2({
    apiVersion: "2.0-beta",
    operation: "analyzePolynomial",
    expression: "x^3 - 2",
    variable: "x",
  });
  const presented = presentResult("analyzePolynomial", response.result, ["x"]);
  assert.match(presented.text, /degree: 3/i);
  assert.match(presented.text, /Real roots/);
  assert.match(presented.text, /Complex roots/);
  assert.doesNotMatch(presented.text, /"complexRoots"/);
});

test("unsupported and incomplete results remain explicit", () => {
  assert.match(
    presentResult("solveNonlinearSystem", { kind: "unsupported", reason: "outside bounds" }, ["x"])
      .text,
    /Unsupported: outside bounds/,
  );
  assert.match(
    presentResult("analyzePolynomial", { kind: "incomplete", reason: "budget" }, ["x"]).text,
    /Incomplete: budget/,
  );
});
