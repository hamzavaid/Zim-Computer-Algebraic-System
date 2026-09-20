const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../datasets/conformance/release-2.3.json"),
    "utf8",
  ),
);
const equations = (fixture) => fixture.equations.map(core.parse);

test("2.3 conformance corpus has stable identifiers", () => {
  assert.equal(fixtures.length, 6);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
});

test("exact nonlinear substitution solves and verifies every candidate tuple", () => {
  for (const id of ["circle-line", "product-sum", "inconsistent"]) {
    const fixture = fixtures.find((entry) => entry.id === id);
    const result = core.solveNonlinearSystem(equations(fixture), fixture.variables);
    if (fixture.solutions === 0) assert.equal(result.kind, "no-solution", id);
    else {
      assert.equal(result.kind, "finite", id);
      assert.equal(result.solutions.length, fixture.solutions, id);
      assert.ok(
        result.solutions.every((solution) => solution.verified),
        id,
      );
      assert.equal(result.method, "substitution", id);
    }
  }
});

test("bounded resultant elimination solves systems without a linear branch", () => {
  const fixture = fixtures.find((entry) => entry.id === "resultant-squares");
  const result = core.solveNonlinearSystem(equations(fixture), fixture.variables);
  assert.equal(result.kind, "finite");
  assert.equal(result.method, "resultant");
  assert.equal(result.solutions.length, 4);
  const tuples = result.solutions.map((solution) =>
    fixture.variables.map((name) => core.format(solution.values[name])).join(","),
  );
  assert.deepEqual(tuples.sort(), ["-2,-1", "-2,1", "2,-1", "2,1"]);
});

test("underdetermined systems return an explicit positive-dimensional result", () => {
  const fixture = fixtures.find((entry) => entry.id === "positive-dimensional");
  const result = core.solveNonlinearSystem(equations(fixture), fixture.variables);
  assert.equal(result.kind, "positive-dimensional");
  assert.equal(result.dimension, 1);
  assert.equal(result.constraints.length, 1);
  assert.equal(result.verified, true);
});

test("opt-in Newton solving reports convergence, Jacobian diagnostics, and residuals", () => {
  const fixture = fixtures.find((entry) => entry.id === "numeric-newton");
  const result = core.solveNonlinearSystem(equations(fixture), fixture.variables, {
    mode: "numeric",
    initialGuess: { x: 0.8, y: 0.6 },
    tolerance: 1e-12,
    maxIterations: 40,
  });
  assert.equal(result.kind, "finite");
  assert.equal(result.method, "newton");
  assert.equal(result.solutions.length, 1);
  assert.ok(result.solutions[0].residual < 1e-10);
  assert.equal(result.diagnostics.converged, true);
  assert.ok(Math.abs(result.diagnostics.jacobianDeterminant) > 1e-6);
});

test("nonlinear guards return explicit incomplete results", () => {
  const fixture = fixtures.find((entry) => entry.id === "resultant-squares");
  const result = core.solveNonlinearSystem(equations(fixture), fixture.variables, {
    maxResultantDegree: 1,
  });
  assert.equal(result.kind, "incomplete");
  assert.equal(result.reason, "resultant-degree-budget-exceeded");
});

test("v2 nonlinear-system results are JSON-safe", () => {
  const response = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "solveNonlinearSystem",
    equations: ["x * y = 2", "x + y = 3"],
    variables: ["x", "y"],
  });
  assert.equal(response.status, "ok");
  assert.equal(response.result.kind, "finite");
  assert.doesNotThrow(() => JSON.stringify(response));
});
