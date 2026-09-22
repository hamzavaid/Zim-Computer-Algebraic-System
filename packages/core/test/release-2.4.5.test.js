const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { capabilities, execute, executeV2 } = require("../dist");

const workspace = path.resolve(__dirname, "../../..");
const expected = [
  "parse",
  "simplify",
  "solve",
  "solveSystem",
  "format",
  "latex",
  "capabilities",
  "analyzePolynomial",
  "solveRelation",
  "solveNonlinearSystem",
  "derive",
  "differentiate",
  "limit",
  "integrate",
];

test("current release and interface parity stay synchronized", () => {
  const registry = capabilities();
  assert.equal(registry.release, "2.5.0");
  assert.deepEqual(registry.operations, expected);
  for (const file of [
    "package.json",
    "packages/core/package.json",
    "packages/cli/package.json",
    "packages/gui/package.json",
  ])
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(workspace, file), "utf8")).version,
      "2.5.0",
      file,
    );
  const cli = fs.readFileSync(path.join(workspace, "packages/cli/src/cli.ts"), "utf8");
  const gui = fs.readFileSync(path.join(workspace, "packages/gui/src/browser/app.ts"), "utf8");
  for (const operation of expected) {
    assert.match(cli, new RegExp(`API_TO_CLI[\\s\\S]*${operation}`), operation);
    assert.match(gui, new RegExp(`API_TO_GUI[\\s\\S]*${operation}`), operation);
  }
});

test("API v1 remains functional beside API v2", () => {
  assert.equal(execute({ version: "1.0", operation: "format", expression: "x+1" }).status, "ok");
  const response = executeV2({ apiVersion: "2.0-beta", operation: "capabilities" });
  assert.equal(response.status, "ok");
  assert.equal(response.result.release, "2.5.0");
});
