const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const executable = path.resolve(__dirname, "../dist/cli.js");
const cli = (...args) =>
  spawnSync(process.execPath, [executable, ...args], { encoding: "utf8", timeout: 5000 });

test("JSON mode emits an API envelope for invalid expressions", () => {
  const response = cli("solve", "--variable", "x", "--json", "(");
  assert.notEqual(response.status, 0);
  const envelope = JSON.parse(response.stdout);
  assert.equal(envelope.status, "invalid");
  assert.equal(envelope.apiVersion, "2.0-beta");
});

test("parse JSON mode emits the envelope while plain parse retains AST compatibility", () => {
  assert.equal(JSON.parse(cli("parse", "--json", "x+1").stdout).status, "ok");
  assert.equal(JSON.parse(cli("parse", "x+1").stdout).kind, "binary");
});

test("CLI accepts a leading unary minus variable", () => {
  const response = cli("solve", "--variable", "x", "-x=2");
  assert.equal(response.status, 0, response.stderr);
  assert.match(response.stdout, /x = -2/);
});

test("REPL reports an unterminated quote and processes the next command", () => {
  const response = spawnSync(process.execPath, [executable, "repl"], {
    encoding: "utf8",
    timeout: 5000,
    input: 'solve --variable x "x=1\nsolve --variable x x=2\nexit\n',
  });
  assert.match(response.stderr + response.stdout, /unterminated/i);
  assert.match(response.stdout, /x = 2/);
});
