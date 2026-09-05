const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, format, simplify, treeEquals, ZimError } = require("../dist");

const simplified = (source, options) => simplify(parse(source), options).expression;

test("folds exact constants", () => {
  assert.equal(format(simplified("1/3 + 1/6")), "1/2");
  assert.equal(format(simplified("2^-3")), "1/8");
  assert.equal(format(simplified("7 mod 4")), "3");
});

test("applies zero, one, sign, and power identities", () => {
  assert.equal(format(simplified("0 + x")), "x");
  assert.equal(format(simplified("x * 1")), "x");
  assert.equal(format(simplified("x * 0")), "0");
  assert.equal(format(simplified("--x")), "x");
  assert.equal(format(simplified("x^1")), "x");
});

test("requires explicit nonzero assumptions for domain-changing rules", () => {
  assert.equal(format(simplified("x/x")), "x / x");
  assert.equal(format(simplified("x^0")), "x ^ 0");
  assert.equal(format(simplified("x/x", { nonZeroVariables: ["x"] })), "1");
  assert.equal(format(simplified("x^0", { nonZeroVariables: ["x"] })), "1");
});

test("is deterministic, idempotent, and emits named debug steps", () => {
  const first = simplified("0 + (2 * 3) + x");
  const second = simplify(first).expression;
  assert.ok(treeEquals(first, second));
  const traced = simplify(parse("1 * (2 + 3)"), { debug: true });
  assert.equal(format(traced.expression), "5");
  assert.ok(traced.steps.length > 0);
  assert.ok(traced.steps.every((step) => typeof step.rule === "string"));
});

test("returns typed domain failures", () => {
  assert.throws(
    () => simplified("1/0"),
    (error) => error instanceof ZimError && error.code === "DOMAIN_ERROR",
  );
});
