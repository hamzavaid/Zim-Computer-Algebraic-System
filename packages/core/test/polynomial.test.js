const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  coefficient,
  coefficientMap,
  degree,
  format,
  parse,
  polynomialEquals,
  polynomialToExpression,
  simplify,
} = require("../dist");

const fixturePath = path.resolve(
  __dirname,
  "../../../datasets/regression/polynomial-expressions.json",
);
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

test("converts the polynomial dataset to exact coefficient maps", () => {
  for (const fixture of fixtures) {
    const result = coefficientMap(parse(fixture.expression), fixture.variable);
    assert.equal(result.kind, "polynomial", fixture.expression);
    const polynomial = result.polynomial;
    assert.equal(degree(polynomial), fixture.degree, fixture.expression);
    for (const [exponent, expected] of Object.entries(fixture.coefficients)) {
      assert.equal(format(coefficient(polynomial, Number(exponent))), expected, fixture.expression);
    }
    assert.equal(polynomial.coefficients.size, Object.keys(fixture.coefficients).length);
  }
});

test("round-trips every supported polynomial without losing exact coefficients", () => {
  for (const fixture of fixtures) {
    const original = coefficientMap(parse(fixture.expression), fixture.variable).polynomial;
    const rebuilt = polynomialToExpression(original);
    const roundTrip = coefficientMap(rebuilt, fixture.variable);
    assert.equal(roundTrip.kind, "polynomial", fixture.expression);
    assert.ok(polynomialEquals(original, roundTrip.polynomial), fixture.expression);
  }
});

test("combines like terms and distributed forms in the default simplifier", () => {
  const combined = simplify(parse("3*x + 2*x")).expression;
  assert.equal(format(combined), "5 * x");
  assert.equal(format(simplify(combined).expression), "5 * x");
  assert.equal(format(simplify(parse("x + x")).expression), "2 * x");
  assert.equal(format(simplify(parse("2*(x + 3)")).expression), "6 + 2 * x");
  assert.equal(format(simplify(parse("(x + 1)*(x - 1)")).expression), "-1 + x ^ 2");
});

test("rejects unsupported polynomial domains explicitly", () => {
  const cases = ["x + y", "1/x", "x^-1", "x^0", "ln(x)", "x mod 2"];
  for (const expression of cases) {
    const result = coefficientMap(parse(expression), "x");
    assert.equal(result.kind, "unsupported", expression);
    assert.ok(result.reason.length > 0);
  }
});
