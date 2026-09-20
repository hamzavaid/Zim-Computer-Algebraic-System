const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../datasets/conformance/release-2.4.json"),
    "utf8",
  ),
);

test("2.4 conformance corpus has stable identifiers", () => {
  assert.equal(fixtures.length, 3);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
});

test("rule registry exposes stable IDs and localized public metadata", () => {
  const rules = core.derivationRuleRegistry();
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  for (const id of [
    "solve.input",
    "solve.transform",
    "solve.candidate",
    "solve.verify.accepted",
    "solve.verify.rejected",
    "solve.result",
  ]) {
    const metadata = core.derivationRule(id, "en");
    assert.equal(metadata.id, id);
    assert.ok(metadata.title.length > 0);
    assert.ok(metadata.explanation.length > 0);
  }
  assert.notEqual(
    core.derivationRule("solve.result", "es").title,
    core.derivationRule("solve.result", "en").title,
  );
});

test("solve derivations are deterministic, acyclic, nested, and independently bounded", () => {
  const source = core.parse("x^2 = 4");
  const first = core.buildSolveDerivation(source, { variable: "x", maxNodes: 20 });
  const second = core.buildSolveDerivation(source, { variable: "x", maxNodes: 20 });
  assert.deepEqual(first, second);
  assert.deepEqual(core.validateDerivationGraph(first, { maxNodes: 20 }), { valid: true });
  assert.ok(first.nodes.some((node) => node.children.length > 1));

  const bounded = core.buildSolveDerivation(source, { variable: "x", maxNodes: 2 });
  assert.ok(bounded.nodes.length <= 2);
  assert.deepEqual(core.validateDerivationGraph(bounded, { maxNodes: 2 }), { valid: true });
  assert.equal(bounded.nodes[0].evidence.truncated, true);
});

test("derivations retain accepted and rejected radical evidence", () => {
  const graph = core.buildSolveDerivation(core.parse("sqrt(x + 1) = x - 1"), {
    variable: "x",
    maxNodes: 20,
  });
  assert.equal(graph.nodes.filter((node) => node.ruleId === "solve.verify.accepted").length, 1);
  assert.equal(graph.nodes.filter((node) => node.ruleId === "solve.verify.rejected").length, 1);
  assert.match(JSON.stringify(graph), /original relation/);
});

test("concise, classroom, and diagnostic renderers expose progressively richer views", () => {
  const graph = core.buildSolveDerivation(core.parse("x^2 = 4"), { variable: "x" });
  const concise = core.renderDerivation(graph, { mode: "concise", locale: "en" });
  const classroom = core.renderDerivation(graph, { mode: "classroom", locale: "en" });
  const diagnostic = core.renderDerivation(graph, { mode: "diagnostic", locale: "en" });
  assert.ok(concise.lines.length < classroom.lines.length);
  assert.match(classroom.text, /candidate/i);
  assert.match(diagnostic.text, /solve\.verify\.accepted/);
  assert.match(diagnostic.text, /verified/);
});

test("v2 derive operation is JSON-safe and selects its renderer", () => {
  const response = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "derive",
    expression: "x^2 = 4",
    variable: "x",
    renderMode: "classroom",
    locale: "en",
  });
  assert.equal(response.status, "ok");
  assert.equal(response.result.graph.kind, "derivation-graph");
  assert.equal(response.result.rendered.mode, "classroom");
  assert.doesNotThrow(() => JSON.stringify(response));
});

test("legacy detailed solving keeps flat steps while exposing the canonical graph", () => {
  const detailed = core.solveWithSteps(core.parse("x^2 = 4"), { variable: "x" });
  assert.ok(detailed.steps.length > 0);
  assert.equal(detailed.derivation.kind, "derivation-graph");
  assert.deepEqual(core.validateDerivationGraph(detailed.derivation, { maxNodes: 100 }), {
    valid: true,
  });
});
