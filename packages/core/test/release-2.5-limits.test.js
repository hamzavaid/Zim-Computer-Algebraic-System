const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../dist");

const limit = (source, point, options) => core.limit(core.parse(source), "x", point, options);

test("limits use exact direct substitution when continuous", () => {
  const result = limit("x^2+1", core.rational(2n));
  assert.equal(result.kind, "finite");
  assert.equal(core.format(result.value), "5");
  assert.equal(result.exact, true);
});

test("rational limits cancel removable factors exactly", () => {
  const result = limit("(x^2-1)/(x-1)", core.rational(1n));
  assert.equal(result.kind, "finite");
  assert.equal(core.format(result.value), "2");
  assert.equal(result.method, "rational-local-order");
});

test("one-sided pole limits preserve direction and sign", () => {
  assert.deepEqual(limit("1/x", core.rational(0n), { direction: "right" }).sign, 1);
  assert.deepEqual(limit("1/x", core.rational(0n), { direction: "left" }).sign, -1);
  assert.equal(limit("1/x", core.rational(0n)).kind, "unsupported");
  const even = limit("1/x^2", core.rational(0n));
  assert.equal(even.kind, "infinite");
  assert.equal(even.sign, 1);
});

test("limits at infinity use exact leading-degree analysis", () => {
  const ratio = limit("(2*x^3+x)/(x^3-4)", "infinity");
  assert.equal(ratio.kind, "finite");
  assert.equal(core.format(ratio.value), "2");
  const negative = limit("x^3", "-infinity");
  assert.equal(negative.kind, "infinite");
  assert.equal(negative.sign, -1);
});

test("selected indeterminate elementary forms are explicit and bounded", () => {
  const sine = limit("sin(x)/x", core.rational(0n));
  assert.equal(sine.kind, "finite");
  assert.equal(core.format(sine.value), "1");
  assert.equal(limit("sin(1/x)", core.rational(0n)).kind, "unsupported");
  assert.equal(limit("x+1", core.rational(0n), { maxNodes: 1 }).kind, "incomplete");
});
