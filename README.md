# Zim 2.0 Computer Algebraic System

Zim 2.0 is a TypeScript symbolic-mathematics engine with strict parsing, exact rational arithmetic, deterministic simplification, polynomial and rational-equation solving, selected symbolic transcendental solving, exact linear systems, a versioned backend API, and a command-line interface.

The former JavaScript implementation is preserved under `legacy/` for comparison only. Production code in `packages/core` does not import it.

## Requirements and commands

- Node.js 20 or newer
- TypeScript 5.9 or newer (`npm install` supplies it after dependencies are installed)

```sh
npm install
npm run check
```

`npm run check` builds both packages, runs all tests, lints the TypeScript source, and checks formatting. Generated `dist` folders are not committed.

## Current API

```js
const { parse, simplify, solve, solveSystem, format, toLatex, execute } = require("@zim/core");

const ast = parse("1/3 + 1/6 + x * 0");
const result = simplify(ast, { debug: true });

console.log(format(result.expression)); // 1/2
console.log(result.steps.map((step) => step.rule));

const solution = solve(parse("x^2 = 4"), { variable: "x" });
console.log(solution.kind); // multiple-solutions
console.log(solution.values.map(format)); // ["-2", "2"]

const complex = solve(parse("x^2 + 1 = 0"), { variable: "x", domain: "complex" });
console.log(complex.values.map(format)); // ["-i", "i"]

const system = solveSystem([parse("x + y = 5"), parse("x - y = 1")], ["x", "y"]);
console.log(system.solution); // exact AST values for x = 3 and y = 2

const response = execute({
  version: "1.0",
  operation: "solve",
  expression: "x^2 = 2",
  variable: "x",
});
console.log(JSON.stringify(response));
```

The public package also exports `toLatex()`. API v1 converts all `bigint` fields to decimal strings, so responses are safe to send through JSON. Its machine-readable schema is shipped at `packages/core/schema/api-v1.schema.json`.

## CLI

```sh
npm run build
node packages/cli/dist/cli.js parse "x^2 = 4"
node packages/cli/dist/cli.js simplify --trace "1 * (2 + 3)"
node packages/cli/dist/cli.js solve --variable x "x^2 = 4"
node packages/cli/dist/cli.js solve --variable x --domain complex "x^2 + 1 = 0"
node packages/cli/dist/cli.js system --variables x,y "x + y = 5; x - y = 1"
node packages/cli/dist/cli.js latex "x^2 = 1/4"
node packages/cli/dist/cli.js repl
```

Exit code `0` means success, `2` means invalid CLI/input syntax, and `3` means the expression parsed correctly but solving is unsupported.

## Supported syntax

- Integers and finite decimals: `12`, `.5`, `12.50` (stored exactly)
- Identifiers: `x`, `velocity2`, `_internal`
- Unary `+` and `-`
- Powers `^` (right-associative)
- Multiplication `*`, division `/`, modulo `%` or `mod`
- Addition and subtraction
- Parentheses, function calls, commas, and absolute-value bars
- Equations using `=`
- Other relation symbols are lexed for diagnostics but deliberately rejected by the parser for now

Implicit multiplication such as `2x` is not supported. Use `2 * x`.

## Domain safety

Domain-changing rules are disabled unless their assumptions are explicit. By default, `x/x` and `x^0` remain unchanged because `x` might be zero. A caller that knows `x != 0` can pass:

```js
simplify(parse("x/x + x^0"), { nonZeroVariables: ["x"] });
```

## Solver coverage

- Linear and quadratic equations over the real domain, plus complex quadratic roots when `domain: "complex"` is selected
- Higher-degree polynomials with exact rational factors, binomial forms, and reducible power-composition forms
- Rational equations with polynomial variable denominators and exclusion filtering
- Exponential, natural-logarithmic, standard inverse-pattern trigonometric, radical, and Lambert W forms
- Simultaneous linear systems with exact Gaussian elimination, including unique, infinite, and inconsistent classifications

General irreducible cubic/quartic formulas, numerical root approximation, nonlinear systems, arbitrary transcendental rearrangement, and interval-valued solution sets remain explicit unsupported boundaries.

## Repository map

- `packages/core/src`: new Zim 2 production source
- `packages/core/test`: unit, structural, regression, and invariant tests
- `datasets/regression`: legacy, polynomial, and linear-equation regression datasets
- `datasets/future`: advanced solver fixtures and capability-boundary cases
- `legacy`: isolated pre-overhaul implementation and source datasets

The GUI remains outside the current boundary.
