const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../dist");

const quadrature = (source, lower, upper, options) =>
  core.numericalIntegrate(
    core.parse(source),
    "x",
    core.rational(lower),
    core.rational(upper),
    options,
  );

test("arbitrary-precision quadrature reports value and error evidence", () => {
  const result = quadrature("sin(x^2)", 0n, 1n, { precisionDigits: 20 });
  assert.equal(result.kind, "complete");
  assert.equal(result.method, "romberg-arbitrary-precision");
  assert.equal(result.precisionDigits, 20);
  assert.equal(result.converged, true);
  assert.match(result.value, /^0\.3102683017233811/);
  assert.ok(Number(result.errorBound) <= 1e-20);
});

test("quadrature precision is not limited to JavaScript Number digits", () => {
  const result = quadrature("x^4", 0n, 1n, { precisionDigits: 30 });
  assert.equal(result.kind, "complete");
  assert.equal(result.value, "0.200000000000000000000000000000");
  assert.ok(result.value.split(".")[1].length === 30);
});

test("quadrature handles elementary compositions and reversed orientation", () => {
  const gaussian = quadrature("exp(-(x^2))", 0n, 1n, { precisionDigits: 20 });
  assert.equal(gaussian.kind, "complete");
  assert.match(gaussian.value, /^0\.7468241328124270/);
  const reversed = quadrature("x^4", 1n, 0n, { precisionDigits: 20 });
  assert.equal(reversed.kind, "complete");
  assert.equal(reversed.value, "-0.20000000000000000000");
});

test("quadrature rejects unproved discontinuities", () => {
  const result = quadrature("1/x", -1n, 1n, { precisionDigits: 20 });
  assert.equal(result.kind, "unsupported");
  assert.match(result.reason, /continu/i);
});

test("quadrature budget exhaustion is explicit", () => {
  const result = quadrature("sin(x^2)", 0n, 1n, {
    precisionDigits: 30,
    maxIterations: 1,
  });
  assert.equal(result.kind, "incomplete");
  assert.equal(result.converged, false);
  const series = quadrature("sin(x^2)", 0n, 1n, {
    precisionDigits: 30,
    maxSeriesTerms: 1,
  });
  assert.equal(series.kind, "incomplete");
  assert.equal(series.reason, "series-budget-exceeded");
});

test("quadrature validates precision and iteration options", () => {
  assert.equal(quadrature("x", 0n, 1n, { precisionDigits: 0 }).kind, "unsupported");
  assert.equal(quadrature("x", 0n, 1n, { precisionDigits: 201 }).kind, "unsupported");
  assert.equal(quadrature("x", 0n, 1n, { maxIterations: -1 }).kind, "unsupported");
});
