import {
  addExact,
  compareExact,
  divideExact,
  ExactNumber,
  exactSquareRoot,
  isExactNumber,
  isOne,
  isZero,
  multiplyExact,
  rational,
} from "../ast/rational";
import { Expression } from "../ast/types";
import { coefficient, degree, Polynomial } from "../algebra/polynomial";
import { toRationalPolynomial } from "../solve/rationalEquationSolver";
import { substitute } from "../visitors/substitute";
import { evaluateRational } from "../visitors/evaluateRational";
import { expressionEquals } from "../visitors/equal";
import { LimitOptions, LimitPoint, LimitResult } from "./types";

function countNodes(expression: Expression): number {
  const stack = [expression];
  let count = 0;
  while (stack.length) {
    const value = stack.pop()!;
    count++;
    if (value.kind === "unary") stack.push(value.operand);
    else if (value.kind === "binary") stack.push(value.left, value.right);
    else if (value.kind === "function") stack.push(...value.args);
  }
  return count;
}

function exactElementary(expression: Expression): ExactNumber | undefined {
  const rationalValue = evaluateRational(expression);
  if (rationalValue !== undefined) return rationalValue;
  if (expression.kind !== "function" || expression.args.length !== 1) return undefined;
  const argument = exactElementary(expression.args[0]!);
  if (argument === undefined) return undefined;
  if (expression.name === "sin" || expression.name === "tan")
    return isZero(argument) ? rational(0n) : undefined;
  if (expression.name === "cos" || expression.name === "exp")
    return isZero(argument) ? rational(1n) : undefined;
  if (expression.name === "ln" || expression.name === "log")
    return isOne(argument) ? rational(0n) : undefined;
  if (expression.name === "sqrt") return exactSquareRoot(argument);
  return undefined;
}

function evaluatePolynomial(polynomial: Polynomial, value: ExactNumber): ExactNumber {
  let result = rational(0n);
  for (let exponent = degree(polynomial) ?? 0; exponent >= 0; exponent--)
    result = addExact(multiplyExact(result, value), coefficient(polynomial, exponent));
  return result;
}

function divideByRoot(polynomial: Polynomial, root: ExactNumber): Polynomial {
  const maximum = degree(polynomial);
  if (maximum === null || maximum === 0) return polynomial;
  const values = new Map<number, ExactNumber>();
  let carry = coefficient(polynomial, maximum);
  values.set(maximum - 1, carry);
  for (let exponent = maximum - 1; exponent >= 1; exponent--) {
    carry = addExact(coefficient(polynomial, exponent), multiplyExact(root, carry));
    values.set(exponent - 1, carry);
  }
  return {
    variable: polynomial.variable,
    coefficients: new Map([...values].filter(([, value]) => !isZero(value))),
  };
}

function localOrder(
  polynomial: Polynomial,
  point: ExactNumber,
): { order: number; reduced: Polynomial } {
  let order = 0;
  let reduced = polynomial;
  while ((degree(reduced) ?? 0) > 0 && isZero(evaluatePolynomial(reduced, point))) {
    reduced = divideByRoot(reduced, point);
    order++;
  }
  return { order, reduced };
}

function finite(
  value: Expression,
  variable: string,
  point: LimitPoint,
  direction: "both" | "left" | "right",
  method: string,
): LimitResult {
  return { kind: "finite", value, variable, point, direction, exact: true, method };
}

