import { degree, Polynomial } from "../algebra/polynomial";
import {
  addExact,
  ExactNumber,
  isExactNumber,
  isZero,
  multiplyExact,
  rational,
  subtractExact,
} from "../ast/rational";
import { Equation, Expression } from "../ast/types";
import { evaluate } from "../visitors/evaluate";
import { SolveDomain } from "./SolveOptions";
import { solvePolynomial } from "./polynomialSolver";
import { SolveResult } from "./SolveResult";

interface RationalPolynomial {
  readonly numerator: Polynomial;
  readonly denominator: Polynomial;
}

type RationalPolynomialResult =
  | { readonly kind: "rational-function"; readonly value: RationalPolynomial }
  | { readonly kind: "unsupported"; readonly reason: string };

const create = (
  variableName: string,
  coefficients: ReadonlyMap<number, ExactNumber>,
): Polynomial => ({
  variable: variableName,
  coefficients: new Map([...coefficients].filter(([, value]) => !isZero(value))),
});

const one = (variableName: string): Polynomial =>
  create(variableName, new Map([[0, rational(1n)]]));

function combine(
  left: Polynomial,
  right: Polynomial,
  operation: "add" | "subtract" | "multiply",
): Polynomial {
  const result = new Map<number, ExactNumber>();
  if (operation === "multiply") {
    for (const [leftExponent, leftValue] of left.coefficients) {
      for (const [rightExponent, rightValue] of right.coefficients) {
        const exponent = leftExponent + rightExponent;
        result.set(
          exponent,
          addExact(result.get(exponent) ?? rational(0n), multiplyExact(leftValue, rightValue)),
        );
      }
    }
  } else {
    for (const [exponent, value] of left.coefficients) result.set(exponent, value);
    for (const [exponent, value] of right.coefficients) {
      const current = result.get(exponent) ?? rational(0n);
      result.set(
        exponent,
        operation === "add" ? addExact(current, value) : subtractExact(current, value),
      );
    }
  }
  return create(left.variable, result);
}

function power(polynomial: Polynomial, exponent: number): Polynomial {
  let result = one(polynomial.variable);
  for (let index = 0; index < exponent; index++) {
    result = combine(result, polynomial, "multiply");
  }
  return result;
}

function convert(expression: Expression, variableName: string): RationalPolynomialResult {
  if (isExactNumber(expression)) {
    return {
      kind: "rational-function",
      value: {
        numerator: create(variableName, new Map([[0, expression]])),
        denominator: one(variableName),
      },
    };
  }
  if (expression.kind === "variable") {
    if (expression.name !== variableName) {
      return { kind: "unsupported", reason: `Unexpected variable '${expression.name}'` };
    }
    return {
      kind: "rational-function",
      value: {
        numerator: create(variableName, new Map([[1, rational(1n)]])),
        denominator: one(variableName),
      },
    };
  }
  if (expression.kind === "function") {
    return { kind: "unsupported", reason: `Function '${expression.name}' is not rational` };
  }
  if (expression.kind === "unary") {
    const converted = convert(expression.operand, variableName);
    if (converted.kind === "unsupported" || expression.operator === "+") return converted;
    return {
      kind: "rational-function",
      value: {
        numerator: combine(
          create(variableName, new Map([[0, rational(-1n)]])),
          converted.value.numerator,
          "multiply",
        ),
        denominator: converted.value.denominator,
      },
    };
  }

  if (expression.operator === "%") {
    return { kind: "unsupported", reason: "Modulo expressions are not rational functions" };
  }
  if (expression.operator === "^") {
    if (!isExactNumber(expression.right) || expression.right.kind !== "constant") {
      return { kind: "unsupported", reason: "Rational-function powers must be integers" };
    }
    const exponent = Number(expression.right.value);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 32) {
      return { kind: "unsupported", reason: "Rational-function exponent is out of range" };
    }
    const base = convert(expression.left, variableName);
    if (base.kind === "unsupported") return base;
    const positive = Math.abs(exponent);
    return {
      kind: "rational-function",
      value:
        exponent >= 0
          ? {
              numerator: power(base.value.numerator, positive),
              denominator: power(base.value.denominator, positive),
            }
          : {
              numerator: power(base.value.denominator, positive),
              denominator: power(base.value.numerator, positive),
            },
    };
  }

  const left = convert(expression.left, variableName);
  if (left.kind === "unsupported") return left;
  const right = convert(expression.right, variableName);
  if (right.kind === "unsupported") return right;
  const a = left.value;
  const b = right.value;
  if (expression.operator === "*") {
    return {
      kind: "rational-function",
      value: {
        numerator: combine(a.numerator, b.numerator, "multiply"),
        denominator: combine(a.denominator, b.denominator, "multiply"),
      },
    };
  }
  if (expression.operator === "/") {
    if (degree(b.numerator) === null) {
      return { kind: "unsupported", reason: "Division by zero is undefined" };
    }
    return {
      kind: "rational-function",
      value: {
        numerator: combine(a.numerator, b.denominator, "multiply"),
        denominator: combine(a.denominator, b.numerator, "multiply"),
      },
    };
  }
  const numerator = combine(
    combine(a.numerator, b.denominator, "multiply"),
    combine(b.numerator, a.denominator, "multiply"),
    expression.operator === "+" ? "add" : "subtract",
  );
  return {
    kind: "rational-function",
    value: {
      numerator,
      denominator: combine(a.denominator, b.denominator, "multiply"),
    },
  };
}

