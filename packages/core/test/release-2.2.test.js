const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../datasets/conformance/release-2.2.json"),
    "utf8",
  ),
);

test("2.2 conformance corpus has stable identifiers and coverage families", () => {
  assert.equal(fixtures.length, 7);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
  assert.deepEqual(
    new Set(fixtures.map((fixture) => fixture.family)),
    new Set([
      "polynomial-inequality",
      "rational-inequality",
      "absolute-value",
      "trigonometric",
      "radical",
    ]),
  );
});

test("parser produces first-class relation AST nodes and canonical formatting", () => {
  const relation = core.parse("x ≤ 2");
  assert.deepEqual(relation, {
    kind: "relation",
    operator: "<=",
    left: core.variable("x"),
    right: core.constant(2),
  });
  assert.equal(core.format(relation), "x <= 2");
  assert.equal(core.serializeSyntaxTree(relation).operator, "<=");
});

test("typed solution sets normalize polynomial and rational inequalities", () => {
  const polynomial = core.solveRelation(core.parse("x^2 - 1 < 0"), { variable: "x" });
  assert.deepEqual(polynomial.solution, {
    kind: "interval",
    lower: core.constant(-1),
    upper: core.constant(1),
    lowerInclusive: false,
    upperInclusive: false,
  });

  const rational = core.solveRelation(core.parse("(x - 1) / (x + 2) >= 0"), {
    variable: "x",
  });
  assert.equal(rational.solution.kind, "union");
  assert.equal(core.formatSolutionSet(rational.solution), "(-∞, -2) ∪ [1, ∞)");
});

test("absolute-value equations and inequalities return typed sets", () => {
  const equality = core.solveRelation(core.parse("abs(x - 2) = 3"), { variable: "x" });
  assert.equal(core.formatSolutionSet(equality.solution), "{-1, 5}");
  const inequality = core.solveRelation(core.parse("abs(x) > 2"), { variable: "x" });
  assert.equal(core.formatSolutionSet(inequality.solution), "(-∞, -2) ∪ (2, ∞)");
});

test("trigonometric solving is range-aware and returns integer-parameter families", () => {
  const periodic = core.solveRelation(core.parse("sin(x) = 0"), { variable: "x" });
  assert.equal(periodic.solution.kind, "parameterized");
  assert.equal(periodic.solution.parameter, "k");
  assert.equal(periodic.solution.parameterDomain, "integer");
  assert.equal(core.format(periodic.solution.expression), "k * pi");
  const impossible = core.solveRelation(core.parse("sin(x) = 2"), { variable: "x" });
  assert.deepEqual(impossible.solution, { kind: "empty" });
});

test("radical transformations retain accepted and rejected candidate evidence", () => {
  const result = core.solveRelation(core.parse("sqrt(x + 1) = x - 1"), { variable: "x" });
  assert.equal(core.formatSolutionSet(result.solution), "{3}");
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(core.format(result.rejected[0].candidate), "0");
  assert.match(result.rejected[0].reason, /original relation/i);
});

test("piecewise branches are solved with their guards and candidates are verified", () => {
  const result = core.solvePiecewise(
    [
      { condition: core.parse("x < 0"), expression: core.parse("-x") },
      { condition: core.parse("x >= 0"), expression: core.parse("x") },
    ],
    core.constant(2),
    { variable: "x" },
  );
  assert.equal(core.formatSolutionSet(result.solution), "{-2, 2}");
  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 0);
});

test("assumption sets detect zero/sign contradictions", () => {
  const assumptions = core.createAssumptionSet([
    { kind: "positive", expression: core.variable("x") },
    { kind: "zero", expression: core.variable("x") },
  ]);
  assert.equal(assumptions.satisfiable, false);
  assert.match(assumptions.contradictions[0], /zero/i);
});

test("v2 solveRelation results are JSON-safe and preserve typed unions", () => {
  const response = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "solveRelation",
    relation: "(x - 1) / (x + 2) >= 0",
    variable: "x",
  });
  assert.equal(response.status, "ok");
  assert.equal(response.result.solution.kind, "union");
  assert.doesNotThrow(() => JSON.stringify(response));
});
