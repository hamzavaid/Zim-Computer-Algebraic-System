const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

test("public entrypoint exposes the stable backend operations", () => {
  for (const name of ["parse", "simplify", "solve", "format", "toLatex", "execute"]) {
    assert.equal(typeof core[name], "function", name);
  }
  const tree = core.parse("1/3 + 1/6");
  assert.equal(core.format(core.simplify(tree).expression), "1/2");
  assert.equal(
    core.formatSolveResult(core.solve(core.parse("x^2 = 4"), { variable: "x" })),
    "x = -2, 2",
  );
});

test("v1 parse responses are stable and JSON serializable", () => {
  const response = core.execute({
    version: "1.0",
    operation: "parse",
    expression: "x = 1/3",
  });
  assert.deepEqual(response, {
    version: "1.0",
    status: "ok",
    result: {
      ast: {
        kind: "equation",
        left: { kind: "variable", name: "x" },
        right: {
          kind: "binary",
          operator: "/",
          left: { kind: "constant", value: "1" },
          right: { kind: "constant", value: "3" },
        },
      },
      text: "x = 1 / 3",
      latex: "x = \\frac{1}{3}",
    },
  });
  assert.doesNotThrow(() => JSON.stringify(response));
});

test("v1 simplify responses optionally include serialized transformation traces", () => {
  const response = core.execute({
    version: "1.0",
    operation: "simplify",
    expression: "1 * (2 + 3)",
    includeSteps: true,
  });
  assert.equal(response.status, "ok");
  assert.equal(response.result.text, "5");
  assert.ok(response.result.steps.length > 0);
  assert.ok(response.result.steps.every((step) => step.rule && step.before && step.after));
  assert.doesNotThrow(() => JSON.stringify(response));
});

test("v1 solve responses serialize exact and symbolic quadratic results", () => {
  const exact = core.execute({
    version: "1.0",
    operation: "solve",
    expression: "x^2 = 4",
    variable: "x",
  });
  assert.equal(exact.status, "ok");
  assert.equal(exact.result.solution.kind, "multiple-solutions");
  assert.equal(exact.result.text, "x = -2, 2");
  assert.doesNotThrow(() => JSON.stringify(exact));

  const symbolic = core.execute({
    version: "1.0",
    operation: "solve",
    expression: "x^2 = 2",
    variable: "x",
  });
  assert.equal(symbolic.status, "ok");
  assert.match(symbolic.result.latex, /\\sqrt/);
});

test("v1 returns stable error codes and source positions", () => {
  assert.equal(
    core.execute({ version: "2.0", operation: "parse", expression: "x" }).error.code,
    "API_VERSION_UNSUPPORTED",
  );
  assert.equal(
    core.execute({ version: "1.0", operation: "solve", expression: "x = 1" }).error.code,
    "VARIABLE_REQUIRED",
  );
  const malformed = core.execute({ version: "1.0", operation: "parse", expression: "x @ 1" });
  assert.equal(malformed.status, "error");
  assert.equal(malformed.error.code, "LEX_ERROR");
  assert.equal(malformed.error.start, 2);
});

test("LaTeX formatting covers exact values, powers, functions, and equations", () => {
  assert.equal(core.toLatex(core.parse("1/3")), "\\frac{1}{3}");
  assert.equal(
    core.toLatex(core.parse("x^2 + sqrt(x) = abs(y)")),
    "{x}^{2} + \\sqrt{x} = \\left|y\\right|",
  );
});

test("shipped v1 JSON Schema agrees with the runtime contract", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../schema/api-v1.schema.json"), "utf8"),
  );
  assert.equal(schema.$defs.request.properties.version.const, core.API_VERSION);
  assert.deepEqual(schema.$defs.request.properties.operation.enum, [
    "parse",
    "simplify",
    "solve",
    "format",
    "latex",
  ]);
});
