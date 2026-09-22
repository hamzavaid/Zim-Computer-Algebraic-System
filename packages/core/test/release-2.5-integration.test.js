const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../dist");

const integrate = (source, options) => core.integrate(core.parse(source), "x", options);

test("polynomial antiderivatives include a constant and verify by differentiation", () => {
  const result = integrate("x^3+2*x");
  assert.equal(result.kind, "complete");
  assert.equal(result.exact, true);
  assert.equal(result.verified, true);
  assert.match(core.format(result.expression), /C/);
  const check = core.differentiate(result.expression, ["x"]);
  assert.equal(check.kind, "complete");
  assert.equal(
    core.expressionEquals(
      core.simplify(check.expression).expression,
      core.simplify(core.parse("x^3+2*x")).expression,
    ),
    true,
  );
});

test("the integration registry supports elementary linear-inner rules", () => {
  for (const source of ["exp(2*x)", "sin(3*x)", "cos(x)", "ln(x)", "1/x"]) {
    const result = integrate(source);
    assert.equal(result.kind, "complete", source);
    assert.equal(result.verified, true, source);
  }
  assert.ok(integrate("1/x").conditions.some((value) => value.includes("x > 0")));
});

test("unsupported symbolic integrals return a typed unevaluated result", () => {
  const result = integrate("sin(x^2)");
  assert.equal(result.kind, "unevaluated");
  assert.equal(core.format(result.integrand), "sin(x ^ 2)");
});

test("definite integration uses verified primitives and checks domains", () => {
  const polynomial = integrate("x^2", { lower: core.rational(0n), upper: core.rational(3n) });
  assert.equal(polynomial.kind, "definite");
  assert.equal(core.format(polynomial.value), "9");
  assert.equal(polynomial.verified, true);
  assert.equal(
    integrate("1/x", { lower: core.rational(-1n), upper: core.rational(1n) }).kind,
    "unsupported",
  );
});

test("integration budgets and malformed bound pairs are explicit", () => {
  assert.equal(integrate("x^2", { maxNodes: 1 }).kind, "incomplete");
  assert.equal(integrate("x", { lower: core.rational(0n) }).kind, "unsupported");
});
