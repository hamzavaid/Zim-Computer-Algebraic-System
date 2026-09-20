import {
  coefficient,
  coefficientMap,
  degree as sparseDegree,
  Polynomial,
} from "../algebra/polynomial";
import {
  addExact,
  compareExact,
  divideExact,
  ExactNumber,
  isZero,
  multiplyExact,
  negateExact,
  parts,
  rational,
  subtractExact,
} from "../ast/rational";
import { Expression } from "../ast/types";

type DensePolynomial = ExactNumber[];

export interface CertifiedInterval {
  readonly lower: ExactNumber;
  readonly upper: ExactNumber;
  readonly rootCount: 1;
}

export interface SquareFreeFactor {
  readonly polynomial: Polynomial;
  readonly multiplicity: number;
}

export type SquareFreeResult =
  | {
      readonly kind: "complete";
      readonly factors: readonly SquareFreeFactor[];
      readonly totalDegree: number;
    }
  | { readonly kind: "unsupported"; readonly reason: string };

export type RealRootCountResult =
  | { readonly kind: "complete"; readonly count: number }
  | { readonly kind: "unsupported"; readonly reason: string };

export type IsolationResult =
  | { readonly kind: "complete"; readonly intervals: readonly CertifiedInterval[] }
  | { readonly kind: "unsupported"; readonly reason: string };

export interface ApproximateRealRoot {
  readonly lower: string;
  readonly upper: string;
  readonly multiplicity: number;
  readonly certified: true;
}

export type ApproximateRealResult =
  | { readonly kind: "complete"; readonly roots: readonly ApproximateRealRoot[] }
  | { readonly kind: "unsupported"; readonly reason: string };

export interface ApproximateComplexRoot {
  readonly real: number;
  readonly imaginary: number;
  readonly residual: number;
  readonly converged: boolean;
  readonly multiplicity: number;
  readonly exact?: ExactNumber;
}

export interface ComplexRootOptions {
  readonly tolerance?: number;
  readonly maxIterations?: number;
}

export type ApproximateComplexResult =
  | { readonly kind: "complete"; readonly roots: readonly ApproximateComplexRoot[] }
  | {
      readonly kind: "incomplete";
      readonly reason: "iteration-budget-exceeded";
      readonly roots: readonly ApproximateComplexRoot[];
      readonly unresolved: number;
    }
  | { readonly kind: "unsupported"; readonly reason: string };

const zero = (): ExactNumber => rational(0n);

function trim(input: DensePolynomial): DensePolynomial {
  const result = [...input];
  while (result.length > 0 && isZero(result[result.length - 1]!)) result.pop();
  return result;
}

function denseDegree(input: DensePolynomial): number {
  return trim(input).length - 1;
}

function denseFromExpression(
  expression: Expression,
  variable: string,
): { polynomial: Polynomial; dense: DensePolynomial } | { reason: string } {
  const converted = coefficientMap(expression, variable);
  if (converted.kind === "unsupported") return { reason: converted.reason };
  const polynomialDegree = sparseDegree(converted.polynomial);
  if (polynomialDegree === null || polynomialDegree < 1) {
    return { reason: "A nonconstant polynomial is required" };
  }
  return {
    polynomial: converted.polynomial,
    dense: Array.from({ length: polynomialDegree + 1 }, (_, exponent) =>
      coefficient(converted.polynomial, exponent),
    ),
  };
}

function sparseFromDense(dense: DensePolynomial, variable: string): Polynomial {
  return {
    variable,
    coefficients: new Map(
      trim(dense)
        .map((value, exponent) => [exponent, value] as const)
        .filter(([, value]) => !isZero(value)),
    ),
  };
}

function monic(input: DensePolynomial): DensePolynomial {
  const polynomial = trim(input);
  const leading = polynomial[polynomial.length - 1];
  return leading === undefined ? [] : polynomial.map((value) => divideExact(value, leading));
}

function derivative(input: DensePolynomial): DensePolynomial {
  return trim(
    input.slice(1).map((value, index) => multiplyExact(value, rational(BigInt(index + 1)))),
  );
}

