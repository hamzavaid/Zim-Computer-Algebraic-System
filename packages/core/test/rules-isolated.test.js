const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parse,
  format,
  simplifyExpression,
  constantFoldingRule,
  identityRule,
  likeTermRule,
  signRule,
  powerRule,
  safeCancellationRule,
  ZimError,
  variable,
} = require("../dist");

test("constant-folding rule works in isolation", () => {
  assert.equal(
    format(simplifyExpression(parse("2 + 3"), {}, [constantFoldingRule]).expression),
    "5",
  );
});

test("identity rule works in isolation", () => {
  assert.equal(format(simplifyExpression(parse("x * 1"), {}, [identityRule]).expression), "x");
});

test("sign rule works in isolation", () => {
  assert.equal(format(simplifyExpression(parse("--x"), {}, [signRule]).expression), "x");
});

test("power rule works in isolation", () => {
  assert.equal(format(simplifyExpression(parse("x^1"), {}, [powerRule]).expression), "x");
});

test("safe cancellation rule works only with its assumption in isolation", () => {
  assert.equal(
    format(simplifyExpression(parse("x/x"), {}, [safeCancellationRule]).expression),
    "x / x",
  );
  assert.equal(
    format(
      simplifyExpression(parse("x/x"), { nonZeroVariables: ["x"] }, [safeCancellationRule])
        .expression,
    ),
    "1",
  );
});

test("like-term rule works in isolation", () => {
  assert.equal(
    format(simplifyExpression(parse("3*x + 2*x"), {}, [likeTermRule]).expression),
    "5 * x",
  );
});

test("fixed-point engine detects a non-terminating custom rule", () => {
  const toggle = {
    name: "test-toggle",
    apply(expression) {
      if (expression.kind !== "variable") return undefined;
      return variable(expression.name === "x" ? "y" : "x");
    },
  };
  assert.throws(
    () => simplifyExpression(parse("x"), { maxIterations: 4 }, [toggle]),
    (error) => error instanceof ZimError && error.code === "ITERATION_LIMIT",
  );
});
