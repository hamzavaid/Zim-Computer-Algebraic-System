const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../dist");

let seed = 0x5eed1234;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}

test("deterministic malformed-input fuzzing always returns a bounded API response", () => {
  const alphabet = "xyz0123456789+-*/^()=@#[]{}\\";
  for (let sample = 0; sample < 500; sample += 1) {
    const length = Math.floor(random() * 96);
    let expression = "";
    for (let index = 0; index < length; index += 1) {
      expression += alphabet[Math.floor(random() * alphabet.length)];
    }
    const response = core.executeV2({
      apiVersion: "2.0-beta",
      operation: "parse",
      expression,
      budget: { maxInputLength: 128 },
    });
    assert.ok(["ok", "invalid", "unsupported", "budget-exceeded"].includes(response.status));
    assert.ok(response.timing.totalMs < 1000);
  }
});

test("nesting and input guards fail safely at their configured limits", () => {
  const oversized = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "parse",
    expression: "x".repeat(33),
    budget: { maxInputLength: 32 },
  });
  assert.equal(oversized.status, "budget-exceeded");

  const malformed = core.executeV2({
    apiVersion: "2.0-beta",
    operation: "parse",
    expression: `${"(".repeat(300)}x${")".repeat(300)}`,
  });
  assert.notEqual(malformed.status, "internal-error");
});