function divmod(
  dividendInput: DensePolynomial,
  divisorInput: DensePolynomial,
): { quotient: DensePolynomial; remainder: DensePolynomial } {
  const divisor = trim(divisorInput);
  if (divisor.length === 0) throw new RangeError("Polynomial division by zero");
  const remainder = trim(dividendInput);
  const quotient: DensePolynomial = Array.from(
    { length: Math.max(0, remainder.length - divisor.length + 1) },
    zero,
  );
  while (remainder.length >= divisor.length && remainder.length > 0) {
    const exponent = remainder.length - divisor.length;
    const factor = divideExact(remainder[remainder.length - 1]!, divisor[divisor.length - 1]!);
    quotient[exponent] = addExact(quotient[exponent] ?? zero(), factor);
    for (let index = 0; index < divisor.length; index += 1) {
      const target = index + exponent;
      remainder[target] = subtractExact(
        remainder[target] ?? zero(),
        multiplyExact(factor, divisor[index]!),
      );
    }
    const cleaned = trim(remainder);
    remainder.length = 0;
    remainder.push(...cleaned);
  }
  return { quotient: trim(quotient), remainder: trim(remainder) };
}

function polynomialGcd(leftInput: DensePolynomial, rightInput: DensePolynomial): DensePolynomial {
  let left = trim(leftInput);
  let right = trim(rightInput);
  while (right.length > 0) {
    const remainder = divmod(left, right).remainder;
    left = right;
    right = remainder;
  }
  return monic(left);
}

function evaluateExact(input: DensePolynomial, value: ExactNumber): ExactNumber {
  let result = zero();
  for (let index = input.length - 1; index >= 0; index -= 1) {
    result = addExact(multiplyExact(result, value), input[index] ?? zero());
  }
  return result;
}

function sign(value: ExactNumber): -1 | 0 | 1 {
  const [numerator] = parts(value);
  return numerator < 0n ? -1 : numerator > 0n ? 1 : 0;
}

function squareFreeDense(
  input: DensePolynomial,
): readonly { factor: DensePolynomial; multiplicity: number }[] {
  const polynomial = monic(input);
  let repeated = polynomialGcd(polynomial, derivative(polynomial));
  let remaining = divmod(polynomial, repeated).quotient;
  const factors: { factor: DensePolynomial; multiplicity: number }[] = [];
  let multiplicity = 1;
  while (denseDegree(remaining) > 0) {
    const shared = polynomialGcd(remaining, repeated);
    const factor = monic(divmod(remaining, shared).quotient);
    if (denseDegree(factor) > 0) factors.push({ factor, multiplicity });
    remaining = shared;
    repeated = divmod(repeated, shared).quotient;
    multiplicity += 1;
  }
  return factors;
}

export function squareFreeDecomposition(
  expression: Expression,
  variable: string,
): SquareFreeResult {
  const converted = denseFromExpression(expression, variable);
  if ("reason" in converted) return { kind: "unsupported", reason: converted.reason };
  return {
    kind: "complete",
    factors: squareFreeDense(converted.dense).map(({ factor, multiplicity }) => ({
      polynomial: sparseFromDense(factor, variable),
      multiplicity,
    })),
    totalDegree: denseDegree(converted.dense),
  };
}

function sturmSequence(input: DensePolynomial): readonly DensePolynomial[] {
  const sequence: DensePolynomial[] = [monic(input), derivative(monic(input))];
  while (sequence[sequence.length - 1]!.length > 0) {
    const previous = sequence[sequence.length - 2]!;
    const current = sequence[sequence.length - 1]!;
    const remainder = divmod(previous, current).remainder.map(negateExact);
    if (remainder.length === 0) break;
    sequence.push(remainder);
  }
  return sequence;
}

function variations(sequence: readonly DensePolynomial[], at: ExactNumber): number {
  const signs = sequence.map((polynomial) => sign(evaluateExact(polynomial, at))).filter(Boolean);
  let result = 0;
  for (let index = 1; index < signs.length; index += 1) {
    if (signs[index] !== signs[index - 1]) result += 1;
  }
  return result;
}

function rootBound(input: DensePolynomial): ExactNumber {
  const polynomial = trim(input);
  const leading = polynomial[polynomial.length - 1]!;
  const [leadingNumerator, leadingDenominator] = parts(leading);
  let maximum = 0n;
  for (const value of polynomial.slice(0, -1)) {
    const [numerator, denominator] = parts(value);
    const top = (numerator < 0n ? -numerator : numerator) * leadingDenominator;
    const bottom = denominator * (leadingNumerator < 0n ? -leadingNumerator : leadingNumerator);
    const ceiling = (top + bottom - 1n) / bottom;
    if (ceiling > maximum) maximum = ceiling;
  }
  return rational(maximum + 1n);
}

