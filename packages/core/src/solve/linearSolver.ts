import { coefficient, coefficientMap, degree } from "../algebra/polynomial";
import { divideExact, ExactNumber, isZero, negateExact, subtractExact } from "../ast/rational";
import { Equation, Expression } from "../ast/types";
import { simplifyExpression } from "../simplify/simplify";
import { substitute } from "../visitors/substitute";
import { expressionEquals } from "../visitors/equal";
import { SolveResult } from "./SolveResult";

export function verifySolution(
  equation: Equation,
  variableName: string,
  value: Expression,
): boolean {
  try {
    const left = simplifyExpression(substitute(equation.left, variableName, value)).expression;
    const right = simplifyExpression(substitute(equation.right, variableName, value)).expression;
    return expressionEquals(left, right);
  } catch {
    return false;
  }
}

export function solveLinearEquation(equation: Equation, variableName: string): SolveResult {
  const left = coefficientMap(equation.left, variableName);
  if (left.kind === "unsupported") return left;
  const right = coefficientMap(equation.right, variableName);
  if (right.kind === "unsupported") return right;

  const leftDegree = degree(left.polynomial);
  const rightDegree = degree(right.polynomial);
  if ((leftDegree ?? 0) > 1 || (rightDegree ?? 0) > 1) {
    return { kind: "unsupported", reason: "Equation is nonlinear" };
  }

  const variableCoefficient = simplifyExactDifference(
    coefficient(left.polynomial, 1),
    coefficient(right.polynomial, 1),
  );
  const constantDifference = simplifyExactDifference(
    coefficient(left.polynomial, 0),
    coefficient(right.polynomial, 0),
  );

  if (isZero(variableCoefficient)) {
    return isZero(constantDifference) ? { kind: "identity" } : { kind: "no-solution" };
  }

  const value = divideExact(negateExact(constantDifference), variableCoefficient);
  if (!verifySolution(equation, variableName, value)) {
    return { kind: "unsupported", reason: "Computed solution could not be verified" };
  }
  return { kind: "solution", variable: variableName, value, verified: true };
}

function simplifyExactDifference(left: ExactNumber, right: ExactNumber): ExactNumber {
  return subtractExact(left, right);
}
