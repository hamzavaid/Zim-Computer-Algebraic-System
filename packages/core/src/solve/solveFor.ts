import { coefficientMap, degree, subtractPolynomials } from "../algebra/polynomial";
import { SyntaxTree } from "../ast/types";
import { solveLinearEquation } from "./linearSolver";
import { solveQuadraticEquation } from "./quadraticSolver";
import { SolveResult } from "./SolveResult";

export function solveFor(tree: SyntaxTree, variableName: string): SolveResult {
  if (tree.kind !== "equation") {
    return { kind: "unsupported", reason: "Solving requires an equation" };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(variableName)) {
    return { kind: "unsupported", reason: `Invalid variable name '${variableName}'` };
  }
  const left = coefficientMap(tree.left, variableName);
  if (left.kind === "unsupported") return left;
  const right = coefficientMap(tree.right, variableName);
  if (right.kind === "unsupported") return right;
  const polynomialDegree = degree(subtractPolynomials(left.polynomial, right.polynomial)) ?? 0;
  if (polynomialDegree <= 1) return solveLinearEquation(tree, variableName);
  if (polynomialDegree === 2) return solveQuadraticEquation(tree, variableName);
  return { kind: "unsupported", reason: `Polynomial degree ${polynomialDegree} is not supported` };
}