function countIn(
  sequence: readonly DensePolynomial[],
  lower: ExactNumber,
  upper: ExactNumber,
): number {
  return variations(sequence, lower) - variations(sequence, upper);
}

export function countDistinctRealRoots(
  expression: Expression,
  variable: string,
): RealRootCountResult {
  const converted = denseFromExpression(expression, variable);
  if ("reason" in converted) return { kind: "unsupported", reason: converted.reason };
  const squareFree = divmod(
    converted.dense,
    polynomialGcd(converted.dense, derivative(converted.dense)),
  ).quotient;
  const bound = rootBound(squareFree);
  const sequence = sturmSequence(squareFree);
  return { kind: "complete", count: countIn(sequence, negateExact(bound), bound) };
}

function isolateDense(input: DensePolynomial): CertifiedInterval[] {
  const squareFree = divmod(input, polynomialGcd(input, derivative(input))).quotient;
  const sequence = sturmSequence(squareFree);
  const bound = rootBound(squareFree);
  const initialLower = negateExact(bound);
  const initialUpper = bound;
  const pending: { lower: ExactNumber; upper: ExactNumber; count: number; depth: number }[] = [
    {
      lower: initialLower,
      upper: initialUpper,
      count: countIn(sequence, initialLower, initialUpper),
      depth: 0,
    },
  ];
  const intervals: CertifiedInterval[] = [];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.count === 0) continue;
    if (current.count === 1) {
      intervals.push({ lower: current.lower, upper: current.upper, rootCount: 1 });
      continue;
    }
    if (current.depth > 512) throw new RangeError("Root isolation depth exceeded");
    let split = divideExact(addExact(current.lower, current.upper), rational(2n));
    for (let denominator = 3n; isZero(evaluateExact(squareFree, split)); denominator += 1n) {
      split = divideExact(
        addExact(multiplyExact(current.lower, rational(denominator - 1n)), current.upper),
        rational(denominator),
      );
    }
    const leftCount = countIn(sequence, current.lower, split);
    const rightCount = countIn(sequence, split, current.upper);
    pending.push(
      { lower: split, upper: current.upper, count: rightCount, depth: current.depth + 1 },
      { lower: current.lower, upper: split, count: leftCount, depth: current.depth + 1 },
    );
  }
  return intervals.sort((left, right) => compareExact(left.lower, right.lower));
}

export function isolateRealRoots(expression: Expression, variable: string): IsolationResult {
  const converted = denseFromExpression(expression, variable);
  if ("reason" in converted) return { kind: "unsupported", reason: converted.reason };
  return { kind: "complete", intervals: isolateDense(converted.dense) };
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator < 0n && numerator % denominator !== 0n ? quotient - 1n : quotient;
}

