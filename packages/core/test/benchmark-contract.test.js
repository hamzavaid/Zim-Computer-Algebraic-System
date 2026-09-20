const test = require("node:test");
const assert = require("node:assert/strict");
const { runBenchmark } = require("../../../scripts/benchmark");

test("benchmark harness reports deterministic workloads and enforceable limits", () => {
  const report = runBenchmark({ iterations: 25 });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.iterations, 25);
  assert.ok(report.workloads.length >= 4);
  for (const workload of report.workloads) {
    assert.equal(typeof workload.id, "string");
    assert.ok(workload.elapsedMs >= 0);
    assert.ok(workload.operationsPerSecond > 0);
    assert.equal(workload.failures, 0);
  }
});
