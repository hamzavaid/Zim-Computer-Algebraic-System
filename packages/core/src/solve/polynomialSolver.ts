import { coefficient, degree, polynomialToExpression, Polynomial } from "../algebra/polynomial";
import {
  addExact,
  divideExact,
  ExactNumber,
  exactEquals,
  isExactNumber,
  isZero,
  multiplyExact,
  negateExact,
  parts,
  rational,
} from "../ast/rational";
import { constant, equation, Expression, func, unary } from "../ast/types";
import { simplifyExpression } from "../simplify/simplify";
import { expressionEquals } from "../visitors/equal";
import { solveQuadraticEquation } from "./quadraticSolver";
import { SolveDomain } from "./SolveOptions";
import { SolveResult } from "./SolveResult";

function integerRoot(value: bigint, exponent: number): bigint | undefined {
  if (value < 0n || exponent < 1) return undefined;
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low <= high) {
    const middle = (low + high) / 2n;
    const powered = middle ** BigInt(exponent);
    if (powered === value) return middle;
    if (powered < value) low = middle + 1n;
    else high = middle - 1n;
  }
  return undefined;
}

function exactRoot(value: ExactNumber, exponent: number): ExactNumber | undefined {
  const [numerator, denominator] = parts(value);
  const sign = numerator < 0n ? -1n : 1n;
  if (sign < 0n && exponent % 2 === 0) return undefined;
  const numeratorRoot = integerRoot(numerator < 0n ? -numerator : numerator, exponent);
  const denominatorRoot = integerRoot(denominator, exponent);
  return numeratorRoot === undefined || denominatorRoot === undefined
    ? undefined
    : rational(sign * numeratorRoot, denominatorRoot);
}

function divisors(value: bigint): bigint[] {
  const absolute = value < 0n ? -value : value;
  if (absolute === 0n) return [0n];
  const result = new Set<bigint>();
  for (let candidate = 1n; candidate * candidate <= absolute; candidate++) {
    if (absolute % candidate === 0n) {
      result.add(candidate);
      result.add(absolute / candidate);
    }
  }
  return [...result];
}

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b;
}

function evaluatePolynomial(polynomial: Polynomial, value: ExactNumber): ExactNumber {
  const polynomialDegree = degree(polynomial) ?? 0;
  let result = rational(0n);
  for (let exponent = polynomialDegree; exponent >= 0; exponent--) {
    result = addExact(multiplyExact(result, value), coefficient(polynomial, exponent));
  }
  return result;
}

function rationalCandidates(polynomial: Polynomial): ExactNumber[] {
  const polynomialDegree = degree(polynomial) ?? 0;
  const constantValue = coefficient(polynomial, 0);
  if (isZero(constantValue)) return [rational(0n)];
  const denominators = [...polynomial.coefficients.values()].map((value) => parts(value)[1]);
  const scale = denominators.reduce(lcm, 1n);
  const integerCoefficient = (exponent: number): bigint => {
    const [numerator, denominator] = parts(coefficient(polynomial, exponent));
    return numerator * (scale / denominator);
  };
  const numerators = divisors(integerCoefficient(0));
  const denominatorsOfRoots = divisors(integerCoefficient(polynomialDegree));
  const result: ExactNumber[] = [];
  for (const numerator of numerators) {
    for (const denominator of denominatorsOfRoots) {
      for (const sign of [-1n, 1n]) {
        const candidate = rational(sign * numerator, denominator);
        if (!result.some((existing) => exactEquals(existing, candidate))) result.push(candidate);
      }
    }
  }
  return result;
}

function syntheticDivide(polynomial: Polynomial, root: ExactNumber): Polynomial {
  const polynomialDegree = degree(polynomial)!;
  const coefficients = new Map<number, ExactNumber>();
  let carry = coefficient(polynomial, polynomialDegree);
  coefficients.set(polynomialDegree - 1, carry);
  for (let exponent = polynomialDegree - 1; exponent >= 1; exponent--) {
    carry = addExact(coefficient(polynomial, exponent), multiplyExact(carry, root));
    if (!isZero(carry)) coefficients.set(exponent - 1, carry);
    else coefficients.delete(exponent - 1);
  }
  return { variable: polynomial.variable, coefficients };
}

function resultValues(result: SolveResult): Expression[] | undefined {
  if (result.kind === "solution") return [result.value];
  if (result.kind === "multiple-solutions") return [...result.values];
  if (result.kind === "no-solution") return [];
  return undefined;
}

function unique(values: readonly Expression[]): Expression[] {
  return values.filter(
    (value, index) => values.findIndex((candidate) => expressionEquals(candidate, value)) === index,
  );
}

