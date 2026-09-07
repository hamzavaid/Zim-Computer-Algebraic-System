import { coefficient, coefficientMap, degree, subtractPolynomials } from "../algebra/polynomial";
import {
  addExact,
  compareExact,
  divideExact,
  exactSquareRoot,
  multiplyExact,
  negateExact,
  rational,
  subtractExact,
} from "../ast/rational";
import { binary, Equation, Expression, func, unary } from "../ast/types";
import { simplifyExpression } from "../simplify/simplify";
import { evaluate } from "../visitors/evaluate";
import { expressionEquals } from "../visitors/equal";
import { SolveResult } from "./SolveResult";

function verifiesNumerically(equation: Equation, variableName: string, value: Expression): boolean {
  try {
    const numericValue = evaluate(value);
    const left = evaluate(equation.left, { [variableName]: numericValue });
    const right = evaluate(equation.right, { [variableName]: numericValue });
    return (
      Number.isFinite(left) &&
      Number.isFinite(right) &&
      Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right))
    );
  } catch {
    return false;
  }
}

export function solveQuadraticEquation(equation: Equation, variableName: string): SolveResult {
  const left = coefficientMap(equation.left, variableName);
  if (left.kind === "unsupported") return left;
  const right = coefficientMap(equation.right, variableName);
  if (right.kind === "unsupported") return right;
  const polynomial = subtractPolynomials(left.polynomial, right.polynomial);
  const polynomialDegree = degree(polynomial);
  if (polynomialDegree !== 2) {
    return {
      kind: "unsupported",
      reason:
        polynomialDegree === null
          ? "Equation is not quadratic"
          : `Polynomial degree ${polynomialDegree} is not quadratic`,
    };
  }

  const a = coefficient(polynomial, 2);
  const b = coefficient(polynomial, 1);
  const c = coefficient(polynomial, 0);
  const discriminant = subtractExact(
    multiplyExact(b, b),
    multiplyExact(rational(4n), multiplyExact(a, c)),
  );
  if (compareExact(discriminant, rational(0n)) < 0) {
    return { kind: "unsupported", reason: "Complex quadratic roots are not supported" };
  }

  const denominator = multiplyExact(rational(2n), a);
  const exactRoot = exactSquareRoot(discriminant);
  let values: Expression[];
  if (exactRoot) {
    const first = divideExact(subtractExact(negateExact(b), exactRoot), denominator);
    const second = divideExact(addExact(negateExact(b), exactRoot), denominator);
    values = compareExact(first, second) <= 0 ? [first, second] : [second, first];
  } else {
    const radical = func("sqrt", [discriminant]);
    const negative = simplifyExpression(
      binary("/", binary("+", negateExact(b), unary("-", radical)), denominator),
    ).expression;
    const positive = simplifyExpression(
      binary("/", binary("+", negateExact(b), radical), denominator),
    ).expression;
    values = [negative, positive].sort((aValue, bValue) => evaluate(aValue) - evaluate(bValue));
  }

  if (values.length === 2 && expressionEquals(values[0]!, values[1]!)) values = [values[0]!];
  if (!values.every((value) => verifiesNumerically(equation, variableName, value))) {
    return { kind: "unsupported", reason: "Computed quadratic roots could not be verified" };
  }
  if (values.length === 1) {
    return { kind: "solution", variable: variableName, value: values[0]!, verified: true };
  }
  return { kind: "multiple-solutions", variable: variableName, values, verified: true };
}
