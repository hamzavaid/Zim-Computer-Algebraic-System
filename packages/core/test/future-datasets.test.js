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
  assert.equal(manifest.datasets.length, 4);
  for (const entry of manifest.datasets) {
    const rows = readDataset(entry.file);
    assert.equal(rows.length, entry.cases, entry.file);
    assert.ok(entry.capability.length > 0);
    assert.ok(["supported-real-only", "unsupported"].includes(entry.status));
  }
});

test("future single-equation datasets parse but remain explicitly unsupported", () => {
  for (const file of ["transcendental-equations.json", "rational-and-absolute-equations.json"]) {
    for (const fixture of readDataset(file)) {
      const equation = core.parse(fixture.equation);
      const result = core.solveFor(equation, fixture.variable);
      assert.equal(result.kind, "unsupported", `${file}: ${fixture.equation}`);
      assert.ok(result.reason.length > 0);
      assert.ok(Array.isArray(fixture.solutions));
    }
  }
});

test("linear-system fixtures are valid while no system solver is exposed", () => {
  assert.equal(core.solveSystem, undefined);
  for (const fixture of readDataset("linear-systems.json")) {
    assert.ok(fixture.equations.length >= 2);
    assert.ok(["unique", "infinite", "no-solution"].includes(fixture.kind));
    fixture.equations.forEach((equation) => assert.equal(core.parse(equation).kind, "equation"));
    if (fixture.kind === "unique") {
      assert.deepEqual(Object.keys(fixture.solution).sort(), [...fixture.variables].sort());
      const environment = Object.fromEntries(
        Object.entries(fixture.solution).map(([name, value]) => [
          name,
          core.evaluate(core.parse(value)),
        ]),
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