function outwardDecimal(value: ExactNumber, fractionalDigits: number, upper: boolean): string {
  const [numerator, denominator] = parts(value);
  const scale = 10n ** BigInt(fractionalDigits);
  const scaledFloor = floorDivide(numerator * scale, denominator);
  const scaled =
    upper && numerator * scale !== scaledFloor * denominator ? scaledFloor + 1n : scaledFloor;
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const digits = absolute.toString().padStart(fractionalDigits + 1, "0");
  const whole = digits.slice(0, -fractionalDigits) || "0";
  const fraction = fractionalDigits === 0 ? "" : `.${digits.slice(-fractionalDigits)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

function refineInterval(
  polynomial: DensePolynomial,
  interval: CertifiedInterval,
  digits: number,
): readonly [ExactNumber, ExactNumber] {
  let lower = interval.lower;
  let upper = interval.upper;
  let lowerSign = sign(evaluateExact(polynomial, lower));
  for (let iteration = 0; iteration < digits * 5 + 64; iteration += 1) {
    const width = subtractExact(upper, lower);
    if (compareExact(width, rational(1n, 10n ** BigInt(digits + 2))) < 0) break;
    const middle = divideExact(addExact(lower, upper), rational(2n));
    const middleSign = sign(evaluateExact(polynomial, middle));
    if (middleSign === 0) return [middle, middle];
    if (lowerSign === 0 || lowerSign !== middleSign) upper = middle;
    else {
      lower = middle;
      lowerSign = middleSign;
    }
  }
  return [lower, upper];
}

export function approximateRealRoots(
  expression: Expression,
  variable: string,
  options: { readonly decimalDigits?: number } = {},
): ApproximateRealResult {
  const converted = denseFromExpression(expression, variable);
  if ("reason" in converted) return { kind: "unsupported", reason: converted.reason };
  const significantDigits = Math.max(2, Math.min(200, options.decimalDigits ?? 16));
  const fractionalDigits = significantDigits - 1;
  const roots: ApproximateRealRoot[] = [];
  for (const { factor, multiplicity } of squareFreeDense(converted.dense)) {
    for (const interval of isolateDense(factor)) {
      const [lower, upper] = refineInterval(factor, interval, significantDigits);
      roots.push({
        lower: outwardDecimal(lower, fractionalDigits, false),
        upper: outwardDecimal(upper, fractionalDigits, true),
        multiplicity,
        certified: true,
      });
    }
  }
  roots.sort((left, right) => Number(left.lower) - Number(right.lower));
  return { kind: "complete", roots };
}

interface ComplexNumber {
  real: number;
  imaginary: number;
}

function complexMultiply(left: ComplexNumber, right: ComplexNumber): ComplexNumber {
  return {
    real: left.real * right.real - left.imaginary * right.imaginary,
    imaginary: left.real * right.imaginary + left.imaginary * right.real,
  };
}

function complexDivide(left: ComplexNumber, right: ComplexNumber): ComplexNumber {
  const denominator = right.real * right.real + right.imaginary * right.imaginary;
  return {
    real: (left.real * right.real + left.imaginary * right.imaginary) / denominator,
    imaginary: (left.imaginary * right.real - left.real * right.imaginary) / denominator,
  };
}

function exactToNumber(value: ExactNumber): number {
  const [numerator, denominator] = parts(value);
  return Number(numerator) / Number(denominator);
}

function evaluateComplexDense(
  coefficients: readonly number[],
  value: ComplexNumber,
): ComplexNumber {
  let result: ComplexNumber = { real: 0, imaginary: 0 };
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    result = complexMultiply(result, value);
    result.real += coefficients[index] ?? 0;
  }
  return result;
}

function recognizeExactRoot(
  polynomial: DensePolynomial,
  root: ComplexNumber,
  tolerance: number,
): ExactNumber | undefined {
  if (Math.abs(root.imaginary) > Math.sqrt(tolerance)) return undefined;
  for (let denominator = 1; denominator <= 1000; denominator += 1) {
    const numerator = Math.round(root.real * denominator);
    if (!Number.isSafeInteger(numerator)) continue;
    const candidate = rational(BigInt(numerator), BigInt(denominator));
    if (isZero(evaluateExact(polynomial, candidate))) return candidate;
  }
  return undefined;
}

function approximateDenseComplex(
  dense: DensePolynomial,
  tolerance: number,
  maxIterations: number,
  multiplicity: number,
): ApproximateComplexResult {
  const polynomialDegree = denseDegree(dense);
  if (polynomialDegree === 1) {
    const exact = divideExact(negateExact(dense[0]!), dense[1]!);
    return {
      kind: "complete",
      roots: [
        {
          real: exactToNumber(exact),
          imaginary: 0,
          residual: 0,
          converged: true,
          multiplicity,
          exact,
        },
      ],
    };
  }
  const leading = exactToNumber(dense[polynomialDegree]!);
  if (!Number.isFinite(leading) || leading === 0) {
    return { kind: "unsupported", reason: "Coefficients exceed numeric approximation range" };
  }
  const coefficients = dense.map((value) => exactToNumber(value) / leading);
  if (coefficients.some((value) => !Number.isFinite(value))) {
    return { kind: "unsupported", reason: "Coefficients exceed numeric approximation range" };
  }
  const radius = 1 + Math.max(...coefficients.slice(0, -1).map(Math.abs));
  let roots: ComplexNumber[] = Array.from({ length: polynomialDegree }, (_, index) => {
    const angle = (2 * Math.PI * (index + 0.25)) / polynomialDegree;
    return { real: radius * Math.cos(angle), imaginary: radius * Math.sin(angle) };
  });
  let converged = false;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let maximumDelta = 0;
    const previous = roots;
    roots = previous.map((root, index) => {
      let denominator: ComplexNumber = { real: 1, imaginary: 0 };
      for (let other = 0; other < previous.length; other += 1) {
        if (other === index) continue;
        denominator = complexMultiply(denominator, {
          real: root.real - previous[other]!.real,
          imaginary: root.imaginary - previous[other]!.imaginary,
        });
      }
      if (Math.hypot(denominator.real, denominator.imaginary) < Number.EPSILON) {
        denominator.real += tolerance;
      }
      const correction = complexDivide(evaluateComplexDense(coefficients, root), denominator);
      maximumDelta = Math.max(maximumDelta, Math.hypot(correction.real, correction.imaginary));
      return {
        real: root.real - correction.real,
        imaginary: root.imaginary - correction.imaginary,
      };
    });
    if (maximumDelta <= tolerance) {
      converged = true;
      break;
    }
  }
  const diagnosed = roots
    .map((root) => {
      const residualValue = evaluateComplexDense(coefficients, root);
      const residual = Math.hypot(residualValue.real, residualValue.imaginary);
      return {
        real: Math.abs(root.real) < tolerance ? 0 : root.real,
        imaginary: Math.abs(root.imaginary) < tolerance ? 0 : root.imaginary,
        residual,
        converged: converged && residual <= Math.sqrt(tolerance),
        multiplicity,
        ...(recognizeExactRoot(dense, root, tolerance) === undefined
          ? {}
          : { exact: recognizeExactRoot(dense, root, tolerance) }),
      };
    })
    .sort((left, right) => left.real - right.real || left.imaginary - right.imaginary);
  const unresolved = diagnosed.filter((root) => !root.converged).length;
  return unresolved === 0
    ? { kind: "complete", roots: diagnosed }
    : {
        kind: "incomplete",
        reason: "iteration-budget-exceeded",
        roots: diagnosed,
        unresolved,
      };
}

export function approximateComplexRoots(
  expression: Expression,
  variable: string,
  options: ComplexRootOptions = {},
): ApproximateComplexResult {
  const converted = denseFromExpression(expression, variable);
  if ("reason" in converted) return { kind: "unsupported", reason: converted.reason };
  const tolerance = Math.max(Number.EPSILON, options.tolerance ?? 1e-12);
  const maxIterations = Math.max(1, options.maxIterations ?? 1000);
  const roots: ApproximateComplexRoot[] = [];
  let unresolved = 0;
  for (const { factor, multiplicity } of squareFreeDense(converted.dense)) {
    const result = approximateDenseComplex(factor, tolerance, maxIterations, multiplicity);
    if (result.kind === "unsupported") return result;
    roots.push(...result.roots);
    if (result.kind === "incomplete") unresolved += result.unresolved * multiplicity;
  }
  roots.sort((left, right) => left.real - right.real || left.imaginary - right.imaginary);
  return unresolved === 0
    ? { kind: "complete", roots }
    : { kind: "incomplete", reason: "iteration-budget-exceeded", roots, unresolved };
}

export type PolynomialRootAnalysis =
  | {
      readonly kind: "complete";
      readonly degree: number;
      readonly factors: readonly SquareFreeFactor[];
      readonly realRoots: readonly ApproximateRealRoot[];
      readonly complexRoots: readonly ApproximateComplexRoot[];
    }
  | { readonly kind: "incomplete" | "unsupported"; readonly reason: string };

export function analyzePolynomialRoots(
  expression: Expression,
  variable: string,
): PolynomialRootAnalysis {
  const converted = denseFromExpression(expression, variable);
  if ("reason" in converted) return { kind: "unsupported", reason: converted.reason };
  const factors = squareFreeDecomposition(expression, variable);
  const real = approximateRealRoots(expression, variable);
  const complex = approximateComplexRoots(expression, variable);
  if (factors.kind !== "complete" || real.kind !== "complete") {
    return { kind: "unsupported", reason: "Polynomial analysis could not be completed" };
  }
  if (complex.kind !== "complete") return { kind: complex.kind, reason: complex.reason };
  return {
    kind: "complete",
    degree: denseDegree(converted.dense),
    factors: factors.factors,
    realRoots: real.roots,
    complexRoots: complex.roots,
  };
}
