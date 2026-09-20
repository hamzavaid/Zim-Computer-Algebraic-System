const test = require("node:test");
const assert = require("node:assert/strict");
const { executeOverHttp } = require("../dist/clients/protocolClient");

test("protocol client honors AbortSignal cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    executeOverHttp(
      "http://127.0.0.1:1",
      { version: "1.0", operation: "parse", expression: "x" },
      { signal: controller.signal, timeoutMs: 1000 },
    ),
    (error) => error.name === "AbortError",
  );
});

test("history schema migrates legacy arrays and supports deletion", () => {
  const legacy = '["x + 1", "x^2 = 4"]';
  const migrated = require("../dist/state/history").migrateHistory(legacy);
  assert.equal(migrated.version, 1);
  assert.deepEqual(
    migrated.entries.map((entry) => entry.expression),
    ["x + 1", "x^2 = 4"],
  );
  assert.deepEqual(require("../dist/state/history").clearHistory(), { version: 1, entries: [] });
});