function numericPolynomial(polynomial: Polynomial, value: number): number {
  let result = 0;
  for (let exponent = degree(polynomial) ?? 0; exponent >= 0; exponent--) {
    const coefficient = polynomial.coefficients.get(exponent);
    result = result * value + (coefficient ? evaluate(coefficient) : 0);
  }
  return result;
}

function filterExcluded(result: SolveResult, denominators: readonly Polynomial[]): SolveResult {
  if (result.kind !== "solution" && result.kind !== "multiple-solutions") return result;
  const values = result.kind === "solution" ? [result.value] : [...result.values];
  const kept = values.filter((value) => {
    try {
      const numeric = evaluate(value);
      return denominators.every(
        (denominator) => Math.abs(numericPolynomial(denominator, numeric)) > 1e-9,
      );
    } catch {
      return true;
    }
  });
  if (kept.length === 0) return { kind: "no-solution" };
  if (kept.length === 1) {
    return { kind: "solution", variable: result.variable, value: kept[0]!, verified: true };
  }
  return { kind: "multiple-solutions", variable: result.variable, values: kept, verified: true };
}

export function solveRationalEquation(
  equation: Equation,
  variableName: string,
  domain: SolveDomain,
): SolveResult {
  const left = convert(equation.left, variableName);
  if (left.kind === "unsupported") return left;
  const right = convert(equation.right, variableName);
  if (right.kind === "unsupported") return right;
  if (degree(left.value.denominator) === null || degree(right.value.denominator) === null) {
    return { kind: "unsupported", reason: "Division by zero is undefined" };
  }
  const crossDifference = combine(
    combine(left.value.numerator, right.value.denominator, "multiply"),
    combine(right.value.numerator, left.value.denominator, "multiply"),
    "subtract",
  );
  return filterExcluded(solvePolynomial(crossDifference, variableName, domain), [
    left.value.denominator,
    right.value.denominator,
  ]);
}

export function containsVariableDenominator(expression: Expression, variableName: string): boolean {
  if (expression.kind === "binary") {
    if (expression.operator === "/") {
      const converted = convert(expression.right, variableName);
      if (converted.kind === "rational-function" && degree(converted.value.numerator) !== 0)
        return true;
    }
    return (
      containsVariableDenominator(expression.left, variableName) ||
      containsVariableDenominator(expression.right, variableName)
    );
  }
  if (expression.kind === "unary")
    return containsVariableDenominator(expression.operand, variableName);
  if (expression.kind === "function")
    return expression.args.some((argument) => containsVariableDenominator(argument, variableName));
  return false;
}
