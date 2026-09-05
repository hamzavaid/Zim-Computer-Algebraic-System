# Zim 2.0 Computer Algebraic System

Zim 2.0 is a greenfield TypeScript symbolic-mathematics engine. The implementation currently includes strict lexing, typed parsing, exact rational arithmetic, reusable AST visitors, deterministic normalization, and a modular fixed-point simplifier.

The former JavaScript implementation is preserved under `legacy/` for comparison only. Production code in `packages/core` does not import it.

## Requirements and commands

- Node.js 20 or newer
- TypeScript 5.9 or newer (`npm install` supplies it after dependencies are installed)

```sh
npm install
npm test
npm run build
```

`npm test` compiles the strict TypeScript project and runs the Node test suite. Generated files are written to `packages/core/dist` and are not committed.

## Current API

```js
const { parse, simplify, format } = require("./packages/core/dist");

const ast = parse("1/3 + 1/6 + x * 0");
const result = simplify(ast, { debug: true });

console.log(format(result.expression)); // 1/2
console.log(result.steps.map((step) => step.rule));
```

The Week 5 API is intentionally pre-stable. A versioned consumer API and serialization contract are scheduled for Week 9.

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

## Repository map

- `packages/core/src`: new Zim 2 production source
- `packages/core/test`: unit, structural, regression, and invariant tests
- `datasets/regression`: curated legacy behavior and corrected expectations
- `legacy`: isolated pre-overhaul implementation and source datasets

Solvers, polynomial coefficient maps, LaTeX, CLI, and GUI are intentionally outside the completed Week 0–5 scope.
