const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const executable = path.resolve(__dirname, "../dist/cli.js");
const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures.json"), "utf8"));

test("CLI fixtures return stable output and exit codes", () => {
  for (const fixture of fixtures) {
    const result = spawnSync(process.execPath, [executable, ...fixture.args], { encoding: "utf8" });
    assert.equal(result.status, fixture.exitCode, fixture.args.join(" "));
    if (fixture.stdout) assert.equal(result.stdout.trim(), fixture.stdout, fixture.args.join(" "));
    if (fixture.stderrIncludes) assert.match(result.stderr, new RegExp(fixture.stderrIncludes));
  }
});

test("parse command emits JSON-safe AST output", () => {
  const result = spawnSync(process.execPath, [executable, "parse", "x = 1/3"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  const ast = JSON.parse(result.stdout);
  assert.equal(ast.kind, "equation");
  assert.equal(ast.right.kind, "binary");
});

test("simplify --trace identifies actual rewrite rules", () => {
  const result = spawnSync(process.execPath, [executable, "simplify", "--trace", "1 * (2 + 3)"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[constant-folding\]/);
  assert.match(result.stdout, /5\s*$/);
});
