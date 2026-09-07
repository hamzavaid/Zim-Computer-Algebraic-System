const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { format, parse, solveFor, verifySolution } = require("../dist");

const fixturePath = path.resolve(__dirname, "../../../datasets/regression/linear-equations.json");
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const legacyFixturePath = path.resolve(__dirname, "../../../datasets/regression/legacy-cases.json");

test("solves and independently verifies the expanded linear regression dataset", () => {
  assert.ok(fixtures.length >= 50);
  for (const fixture of fixtures) {
    const equation = parse(fixture.equation);
    const result = solveFor(equation, fixture.variable);
    assert.equal(result.kind, fixture.kind, fixture.equation);
    if (result.kind === "solution") {
      assert.equal(format(result.value), fixture.expected, fixture.equation);
      assert.equal(result.verified, true, fixture.equation);
      assert.ok(verifySolution(equation, fixture.variable, result.value), fixture.equation);
    }
  }
});

test("solves every legacy case assigned to the linear milestone", () => {
  const legacyCases = JSON.parse(fs.readFileSync(legacyFixturePath, "utf8")).filter(
    (fixture) => fixture.milestone === "week-7",
  );
  assert.ok(legacyCases.length >= 20);
  for (const fixture of legacyCases) {
    const result = solveFor(parse(fixture.input), "x");
    const expectedKind =
      fixture.expected === "identity"
        ? "identity"
        : fixture.expected === "no solution"
          ? "no-solution"
          : "solution";
    assert.equal(result.kind, expectedKind, fixture.input);
    if (result.kind === "solution")
      assert.equal(format(result.value), fixture.expected, fixture.input);
  }
});

test("classifies identities and contradictions", () => {
  assert.deepEqual(solveFor(parse("x = x"), "x"), { kind: "identity" });
  assert.deepEqual(solveFor(parse("x = x + 1"), "x"), { kind: "no-solution" });
});

test("routes advanced equations and retains explicit unsupported boundaries", () => {
  assert.deepEqual(solveFor(parse("x + 1"), "x"), {
    kind: "unsupported",
    reason: "Solving requires an equation",
  });
  assert.equal(format(solveFor(parse("x^3 = 8"), "x").value), "2");
  assert.match(solveFor(parse("x + y = 2"), "x").reason, /variable 'y'/i);
  assert.equal(format(solveFor(parse("ln(x) = 1"), "x").value), "exp(1)");
  assert.match(solveFor(parse("x^3 + x + 1 = 0"), "x").reason, /irreducible/i);
  assert.match(solveFor(parse("x = 1"), "not valid").reason, /invalid variable/i);
});
