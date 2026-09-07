import { coefficientMap, degree, subtractPolynomials } from "../algebra/polynomial";
import { SyntaxTree } from "../ast/types";
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
