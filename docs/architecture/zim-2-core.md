# Zim 2 Core Architecture (Weeks 0–5)

## Boundary and data flow

The production core is `packages/core`. It has no runtime or build-time dependency on `legacy`, `util/new`, or `util/old`.

```text
source -> Lexer -> Token[] -> Parser -> immutable AST
                                      |
                                      +-> visitors / formatter
                                      +-> normalizer -> canonical AST
                                      +-> simplifier -> AST + optional trace
```

The lexer knows only tokens and typed errors. The parser depends on the lexer and AST constructors, never on simplification. Visitors and formatting depend only on the AST and exact-number helpers. Normalization has no dependency on simplification rules. The simplifier depends on normalization and small `RewriteRule` implementations.

## AST invariants

- Nodes are plain immutable-by-contract objects with a discriminating `kind` property.
- `Constant.value`, `Rational.numerator`, and `Rational.denominator` are `bigint` values.
- Rational values are reduced; denominators are positive; denominator `1` is represented as a `Constant`.
- A denominator of zero is never a valid rational node.
- A `BinaryExpression` has exactly two children and a declared operator.
- Function arguments are an ordered, readonly list. The parser does not guess function semantics.
- An equation has exactly two expression sides and represents equality only.
- AST construction performs no algebraic simplification.
- Transformations reconstruct changed paths and do not mutate input nodes.

## Numeric literal policy

Accepted literals are unsigned integers and finite base-10 decimals. Signs are operators rather than part of the literal. Examples: `0`, `42`, `.5`, `12.50`. Scientific notation, repeating decimals, hexadecimal, `Infinity`, and `NaN` are rejected or tokenized into invalid syntax. A finite decimal is converted exactly: `0.125` becomes `1/8`.

## Precedence

From strongest to weakest: primary/grouping, power, unary sign, multiplication/division/modulo, addition/subtraction, equation. Power is right-associative, so `a^b^c` means `a^(b^c)`. Unary minus is weaker than power, so `-2^2` means `-(2^2)`. The grammar also accepts a unary exponent such as `2^-3`.

## Normal form

Normalization recursively:

- removes unary plus and pairs of unary minus;
- converts subtraction to addition of a negated right operand;
- flattens nested addition and multiplication;
- moves factor signs to one outer negation; and
- sorts terms/factors by a deterministic structural formatting key.

Normalization deliberately does not distribute products, combine like terms, or perform general cancellation. Those operations belong to later milestones.

## Simplification termination and domains

Each rewrite rule receives one expression plus an explicit context and either returns a replacement or declines. The engine simplifies children, normalizes, applies the first matching rule, and repeats to a fixed point. Structural equality detects stability; `maxIterations` (default 100) prevents rewrite loops. Debug mode records the rule name and before/after AST for every accepted rewrite.

Rules that require a nonzero expression do not make that assumption implicitly. Currently a caller may declare variable names in `nonZeroVariables`; this enables `x/x -> 1` and `x^0 -> 1` for those variables. Compound-expression assumptions are reserved for a future assumption system.