function asResult(variableName: string, values: readonly Expression[]): SolveResult {
  const distinct = unique(values);
  if (distinct.length === 0) return { kind: "no-solution" };
  if (distinct.length === 1) {
    return { kind: "solution", variable: variableName, value: distinct[0]!, verified: true };
  }
  return { kind: "multiple-solutions", variable: variableName, values: distinct, verified: true };
}

function liftRoot(
  value: Expression,
  exponent: number,
  domain: SolveDomain,
): Expression[] | undefined {
  if (!isExactNumber(value)) return undefined;
  const [numerator] = parts(value);
  if (domain === "real" && numerator < 0n && exponent % 2 === 0) return [];
  const exact = exactRoot(value, exponent);
  const positive =
    exact ??
    (exponent === 2
      ? func("sqrt", [value])
      : exponent === 3
        ? func("cbrt", [value])
        : func("root", [value, constant(exponent)]));
  if (exponent % 2 === 1) return [positive];
  if (domain === "complex" && numerator < 0n) return undefined;
  return [simplifyExpression(unary("-", positive)).expression, positive];
}

function solveComposition(
  polynomial: Polynomial,
  variableName: string,
  domain: SolveDomain,
): SolveResult | undefined {
  const exponents = [...polynomial.coefficients.keys()].filter((value) => value > 0);
  if (exponents.length === 0) return undefined;
  const commonExponent = exponents.reduce((current, value) =>
    Number(gcd(BigInt(current), BigInt(value))),
  );
  if (commonExponent <= 1) return undefined;
  const reduced: Polynomial = {
    variable: variableName,
    coefficients: new Map(
      [...polynomial.coefficients].map(([exponent, value]) => [exponent / commonExponent, value]),
    ),
  };
  const reducedResult = solvePolynomial(reduced, variableName, domain, false);
  const reducedValues = resultValues(reducedResult);
  if (reducedValues === undefined) return undefined;
  const lifted: Expression[] = [];
  for (const value of reducedValues) {
    const roots = liftRoot(value, commonExponent, domain);
    if (roots === undefined) return undefined;
    lifted.push(...roots);
  }
  return asResult(variableName, lifted);
}

function solveBinomial(
  polynomial: Polynomial,
  variableName: string,
  domain: SolveDomain,
): SolveResult | undefined {
  const polynomialDegree = degree(polynomial);
  if (polynomialDegree === null || polynomialDegree < 2 || polynomial.coefficients.size !== 2)
    return undefined;
  const exponents = [...polynomial.coefficients.keys()].sort((a, b) => a - b);
  if (exponents[0] !== 0 || exponents[1] !== polynomialDegree) return undefined;
  const radicand = divideExact(
    negateExact(coefficient(polynomial, 0)),
    coefficient(polynomial, polynomialDegree),
  );
  const lifted = liftRoot(radicand, polynomialDegree, domain);
  return lifted === undefined ? undefined : asResult(variableName, lifted);
}

export function solvePolynomial(
  input: Polynomial,
  variableName: string,
  domain: SolveDomain = "real",
  allowComposition = true,
): SolveResult {
  const inputDegree = degree(input);
  if (inputDegree === null) return { kind: "identity" };
  if (inputDegree === 0) return { kind: "no-solution" };
  if (inputDegree === 1) {
    const value = divideExact(negateExact(coefficient(input, 0)), coefficient(input, 1));
    return asResult(variableName, [value]);
  }
  if (inputDegree === 2) {
    return solveQuadraticEquation(
      equation(polynomialToExpression(input), constant(0n)),
      variableName,
      domain,
    );
  }

  const binomial = solveBinomial(input, variableName, domain);
  if (binomial) return binomial;
  if (allowComposition) {
    const composition = solveComposition(input, variableName, domain);
    if (composition) return composition;
  }

  let polynomial = input;
  const roots: Expression[] = [];
  while ((degree(polynomial) ?? 0) > 2) {
    const root = rationalCandidates(polynomial).find((candidate) =>
      isZero(evaluatePolynomial(polynomial, candidate)),
    );
    if (!root) break;
    roots.push(root);
    polynomial = syntheticDivide(polynomial, root);
  }
  if ((degree(polynomial) ?? 0) > 2) {
    return {
      kind: "unsupported",
      reason: `Polynomial degree ${inputDegree} has an irreducible factor without a supported symbolic form`,
    };
  }
  const remaining = solvePolynomial(polynomial, variableName, domain, allowComposition);
  const remainingValues = resultValues(remaining);
  if (remainingValues === undefined) {
    return {
      kind: "unsupported",
      reason: `Polynomial degree ${inputDegree} has an irreducible factor without a supported symbolic form`,
    };
  }
  return asResult(variableName, [...roots, ...remainingValues]);
}
