import {
  addExact,
  divideExact,
  ExactNumber,
  isExactNumber,
  isZero,
  multiplyExact,
  parts,
  rational,
  subtractExact,
} from "../ast/rational";
import { binary, constant, Expression, unary, variable } from "../ast/types";

export interface Polynomial {
  readonly variable: string;
  readonly coefficients: ReadonlyMap<number, ExactNumber>;
}

export type PolynomialResult =
  | { readonly kind: "polynomial"; readonly polynomial: Polynomial }
  | { readonly kind: "unsupported"; readonly reason: string };

const unsupported = (reason: string): PolynomialResult => ({ kind: "unsupported", reason });

function clean(coefficients: ReadonlyMap<number, ExactNumber>): Map<number, ExactNumber> {
  const result = new Map<number, ExactNumber>();
  for (const [exponent, coefficient] of coefficients) {
    if (!isZero(coefficient)) result.set(exponent, coefficient);
  }
  return result;
}

function create(variableName: string, coefficients: ReadonlyMap<number, ExactNumber>): Polynomial {
  return { variable: variableName, coefficients: clean(coefficients) };
}

function addPolynomials(left: Polynomial, right: Polynomial, subtract = false): Polynomial {
  const result = new Map(left.coefficients);
  for (const [exponent, coefficient] of right.coefficients) {
    const current = result.get(exponent) ?? rational(0n);
    result.set(
      exponent,
      subtract ? subtractExact(current, coefficient) : addExact(current, coefficient),
    );
  }
  return create(left.variable, result);
}

function multiplyPolynomials(left: Polynomial, right: Polynomial): Polynomial {
  const result = new Map<number, ExactNumber>();
  for (const [leftExponent, leftCoefficient] of left.coefficients) {
    for (const [rightExponent, rightCoefficient] of right.coefficients) {
      const exponent = leftExponent + rightExponent;
      const product = multiplyExact(leftCoefficient, rightCoefficient);
      result.set(exponent, addExact(result.get(exponent) ?? rational(0n), product));
    }
  }
  return create(left.variable, result);
}

function scalePolynomial(polynomial: Polynomial, divisor: ExactNumber): PolynomialResult {
  if (isZero(divisor)) return unsupported("Polynomial division by zero is undefined");
  return {
    kind: "polynomial",
    polynomial: create(
      polynomial.variable,
      new Map(
        [...polynomial.coefficients].map(([exponent, coefficient]) => [
          exponent,
          divideExact(coefficient, divisor),
        ]),
      ),
    ),
  };
}

function powerPolynomial(base: Polynomial, exponent: number): Polynomial {
  let result = create(base.variable, new Map([[0, rational(1n)]]));
  let factor = base;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = multiplyPolynomials(result, factor);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) factor = multiplyPolynomials(factor, factor);
  }
  return result;
}

export function coefficientMap(expression: Expression, variableName: string): PolynomialResult {
  if (isExactNumber(expression)) {
    return { kind: "polynomial", polynomial: create(variableName, new Map([[0, expression]])) };
  }
  if (expression.kind === "variable") {
    return expression.name === variableName
      ? { kind: "polynomial", polynomial: create(variableName, new Map([[1, rational(1n)]])) }
      : unsupported(
          `Expression contains variable '${expression.name}', expected only '${variableName}'`,
        );
  }
  if (expression.kind === "function") {
    return unsupported(`Function '${expression.name}' is not polynomial`);
  }
  if (expression.kind === "unary") {
    const operand = coefficientMap(expression.operand, variableName);
    if (operand.kind === "unsupported" || expression.operator === "+") return operand;
    return {
      kind: "polynomial",
      polynomial: create(
        variableName,
        new Map(
          [...operand.polynomial.coefficients].map(([exponent, coefficient]) => [
            exponent,
            multiplyExact(rational(-1n), coefficient),
          ]),
        ),
      ),
    };
  }

  const left = coefficientMap(expression.left, variableName);
  if (left.kind === "unsupported") return left;
  const right = coefficientMap(expression.right, variableName);
  if (right.kind === "unsupported") return right;

  if (expression.operator === "+" || expression.operator === "-") {
    return {
      kind: "polynomial",
      polynomial: addPolynomials(left.polynomial, right.polynomial, expression.operator === "-"),
    };
  }
  if (expression.operator === "*") {
    return {
      kind: "polynomial",
      polynomial: multiplyPolynomials(left.polynomial, right.polynomial),
    };
  }
  if (expression.operator === "/") {
    if (degree(right.polynomial) !== 0) {
      return unsupported("Division by a variable expression is not polynomial");
    }
    return scalePolynomial(left.polynomial, coefficient(right.polynomial, 0));
  }
  if (expression.operator === "^") {
    if (!isExactNumber(expression.right))
      return unsupported("Polynomial exponent must be an integer constant");
    const [numerator, denominator] = parts(expression.right);
    if (denominator !== 1n || numerator < 0n) {
      return unsupported("Polynomial exponent must be a nonnegative integer");
    }
    if (numerator === 0n && degree(left.polynomial) !== 0) {
      return unsupported("A symbolic zero exponent requires a nonzero-domain assumption");
    }
    if (numerator > BigInt(Number.MAX_SAFE_INTEGER))
      return unsupported("Polynomial exponent is too large");
    return { kind: "polynomial", polynomial: powerPolynomial(left.polynomial, Number(numerator)) };
  }
  return unsupported("Modulo expressions are not polynomial");
}

export function coefficient(polynomial: Polynomial, exponent: number): ExactNumber {
  return polynomial.coefficients.get(exponent) ?? rational(0n);
}

export function degree(polynomial: Polynomial): number | null {
  const exponents = [...polynomial.coefficients.keys()];
  return exponents.length === 0 ? null : Math.max(...exponents);
}

function coefficientTerm(
  coefficientValue: ExactNumber,
  exponent: number,
  variableName: string,
): Expression {
  if (exponent === 0) return coefficientValue;
  const power =
    exponent === 1
      ? variable(variableName)
      : binary("^", variable(variableName), constant(exponent));
  const [numerator, denominator] = parts(coefficientValue);
  if (numerator === denominator) return power;
  if (numerator === -denominator) return unary("-", power);
  return binary("*", coefficientValue, power);
}

export function polynomialToExpression(polynomial: Polynomial): Expression {
  const exponents = [...polynomial.coefficients.keys()].sort((a, b) => b - a);
  if (exponents.length === 0) return constant(0n);
  const terms = exponents.map((exponent) =>
    coefficientTerm(polynomial.coefficients.get(exponent)!, exponent, polynomial.variable),
  );
  return terms.slice(1).reduce((sum, term) => binary("+", sum, term), terms[0]!);
}

export function polynomialEquals(left: Polynomial, right: Polynomial): boolean {
  if (left.variable !== right.variable) return false;
  const exponents = new Set([...left.coefficients.keys(), ...right.coefficients.keys()]);
  return [...exponents].every((exponent) => {
    const [leftNumerator, leftDenominator] = parts(coefficient(left, exponent));
    const [rightNumerator, rightDenominator] = parts(coefficient(right, exponent));
    return leftNumerator === rightNumerator && leftDenominator === rightDenominator;
  });
}
