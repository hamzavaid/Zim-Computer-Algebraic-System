const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { evaluate, format, parse, solveFor } = require("../dist");

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../datasets/future/quadratic-equations.json"),
    "utf8",
  ),
);
const legacyFixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../datasets/regression/legacy-cases.json"),
    "utf8",
  ),
);

test("solves and verifies every supported real quadratic fixture", () => {
  assert.equal(fixtures.length, 25);
  for (const fixture of fixtures) {
    const equation = parse(fixture.equation);
    const result = solveFor(equation, fixture.variable);
    if (fixture.domain === "complex") {
      assert.equal(result.kind, "unsupported", fixture.equation);
      assert.match(result.reason, /complex/i);
      continue;
    }
    const values = result.kind === "solution" ? [result.value] : result.values;
    assert.ok(result.kind === "solution" || result.kind === "multiple-solutions", fixture.equation);
    assert.equal(values.length, fixture.solutions.length, fixture.equation);
    assert.equal(result.verified, true);
    for (const value of values) {
      const numericValue = evaluate(value);
      const left = evaluate(equation.left, { [fixture.variable]: numericValue });
      const right = evaluate(equation.right, { [fixture.variable]: numericValue });
      assert.ok(Math.abs(left - right) < 1e-8, `${fixture.equation}: ${format(value)}`);
    }
  }
});

test("solves every legacy case assigned to the quadratic milestone", () => {
  const quadraticCases = legacyFixtures.filter((fixture) => fixture.milestone === "week-8");
  assert.ok(quadraticCases.length >= 5);
  for (const fixture of quadraticCases) {
    const result = solveFor(parse(fixture.input), "x");
    const values = result.kind === "solution" ? [result.value] : result.values;
    assert.ok(result.kind === "solution" || result.kind === "multiple-solutions", fixture.input);
    assert.equal(values.map(format).join(", "), fixture.expected, fixture.input);
  }
});

test("returns exact roots for square discriminants", () => {
  const twoRoots = solveFor(parse("2*x^2 + 3*x - 2 = 0"), "x");
  assert.equal(twoRoots.kind, "multiple-solutions");
  assert.deepEqual(twoRoots.values.map(format), ["-2", "1/2"]);

  const repeated = solveFor(parse("4*x^2 + 4*x + 1 = 0"), "x");
  assert.equal(repeated.kind, "solution");
  assert.equal(format(repeated.value), "-1/2");
});

test("returns symbolic real roots and explicit unsupported degree boundaries", () => {
  const irrational = solveFor(parse("x^2 - 2 = 0"), "x");
  assert.equal(irrational.kind, "multiple-solutions");
  assert.ok(irrational.values.every((value) => format(value).includes("sqrt")));
  assert.match(solveFor(parse("x^3 = 8"), "x").reason, /degree 3/i);
  assert.match(solveFor(parse("x^2 + 1 = 0"), "x").reason, /complex/i);
});

test("reduces cancelled higher-degree terms before selecting a solver", () => {
  const result = solveFor(parse("x^2 + x = x^2 + 2"), "x");
  assert.equal(result.kind, "solution");
  assert.equal(format(result.value), "2");
});
