const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, format, ParseError } = require("../dist");

test("honors precedence and left associativity", () => {
  assert.equal(format(parse("1 + 2 * 3 - 4 / 2")), "1 + 2 * 3 - (4 / 2)");
});

test("makes exponentiation right associative and stronger than unary minus", () => {
  assert.equal(format(parse("-2^3^2")), "-2 ^ 3 ^ 2");
  const ast = parse("-2^3^2");
  assert.equal(ast.kind, "unary");
  assert.equal(ast.operand.right.kind, "binary");
});

test("constructs equations, calls, decimals, and absolute values", () => {
  assert.equal(format(parse("abs(x) = |.5 - y|")), "abs(x) = abs(1/2 - y)");
  assert.equal(format(parse("f(x, 2)")), "f(x, 2)");
});

test("does not return partial ASTs for bad syntax", () => {
  for (const input of ["x +", "(x + 1", "x = 1 = 2", "f(x,,y)", "|x + 1"]) {
    assert.throws(
      () => parse(input),
      (error) => error instanceof ParseError || error.code === "PARSE_ERROR",
      input,
    );
  }
});

test("reports unsupported relations explicitly", () => {
  assert.throws(() => parse("x >= 2"), /only equations using '='/);
});
