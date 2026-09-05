# Week 5 Core API

Import the compiled CommonJS entrypoint from `packages/core/dist` after `npm run build`.

- `lex(source)` returns tokens with half-open `[start, end)` offsets and an EOF token.
- `parse(source)` returns an `Expression` or `Equation` and throws `ZimError`/`ParseError` on invalid input.
- `normalize(tree)` returns a canonical tree without modifying the input.
- `simplify(tree, options)` returns `{ expression, steps }`.
- `format(tree)` returns deterministic plain text.
- `containsVariable`, `substitute`, `cloneExpression`, `visit`, and `evaluate` provide shared AST operations.
- Exact-number helpers include `rational`, `addExact`, `subtractExact`, `multiplyExact`, `divideExact`, and `powerExact`.

`SimplifyOptions` supports `debug`, `maxIterations`, and `nonZeroVariables`. `steps` is empty unless debug mode is enabled. Domain and iteration failures use stable typed codes (`DOMAIN_ERROR`, `ITERATION_LIMIT`); lexer/parser failures use `LEX_ERROR` and `PARSE_ERROR`.

This is an internal alpha API. The manual schedules the stable, versioned public boundary for Week 9.
