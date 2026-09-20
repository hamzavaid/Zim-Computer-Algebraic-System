const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../datasets/conformance/release-2.1.json"),
    "utf8",
  ),
);

test("2.1 conformance corpus has stable unique identifiers", () => {
  assert.equal(fixtures.length, 6);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
});

test("square-free decomposition preserves repeated-root multiplicities", () => {
  const decomposition = core.squareFreeDecomposition(core.parse("(x - 1)^3 * (x + 2)^2"), "x");
  assert.equal(decomposition.kind, "complete");
  assert.deepEqual(
    decomposition.factors.map((factor) => factor.multiplicity).sort((a, b) => a - b),
    [2, 3],
  );
  assert.equal(decomposition.totalDegree, 5);
});

test("Sturm sequences certify exact real-root counts", () => {
  for (const fixture of fixtures) {
    const result = core.countDistinctRealRoots(core.parse(fixture.expression), "x");
    assert.equal(result.kind, "complete", fixture.id);
    assert.equal(result.count, fixture.distinctRealRoots, fixture.id);
  }
});

test("real-root isolating intervals are disjoint and individually certified", () => {
  const result = core.isolateRealRoots(core.parse("x^3 - x"), "x");
  assert.equal(result.kind, "complete");
  assert.equal(result.intervals.length, 3);
  for (const interval of result.intervals) assert.equal(interval.rootCount, 1);
  for (let index = 1; index < result.intervals.length; index += 1) {
    assert.ok(
      core.compareExact(result.intervals[index - 1].upper, result.intervals[index].lower) <= 0,
    );
  }
});

test("arbitrary-precision real refinement returns a 30-digit certified bracket", () => {
  const result = core.approximateRealRoots(core.parse("x^2 - 2"), "x", { decimalDigits: 30 });
  assert.equal(result.kind, "complete");
  assert.equal(result.roots.length, 2);
  const positive = result.roots.find((root) => !root.lower.startsWith("-"));
  assert.ok(positive);
  assert.match(positive.lower, /^1\.41421356237309504880168872420/);
  assert.match(positive.upper, /^1\.41421356237309504880168872421/);
  assert.equal(positive.multiplicity, 1);
});

test("complex root approximation accounts for degree and reports residual diagnostics", () => {
  for (const expression of ["x^3 - 1", "x^5 + x + 1"]) {
    const result = core.approximateComplexRoots(core.parse(expression), "x", {
      tolerance: 1e-11,
      maxIterations: 2000,
    });
    assert.equal(result.kind, "complete", expression);
    assert.equal(result.roots.length, Number(expression.match(/\^(\d+)/)[1]), expression);
    assert.ok(
      result.roots.every((root) => root.residual <= 1e-8),
      expression,
    );
    assert.ok(
      result.roots.every((root) => root.converged),
      expression,
    );
  }
});

test("complex reconciliation preserves multiplicity and identifies exact rational roots", () => {
  const result = core.approximateComplexRoots(core.parse("(x - 1)^3 * (x + 2)^2"), "x", {
    tolerance: 1e-12,
    maxIterations: 1000,
  });
  assert.equal(result.kind, "complete");
  assert.equal(
    result.roots.reduce((sum, root) => sum + root.multiplicity, 0),
    5,
  );
  assert.deepEqual(
    result.roots.map((root) => [core.format(root.exact), root.multiplicity]),
    [
      ["-2", 2],
      ["1", 3],
    ],
  );
});

test("polynomial analysis is deterministic and reports exhausted budgets explicitly", () => {
  const first = core.analyzePolynomialRoots(core.parse("x^3 - 2"), "x");
  const second = core.analyzePolynomialRoots(core.parse("x^3 - 2"), "x");
  assert.deepEqual(first, second);
  assert.equal(first.kind, "complete");
  assert.equal(first.degree, 3);
  assert.equal(first.complexRoots.length, 3);

  const exhausted = core.approximateComplexRoots(core.parse("x^5 + x + 1"), "x", {
    maxIterations: 1,
    tolerance: 1e-30,
  });
  assert.equal(exhausted.kind, "incomplete");
  assert.equal(exhausted.reason, "iteration-budget-exceeded");
  assert.ok(exhausted.unresolved > 0);
});

test("v2 exposes polynomial analysis through an operation-specific request", () => {
  const response = core.executeV2({
    apiVersion: "2.0-beta",
    requestId: "polynomial-analysis",
    operation: "analyzePolynomial",
    expression: "x^3 - 2",
    variable: "x",
  });
  assert.equal(response.status, "ok");
  assert.equal(response.result.kind, "complete");
  assert.equal(response.result.degree, 3);
  assert.equal(response.diagnostics.operation, "analyzePolynomial");
});
