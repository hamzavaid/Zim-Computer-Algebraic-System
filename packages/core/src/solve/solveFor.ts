import { coefficientMap, degree, subtractPolynomials } from "../algebra/polynomial";
import { binary, Expression, SyntaxTree } from "../ast/types";
import { containsVariable } from "../visitors/containsVariable";
import { format } from "../format/formatter";
import { solveLinearEquation } from "./linearSolver";
import { solveQuadraticEquation } from "./quadraticSolver";
import { solvePolynomial } from "./polynomialSolver";
import { containsVariableDenominator, solveRationalEquation } from "./rationalEquationSolver";
import { SolveConfiguration } from "./SolveOptions";
import { SolveResult } from "./SolveResult";
import { containsTranscendental, solveTranscendentalEquation } from "./transcendentalSolver";

function solveAlgebraicEquation(
  tree: SyntaxTree,
  variableName: string,
  domain: "real" | "complex",
): SolveResult {
  if (tree.kind !== "equation") {
    return { kind: "unsupported", reason: "Solving requires an equation" };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(variableName)) {
    return { kind: "unsupported", reason: `Invalid variable name '${variableName}'` };
  }
  const symbolic = solveSymbolicProduct(tree, variableName);
  if (symbolic) return symbolic;
  if (
    containsVariableDenominator(tree.left, variableName) ||
    containsVariableDenominator(tree.right, variableName)
  ) {
    return solveRationalEquation(tree, variableName, domain);
  }
  const left = coefficientMap(tree.left, variableName);
  if (left.kind === "unsupported") return left;
  const right = coefficientMap(tree.right, variableName);
  if (right.kind === "unsupported") return right;
  const polynomialDegree = degree(subtractPolynomials(left.polynomial, right.polynomial)) ?? 0;
  if (polynomialDegree <= 1) return solveLinearEquation(tree, variableName);
  if (polynomialDegree === 2) return solveQuadraticEquation(tree, variableName, domain);
  return solvePolynomial(
    subtractPolynomials(left.polynomial, right.polynomial),
    variableName,
    domain,
  );
}

function solveSymbolicProduct(tree: SyntaxTree, variableName: string): SolveResult | undefined {
  if (tree.kind !== "equation") return undefined;
  const sides: readonly [Expression, Expression][] = [
    [tree.left, tree.right],
    [tree.right, tree.left],
  ];
  for (const [product, numerator] of sides) {
    if (
      product.kind !== "binary" ||
      product.operator !== "*" ||
      containsVariable(numerator, variableName)
    )
      continue;
    if (numerator.kind !== "constant" || numerator.value === 0n) continue;
    const factors: readonly [Expression, Expression][] = [
      [product.left, product.right],
      [product.right, product.left],
    ];
    for (const [target, coefficient] of factors) {
      if (
        target.kind !== "variable" ||
        target.name !== variableName ||
        containsVariable(coefficient, variableName)
      )
        continue;
      if (coefficient.kind !== "variable") continue;
      return {
        kind: "solution",
        variable: variableName,
        value: binary("/", numerator, coefficient),
        verified: true,
        conditions: [`${format(coefficient)} != 0`],
      };
    }
  }
  return undefined;
}

export function solveFor(
  tree: SyntaxTree,
  variableName: string,
  options: SolveConfiguration = {},
): SolveResult {
  const domain = options.domain ?? "real";
  if (tree.kind !== "equation") {
    return { kind: "unsupported", reason: "Solving requires an equation" };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(variableName)) {
    return { kind: "unsupported", reason: `Invalid variable name '${variableName}'` };
  }
  if (
    containsTranscendental(tree.left, variableName) ||
    containsTranscendental(tree.right, variableName)
  ) {
    return solveTranscendentalEquation(tree, variableName, domain, solveAlgebraicEquation);
  }
  return solveAlgebraicEquation(tree, variableName, domain);
}
