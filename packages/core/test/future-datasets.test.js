const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

const datasetDirectory = path.resolve(__dirname, "../../../datasets/future");
const readDataset = (name) =>
  JSON.parse(fs.readFileSync(path.join(datasetDirectory, name), "utf8"));

test("future dataset manifest matches every dataset file", () => {
  const manifest = readDataset("manifest.json");
  assert.equal(manifest.status, "future-capability-corpus");
  assert.equal(manifest.datasets.length, 7);
  assert.equal(
    manifest.datasets.reduce((total, entry) => total + entry.cases, 0),
    170,
  );
  const datasetFiles = fs
    .readdirSync(datasetDirectory)
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort();
  assert.deepEqual(manifest.datasets.map((entry) => entry.file).sort(), datasetFiles);
  for (const entry of manifest.datasets) {
    const rows = readDataset(entry.file);
    assert.equal(rows.length, entry.cases, entry.file);
    assert.ok(entry.capability.length > 0);
    assert.ok(["supported", "partially-supported"].includes(entry.status));
  }
});

test("advanced single-equation datasets parse and return implemented results", () => {
  for (const file of [
    "complex-root-equations.json",
    "cubic-and-higher-equations.json",
    "transcendental-equations.json",
    "variable-denominator-rational-equations.json",
  ]) {
    for (const fixture of readDataset(file)) {
      const equation = core.parse(fixture.equation);
      const result = core.solveFor(equation, fixture.variable, {
        domain: fixture.domain === "complex" ? "complex" : "real",
      });
      assert.notEqual(result.kind, "unsupported", `${file}: ${fixture.equation}`);
      assert.ok(Array.isArray(fixture.solutions));
    }
  }
});

test("the mixed rational and absolute-value corpus reports its partial boundary", () => {
  for (const fixture of readDataset("rational-and-absolute-equations.json")) {
    const result = core.solveFor(core.parse(fixture.equation), fixture.variable, {
      domain: fixture.domain === "complex" ? "complex" : "real",
    });
    if (fixture.family === "rational")
      assert.notEqual(result.kind, "unsupported", fixture.equation);
    else if (fixture.family === "absolute")
      assert.equal(result.kind, "unsupported", fixture.equation);
  }
});

test("specialized future fixtures declare the capability constraints they exercise", () => {
  for (const fixture of readDataset("complex-root-equations.json")) {
    assert.equal(fixture.domain, "complex");
    assert.ok(fixture.solutions.length > 0);
    fixture.solutions.forEach((solution) => core.parse(solution));
  }

  for (const fixture of readDataset("cubic-and-higher-equations.json")) {
    assert.ok(fixture.degree >= 3);
    assert.equal(fixture.domain, "real");
    fixture.solutions.forEach((solution) => core.parse(solution));
  }

  for (const fixture of readDataset("variable-denominator-rational-equations.json")) {
    assert.ok(fixture.excluded.length > 0);
    fixture.solutions.forEach((solution) => core.parse(solution));
    fixture.excluded.forEach((excluded) => core.parse(excluded));
  }
});

test("linear-system fixtures are solved and exact unique solutions verify", () => {
  assert.equal(typeof core.solveSystem, "function");
  for (const fixture of readDataset("linear-systems.json")) {
    assert.ok(fixture.equations.length >= 2);
    assert.ok(["unique", "infinite", "no-solution"].includes(fixture.kind));
    const equations = fixture.equations.map((source) => core.parse(source));
    equations.forEach((equation) => assert.equal(equation.kind, "equation"));
    const result = core.solveSystem(equations, fixture.variables);
    assert.equal(result.kind, fixture.kind);
    assert.equal(result.verified, true);
    if (fixture.kind === "unique") {
      assert.deepEqual(Object.keys(result.solution).sort(), [...fixture.variables].sort());
      const environment = Object.fromEntries(
        Object.entries(result.solution).map(([name, value]) => [name, core.evaluate(value)]),
      );
      for (const source of fixture.equations) {
        const equation = core.parse(source);
        const difference =
          core.evaluate(equation.left, environment) - core.evaluate(equation.right, environment);
        assert.ok(Math.abs(difference) < 1e-12, `${source}: supplied solution does not verify`);
      }
    }
  }
});
