const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../dist");

function derivative(source, variables = ["x"], options) {
  return core.differentiate(core.parse(source), variables, options);
}

test("differentiation returns an immutable typed exact result", () => {
  const source = core.parse("x^3+sin(x)");
  const snapshot = structuredClone(source);
  const result = core.differentiate(source, ["x"]);
  assert.equal(result.kind, "complete");
  assert.equal(result.exact, true);
  assert.equal(core.format(result.expression), "cos(x) + 3 * x ^ 2");
  assert.deepEqual(source, snapshot);
});

test("product, quotient and chain rules agree with finite differences", () => {
  for (const source of ["x^2*sin(x)", "exp(x^2)", "ln(x)/(x+1)", "sqrt(x+2)"]) {
    const result = derivative(source);
    assert.equal(result.kind, "complete", source);
    const expression = core.parse(source);
    for (const x of [0.4, 1.25, 2.5]) {
      const h = 1e-6;
      const finite =
        (core.evaluate(expression, { x: x + h }) - core.evaluate(expression, { x: x - h })) /
        (2 * h);
      const symbolic = core.evaluate(result.expression, { x });
      assert.ok(Math.abs(symbolic - finite) < 1e-5, `${source} at ${x}`);
    }
  }
});

test("higher and sequential partial derivatives use ordered variables", () => {
  const partial = derivative("x^2*y+y^3", ["x", "y"]);
  assert.equal(partial.kind, "complete");
  assert.equal(core.format(partial.expression), "2 * x");
  const higher = derivative("x^5", ["x", "x", "x"]);
  assert.equal(higher.kind, "complete");
  assert.equal(core.format(higher.expression), "60 * x ^ 2");
});

test("unsupported derivative functions and budgets remain explicit", () => {
  assert.equal(derivative("abs(x)").kind, "unsupported");
  assert.equal(derivative("x^5", ["x", "x"], { maxOrder: 1 }).kind, "incomplete");
  assert.equal(derivative("x^5", ["x"], { maxNodes: 1 }).kind, "incomplete");
});