function rationalFiniteLimit(
  expression: Expression,
  variableName: string,
  point: ExactNumber,
  direction: "both" | "left" | "right",
): LimitResult | undefined {
  const converted = toRationalPolynomial(expression, variableName);
  if (converted.kind === "unsupported") return undefined;
  const numerator = localOrder(converted.value.numerator, point);
  const denominator = localOrder(converted.value.denominator, point);
  const numeratorValue = evaluatePolynomial(numerator.reduced, point);
  const denominatorValue = evaluatePolynomial(denominator.reduced, point);
  if (denominator.order <= numerator.order) {
    if (isZero(denominatorValue)) return undefined;
    const value =
      numerator.order > denominator.order
        ? rational(0n)
        : divideExact(numeratorValue, denominatorValue);
    return finite(value, variableName, point, direction, "rational-local-order");
  }
  if (isZero(numeratorValue) || isZero(denominatorValue)) return undefined;
  const poleOrder = denominator.order - numerator.order;
  let sign: 1 | -1 =
    compareExact(numeratorValue, rational(0n)) === compareExact(denominatorValue, rational(0n))
      ? 1
      : -1;
  if (direction === "left" && poleOrder % 2 === 1) sign = sign === 1 ? -1 : 1;
  if (direction === "both" && poleOrder % 2 === 1)
    return { kind: "unsupported", reason: "Left and right limits have opposite signs" };
  return {
    kind: "infinite",
    sign,
    variable: variableName,
    point,
    direction,
    method: "rational-local-order",
  };
}

function infinityLimit(
  expression: Expression,
  variableName: string,
  point: "infinity" | "-infinity",
  direction: "both" | "left" | "right",
): LimitResult {
  const converted = toRationalPolynomial(expression, variableName);
  if (converted.kind === "unsupported")
    return { kind: "unsupported", reason: "Infinity limits currently require a rational function" };
  const numeratorDegree = degree(converted.value.numerator) ?? 0;
  const denominatorDegree = degree(converted.value.denominator) ?? 0;
  if (numeratorDegree < denominatorDegree)
    return finite(rational(0n), variableName, point, direction, "leading-degree");
  const ratio = divideExact(
    coefficient(converted.value.numerator, numeratorDegree),
    coefficient(converted.value.denominator, denominatorDegree),
  );
  if (numeratorDegree === denominatorDegree)
    return finite(ratio, variableName, point, direction, "leading-degree");
  let sign: 1 | -1 = compareExact(ratio, rational(0n)) < 0 ? -1 : 1;
  if (point === "-infinity" && (numeratorDegree - denominatorDegree) % 2 === 1)
    sign = sign === 1 ? -1 : 1;
  return {
    kind: "infinite",
    sign,
    variable: variableName,
    point,
    direction,
    method: "leading-degree",
  };
}

export function limit(
  expression: Expression,
  variableName: string,
  point: LimitPoint,
  options: LimitOptions = {},
): LimitResult {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(variableName))
    return { kind: "unsupported", reason: "Limit variable is invalid" };
  if (countNodes(expression) > (options.maxNodes ?? 10_000))
    return { kind: "incomplete", reason: "node-budget-exceeded" };
  const direction = options.direction ?? "both";
  if (point === "infinity" || point === "-infinity")
    return infinityLimit(expression, variableName, point, direction);
  if (!isExactNumber(point))
    return {
      kind: "unsupported",
      reason: "Finite limits currently require an exact rational point",
    };

  if (
    expression.kind === "binary" &&
    expression.operator === "/" &&
    expression.left.kind === "function" &&
    expression.left.name === "sin" &&
    expression.left.args.length === 1 &&
    expressionEquals(expression.left.args[0]!, expression.right)
  ) {
    const argumentAtPoint = exactElementary(substitute(expression.right, variableName, point));
    if (argumentAtPoint !== undefined && isZero(argumentAtPoint))
      return finite(rational(1n), variableName, point, direction, "selected-indeterminate-form");
  }

  const substituted = substitute(expression, variableName, point);
  try {
    const direct = exactElementary(substituted);
    if (direct !== undefined)
      return finite(direct, variableName, point, direction, "direct-substitution");
  } catch {
    // A domain failure may still be removable in the rational representation.
  }
  return (
    rationalFiniteLimit(expression, variableName, point, direction) ?? {
      kind: "unsupported",
      reason: "Limit is outside the conservative supported forms",
    }
  );
}
