const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parse,
  format,
  rational,
  addExact,
  expressionEquals,
  containsVariable,
  substitute,
  evaluate,
  cloneExpression,
} = require("../dist");

test("keeps rational arithmetic exact and reduced", () => {
  assert.deepEqual(rational(2n, 4n), { kind: "rational", numerator: 1n, denominator: 2n });
  assert.equal(format(addExact(rational(1n, 3n), rational(1n, 6n))), "1/2");
});

test("provides structural equality, immutable substitution, and cloning", () => {
  const source = parse("x + 1/3");
  const replaced = substitute(source, "x", rational(2n));
  assert.equal(format(source), "x + 1 / 3");
  assert.equal(format(replaced), "2 + 1 / 3");
  assert.ok(expressionEquals(source, cloneExpression(source)));
  assert.ok(containsVariable(source, "x"));
  assert.ok(!containsVariable(replaced, "x"));
});

test("evaluates numerically only with explicit variable values", () => {
  assert.equal(evaluate(parse("x^2 + 1/2"), { x: 3 }), 9.5);
  assert.throws(() => evaluate(parse("x + 1")), /No numeric value/);
});
