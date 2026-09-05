const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, format, normalize, treeEquals } = require("../dist");

test("flattens, orders, and canonicalizes associative expressions", () => {
  const forms = ["x + (2 + y)", "(y + x) + 2", "2 + y + x"].map((input) => normalize(parse(input)));
  assert.ok(forms.every((form) => treeEquals(form, forms[0])));
  assert.equal(format(forms[0]), "2 + x + y");
});

test("normalizes subtraction and signs", () => {
  assert.equal(format(normalize(parse("x - -y"))), "x + y");
  assert.equal(format(normalize(parse("(-x) * (-y)"))), "x * y");
});

test("is idempotent and leaves the original AST unchanged", () => {
  const original = parse("y + (x + 2)");
  const before = format(original);
  const once = normalize(original);
  const twice = normalize(once);
  assert.ok(treeEquals(once, twice));
  assert.equal(format(original), before);
});
