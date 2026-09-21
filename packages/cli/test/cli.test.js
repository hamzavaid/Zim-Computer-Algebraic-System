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

function cli(...args) {
  return spawnSync(process.execPath, [executable, ...args], { encoding: "utf8" });
}

test("v2 parity commands expose human and JSON output", () => {
  const cases = [
    [["solve", "--variable", "x", "x^2 - 4 < 0"], /\(-2, 2\)/],
    [["relation", "--variable", "x", "--json", "x^2 - 4 < 0"], /"solution"/],
    [["polynomial", "--variable", "x", "x^3 - 2"], /degree/i],
    [["nonlinear", "--variables", "x,y", "x * y = 2; x + y = 3"], /finite/i],
    [
      ["derive", "--variable", "x", "--render-mode", "classroom", "sqrt(x + 1) = x - 1"],
      /Verified result/i,
    ],
    [["capabilities"], /2\.4\.5/],
    [["format", "(x + 1) * (x - 1)"], /\(x \+ 1\) \* \(x - 1\)/],
  ];
  for (const [args, expected] of cases) {
    const result = cli(...args);
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
    assert.match(result.stdout, expected);
  }
});

test("CLI help documents every public command and its important flags", () => {
  const help = cli("--help");
  assert.equal(help.status, 0);
  for (const command of [
    "parse",
    "simplify",
    "solve",
    "system",
    "relation",
    "polynomial",
    "nonlinear",
    "derive",
    "format",
    "latex",
    "capabilities",
    "repl",
  ])
    assert.match(help.stdout, new RegExp(`zim ${command}`));
  const nonlinear = cli("nonlinear", "--help");
  assert.equal(nonlinear.status, 0);
  for (const flag of [
    "--variables",
    "--mode",
    "--initial-guess",
    "--max-iterations",
    "--tolerance",
    "--max-resultant-degree",
    "--json",
  ])
    assert.match(nonlinear.stdout, new RegExp(flag));
});

test("new commands validate required options and preserve unsupported exit status", () => {
  const missing = cli("relation", "x < 1");
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--variable/);
  const invalidGuess = cli(
    "nonlinear",
    "--variables",
    "x,y",
    "--initial-guess",
    "bad",
    "x+y=1;x-y=0",
  );
  assert.equal(invalidGuess.status, 2);
  assert.match(invalidGuess.stderr, /initial guess/i);
});
