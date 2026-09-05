const test = require("node:test");
const assert = require("node:assert/strict");
const { lex, ZimError } = require("../dist");

test("lexes all supported ASCII operators, punctuation, and aliases", () => {
  const tokens = lex("a + 2 - 3 * 4 / 5 % 2 mod 1 ^ 2, (x) |x| = y != z <= q >= r < s > t");
  assert.deepEqual(
    tokens.map((token) => token.type),
    [
      "identifier",
      "plus",
      "number",
      "minus",
      "number",
      "star",
      "number",
      "slash",
      "number",
      "modulo",
      "number",
      "modulo",
      "number",
      "power",
      "number",
      "comma",
      "leftParen",
      "identifier",
      "rightParen",
      "pipe",
      "identifier",
      "pipe",
      "equal",
      "identifier",
      "notEqual",
      "identifier",
      "lessEqual",
      "identifier",
      "greaterEqual",
      "identifier",
      "less",
      "identifier",
      "greater",
      "identifier",
      "eof",
    ],
  );
});

test("lexes Unicode relations", () => {
  assert.deepEqual(
    lex("x ≠ 1 ≤ y ≥ 0").map((token) => token.type),
    [
      "identifier",
      "notEqual",
      "number",
      "lessEqual",
      "identifier",
      "greaterEqual",
      "number",
      "eof",
    ],
  );
});

test("tracks half-open source spans without swallowing whitespace", () => {
  assert.deepEqual(
    lex(" 12.50 + x").map(({ type, lexeme, start, end }) => ({ type, lexeme, start, end })),
    [
      { type: "number", lexeme: "12.50", start: 1, end: 6 },
      { type: "plus", lexeme: "+", start: 7, end: 8 },
      { type: "identifier", lexeme: "x", start: 9, end: 10 },
      { type: "eof", lexeme: "", start: 10, end: 10 },
    ],
  );
});

test("rejects unknown characters and malformed numeric literals", () => {
  assert.throws(
    () => lex("x @ 2"),
    (error) => error instanceof ZimError && error.code === "LEX_ERROR" && error.start === 2,
  );
  assert.throws(
    () => lex("1."),
    (error) => error instanceof ZimError && error.code === "LEX_ERROR",
  );
});
