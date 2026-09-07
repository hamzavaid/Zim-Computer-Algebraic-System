const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist");

const datasetDirectory = path.resolve(__dirname, "../../../datasets/future");
const readDataset = (name) =>
  JSON.parse(fs.readFileSync(path.join(datasetDirectory, name), "utf8"));

const roots = (result) => {
  if (result.kind === "solution") return [result.value];
  if (result.kind === "multiple-solutions") return [...result.values];
  if (result.kind === "no-solution") return [];
  assert.fail(`Expected a solved result, received ${result.kind}: ${result.reason}`);
};

const complex = (real, imaginary = 0) => ({ real, imaginary });
const add = (a, b) => complex(a.real + b.real, a.imaginary + b.imaginary);
const multiply = (a, b) =>
  complex(a.real * b.real - a.imaginary * b.imaginary, a.real * b.imaginary + a.imaginary * b.real);
const divide = (a, b) => {
  const scale = b.real * b.real + b.imaginary * b.imaginary;
  return complex(
    (a.real * b.real + a.imaginary * b.imaginary) / scale,
    (a.imaginary * b.real - a.real * b.imaginary) / scale,
  );
};

function evaluateComplex(expression) {
  if (expression.kind === "constant") return complex(Number(expression.value));
  if (expression.kind === "rational") {
    return complex(Number(expression.numerator) / Number(expression.denominator));
  }
  if (expression.kind === "variable") {
    if (expression.name === "i") return complex(0, 1);
    if (expression.name === "pi") return complex(Math.PI);
    throw new Error(`Unknown complex constant '${expression.name}'`);
  }
  if (expression.kind === "unary") {
    const value = evaluateComplex(expression.operand);
    return expression.operator === "-" ? complex(-value.real, -value.imaginary) : value;
  }
  if (expression.kind === "function") {
    const value = evaluateComplex(expression.args[0]);
    assert.ok(Math.abs(value.imaginary) < 1e-12);
    if (expression.name === "sqrt") return complex(Math.sqrt(value.real));
    if (expression.name === "cbrt") return complex(Math.cbrt(value.real));
    if (expression.name === "exp") return complex(Math.exp(value.real));
    if (expression.name === "ln" || expression.name === "log") return complex(Math.log(value.real));
    throw new Error(`Unsupported test function '${expression.name}'`);
  }
  const left = evaluateComplex(expression.left);
  const right = evaluateComplex(expression.right);
  if (expression.operator === "+") return add(left, right);
  if (expression.operator === "-") return add(left, complex(-right.real, -right.imaginary));
  if (expression.operator === "*") return multiply(left, right);
  if (expression.operator === "/") return divide(left, right);
  if (expression.operator === "^") {
    assert.equal(right.imaginary, 0);
    assert.ok(Number.isInteger(right.real) && right.real >= 0);
    let result = complex(1);
    for (let index = 0; index < right.real; index++) result = multiply(result, left);
    return result;
  }
  throw new Error(`Unsupported test operator '${expression.operator}'`);
}

function assertRootsMatch(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  const remaining = expected.map(evaluateComplex);
  for (const expression of actual) {
    const value = evaluateComplex(expression);
    const index = remaining.findIndex(
      (candidate) =>
        Math.abs(candidate.real - value.real) < 1e-8 &&
        Math.abs(candidate.imaginary - value.imaginary) < 1e-8,
    );
    assert.notEqual(index, -1, `${label}: unexpected root ${core.format(expression)}`);
    remaining.splice(index, 1);
  }
}

for (const [file, domain] of [
  ["complex-root-equations.json", "complex"],
  ["cubic-and-higher-equations.json", "real"],
  ["variable-denominator-rational-equations.json", undefined],
]) {
  test(`${file} returns its declared roots`, () => {
    for (const fixture of readDataset(file)) {
      const selectedDomain = fixture.domain === "complex" ? "complex" : (domain ?? "real");
      const result = core.solveFor(core.parse(fixture.equation), fixture.variable, {
        domain: selectedDomain,
      });
      assertRootsMatch(roots(result), fixture.solutions.map(core.parse), fixture.equation);
    }
  });
}

test("transcendental fixtures return finite or parameterized symbolic solutions", () => {
  for (const fixture of readDataset("transcendental-equations.json")) {
    const result = core.solveFor(core.parse(fixture.equation), fixture.variable);
    const actual = roots(result);
    assert.equal(actual.length, fixture.solutions.length, fixture.equation);
    if (fixture.family === "trigonometric" || fixture.family === "special-function") {
      const text = actual.map(core.format).join(" ");
      assert.match(text, fixture.family === "trigonometric" ? /k|pi/ : /LambertW/);
    } else {
      assertRootsMatch(actual, fixture.solutions.map(core.parse), fixture.equation);
    }
  }
});

test("advanced solvers enforce real domains and invalid-input boundaries", () => {
  assert.equal(core.solveFor(core.parse("exp(x) = -1"), "x").kind, "no-solution");
  assert.equal(core.solveFor(core.parse("sqrt(x) = -2"), "x").kind, "no-solution");
  assert.match(core.solveFor(core.parse("1/0 = x"), "x").reason, /division by zero/i);
  assert.match(core.solveSystem([core.parse("x = 1")], ["not valid"]).reason, /invalid variable/i);
});
