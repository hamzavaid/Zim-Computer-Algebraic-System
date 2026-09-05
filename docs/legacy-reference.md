# Legacy Reference Catalog

The pre-overhaul files are preserved under `legacy/` and are never imported by Zim 2 production code. They are evidence for syntax and feature intent, not an API or correctness authority.

## Feature mapping

| Legacy feature                           | Zim 2 behavior                                               | Status through Week 5                     |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Regex tokenization that could skip input | Strict lexer with source spans and typed rejection           | Complete                                  |
| Mutable class AST                        | Typed immutable discriminated-union AST                      | Complete                                  |
| JavaScript `number` constants            | Exact integer/rational `bigint` values                       | Complete                                  |
| Recursive-descent expressions            | Separate precedence parser; right-associative powers         | Complete                                  |
| In-node monolithic `simplify()`          | Small named rewrite rules and fixed-point engine             | Complete                                  |
| Ad hoc tree comparisons                  | Shared structural equality                                   | Complete                                  |
| Repeated variable-search logic           | Shared visitor utilities                                     | Complete                                  |
| Floating-point evaluation                | Numeric verification utility; symbolic storage remains exact | Complete with documented numeric boundary |
| Polynomial wrapper and solver            | Coefficient-map polynomial layer                             | Planned Week 6                            |
| Equation inverse-operation solver        | Coefficient-based linear solver                              | Planned Week 7                            |
| Nonlinear/logarithmic solving            | Explicit limited solvers                                     | Week 8 or later                           |

## Regression set

`datasets/regression/legacy-cases.json` captures 40 legacy equations, legacy answers, independently checked expectations, and the target milestone. Every captured input is currently exercised as a parser regression.

The catalog corrects a known legacy dataset error: `x/3 + x/6 = 5` has solution `x = 10`, not `x = 6`. Multiple-root ordering is normalized in expectations but will not be enforced until solving is implemented.

## Known legacy limitations not carried forward

- Unknown characters could be silently omitted by tokenization.
- Constants used floating point, so exact fractions degraded.
- Simplification mutated nodes and mixed normalization, algebra, and domain assumptions.
- Several identity rules changed domains without recording assumptions.
- Unsupported behavior sometimes threw generic errors or returned incomplete answers.
- Solver output was not a structured result contract.
