const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { executeV2 } = require("../dist");

const base = { apiVersion: "2.0-beta" };

test("calculus API returns exact text, LaTeX, and serialized expressions", () => {
  const derivative = executeV2({
    ...base,
    operation: "differentiate",
    expression: "x^3",
    variables: ["x"],
  });
  assert.equal(derivative.status, "ok");
  assert.match(derivative.result.text, /3 \* x \^ 2/);
  assert.match(derivative.result.latex, /\{x\}\^\{2\}/);

  const bounded = executeV2({
    ...base,
    operation: "limit",
    expression: "sin(x)/x",
    variable: "x",
    point: "0",
  });
  assert.equal(bounded.status, "ok");
  assert.match(bounded.result.text, /= 1$/);

  const integral = executeV2({ ...base, operation: "integrate", expression: "x^2", variable: "x" });
  assert.equal(integral.status, "ok");
  assert.match(integral.result.text, /\+ C$/);
  assert.equal(integral.result.verified, true);
});

test("calculus API preserves unsupported, incomplete, and numeric evidence", () => {
  const unsupported = executeV2({
    ...base,
    operation: "integrate",
    expression: "sin(x^2)",
    variable: "x",
  });
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.result.kind, "unevaluated");

  const numeric = executeV2({
    ...base,
    operation: "integrate",
    expression: "exp(-x^2)",
    variable: "x",
    lower: "0",
    upper: "1",
    integrationMode: "numeric",
    precisionDigits: 20,
  });
  assert.equal(numeric.status, "ok");
  assert.equal(numeric.result.converged, true);
  assert.equal(numeric.result.precisionDigits, 20);
  assert.equal(typeof numeric.result.errorBound, "string");
});

test("calculus API rejects malformed bounds and points", () => {
  assert.equal(
    executeV2({ ...base, operation: "differentiate", expression: "x", variables: [] }).status,
    "invalid",
  );
  assert.equal(
    executeV2({ ...base, operation: "limit", expression: "x", variable: "x", point: "x" }).status,
    "invalid",
  );
  assert.equal(
    executeV2({ ...base, operation: "integrate", expression: "x", variable: "x", lower: "0" })
      .status,
    "invalid",
  );
});

test("calculus API accepts exact negative and rational bounds", () => {
  const bounded = executeV2({
    ...base,
    operation: "integrate",
    expression: "x",
    variable: "x",
    lower: "-1/2",
    upper: "1/2",
  });
  assert.equal(bounded.status, "ok");
  const point = executeV2({
    ...base,
    operation: "limit",
    expression: "x^2",
    variable: "x",
    point: "-1/2",
  });
  assert.equal(point.status, "ok");
  assert.match(point.result.text, /= 1\/4$/);
});

test("release 2.5 conformance dataset has stable ids and expected classifications", () => {
  const cases = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../../datasets/conformance/release-2.5.json"),
      "utf8",
    ),
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of cases) {
    const response = executeV2({ ...base, ...item.request });
    assert.equal(response.status, item.status, item.id);
    assert.equal(response.result.kind, item.kind, item.id);
  }
});
