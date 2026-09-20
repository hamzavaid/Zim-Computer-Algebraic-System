const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../datasets/conformance/release-2.0-beta.json"),
    "utf8",
  ),
);

test("2.0 Beta conformance corpus has stable unique identifiers", () => {
  assert.equal(fixtures.length, 12);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
});

test("capability registry is the runtime source of truth", () => {
  const capabilities = core.capabilities();
  assert.equal(capabilities.apiVersions.includes("1.0"), true);
  assert.ok(capabilities.operations.includes("capabilities"));
  assert.ok(capabilities.solverFamilies.includes("polynomial"));
  assert.deepEqual(capabilities.domains, ["real", "complex", "integer", "natural"]);
  assert.ok(capabilities.limits.maxAstNodes > 0);
  const response = core.execute({ version: "1.0", operation: "capabilities" });
  assert.equal(response.status, "ok");
  assert.deepEqual(response.result, capabilities);
});

test("operation-specific v2 requests produce request IDs, timing, and safe diagnostics", () => {
  const response = core.executeV2({
    apiVersion: "2.0-beta",
    requestId: "fixture-request",
    operation: "parse",
    expression: "x + 1",
  });
  assert.equal(response.apiVersion, "2.0-beta");
  assert.equal(response.requestId, "fixture-request");
  assert.equal(response.status, "ok");
  assert.ok(response.timing.totalMs >= 0);
  assert.equal(response.diagnostics.operation, "parse");
  assert.doesNotMatch(JSON.stringify(response.diagnostics), /Parser|CoefficientMap/);
});

test("generalized assumptions detect contradictions", () => {
  const assumptions = core.createAssumptionSet([
    { kind: "domain", symbol: "x", domain: "real" },
    { kind: "positive", expression: core.variable("x") },
  ]);
  assert.equal(core.domainOf(assumptions, "x"), "real");
  assert.equal(core.isKnownPositive(assumptions, core.variable("x")), true);
  assert.equal(assumptions.satisfiable, true);

  const conflict = core.createAssumptionSet([
    { kind: "positive", expression: core.variable("x") },
    { kind: "negative", expression: core.variable("x") },
  ]);
  assert.equal(conflict.satisfiable, false);
  assert.ok(conflict.contradictions.length > 0);
});

test("radicals reduce canonically and idempotently", () => {
  const first = core.simplify(core.parse("sqrt(12)")).expression;
  const second = core.simplify(first).expression;
  assert.equal(core.format(first), "2 * sqrt(3)");
  assert.equal(core.expressionEquals(first, second), true);
});

test("production complex evaluation verifies complex roots", () => {
  const value = core.evaluateComplex(core.parse("x^2 + 1"), { x: { real: 0, imaginary: 1 } });
  assert.ok(Math.abs(value.real) < 1e-12);
  assert.ok(Math.abs(value.imaginary) < 1e-12);
});

test("derivation graphs reject cycles and configured overflows", () => {
  const valid = {
    kind: "derivation-graph",
    roots: ["a"],
    nodes: [
      { id: "a", ruleId: "solve.input", children: ["b"], evidence: { kind: "input" } },
      { id: "b", ruleId: "solve.verified", children: [], evidence: { kind: "verification" } },
    ],
  };
  assert.deepEqual(core.validateDerivationGraph(valid, { maxNodes: 4 }), { valid: true });
  const cyclic = {
    ...valid,
    nodes: [
      { ...valid.nodes[0], children: ["b"] },
      { ...valid.nodes[1], children: ["a"] },
    ],
  };
  assert.equal(core.validateDerivationGraph(cyclic, { maxNodes: 4 }).valid, false);
  assert.equal(core.validateDerivationGraph(valid, { maxNodes: 1 }).valid, false);
});

test("resource budgets and cancellation return stable runtime codes", () => {
  const tracker = new core.BudgetTracker({ maxAstNodes: 2 });
  tracker.consume("astNodes", 2);
  assert.throws(
    () => tracker.consume("astNodes", 1),
    (error) => error.code === "BUDGET_EXCEEDED",
  );
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => core.throwIfAborted(controller.signal),
    (error) => error.code === "REQUEST_CANCELLED",
  );
});

test("algebraic-number groundwork has deterministic public shape", () => {
  const algebraic = core.algebraicRoot("x^3 - 2", 0, { lower: "1", upper: "2" });
  assert.deepEqual(algebraic, {
    kind: "algebraic-root",
    polynomial: "x^3 - 2",
    rootIndex: 0,
    isolatingInterval: { lower: "1", upper: "2" },
  });
});

test("deep expressions return budget-exceeded rather than throwing", () => {
  const expression = `${"(".repeat(40)}x${")".repeat(40)}`;
  const response = core.executeV2({
    apiVersion: "2.0-beta",
    requestId: "deep",
    operation: "parse",
    expression,
    budget: { maxInputLength: 16 },
  });
  assert.equal(response.status, "budget-exceeded");
  assert.equal(response.diagnostics.code, "BUDGET_EXCEEDED");
});
