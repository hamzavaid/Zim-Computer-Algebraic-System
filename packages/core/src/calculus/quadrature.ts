import {
  addExact,
  compareExact,
  divideExact,
  ExactNumber,
  isExactNumber,
  isZero,
  multiplyExact,
  negateExact,
  parts,
  powerExact,
  rational,
  subtractExact,
} from "../ast/rational";
import { Expression } from "../ast/types";
import { containsVariable } from "../visitors/containsVariable";
import { integrate } from "./integrate";
import { QuadratureOptions, QuadratureResult } from "./types";

class SeriesBudgetError extends Error {}
class IterationBudgetError extends Error {}

function absolute(value: ExactNumber): ExactNumber {
  return compareExact(value, rational(0n)) < 0 ? negateExact(value) : value;
}

function below(value: ExactNumber, tolerance: ExactNumber): boolean {
  return compareExact(absolute(value), tolerance) <= 0;
}

interface PrecisionContext {
  readonly epsilon: ExactNumber;
  readonly maxTerms: number;
}

function exponential(value: ExactNumber, context: PrecisionContext): ExactNumber {
  let reduced = value;
  let squarings = 0;
  while (compareExact(absolute(reduced), rational(1n)) > 0) {
    reduced = divideExact(reduced, rational(2n));
    squarings++;
  }
  let sum = rational(1n);
  let term = rational(1n);
  let converged = false;
  for (let index = 1; index <= context.maxTerms; index++) {
    term = divideExact(multiplyExact(term, reduced), rational(BigInt(index)));
    sum = addExact(sum, term);
    if (below(term, context.epsilon)) {
      converged = true;
      break;
    }
  }
  if (!converged) throw new SeriesBudgetError("Exponential series budget exceeded");
  for (let index = 0; index < squarings; index++) sum = multiplyExact(sum, sum);
  return sum;
}

function sine(value: ExactNumber, context: PrecisionContext): ExactNumber {
  let sum = value;
  let term = value;
  const negativeSquare = negateExact(multiplyExact(value, value));
  let converged = below(term, context.epsilon);
  for (let index = 1; !converged && index <= context.maxTerms; index++) {
    term = divideExact(
      multiplyExact(term, negativeSquare),
      rational(BigInt(2 * index) * BigInt(2 * index + 1)),
    );
    sum = addExact(sum, term);
    converged = below(term, context.epsilon);
  }
  if (!converged) throw new SeriesBudgetError("Sine series budget exceeded");
  return sum;
}

function cosine(value: ExactNumber, context: PrecisionContext): ExactNumber {
  let sum = rational(1n);
  let term = rational(1n);
  const negativeSquare = negateExact(multiplyExact(value, value));
  let converged = false;
  for (let index = 1; index <= context.maxTerms; index++) {
    term = divideExact(
      multiplyExact(term, negativeSquare),
      rational(BigInt(2 * index - 1) * BigInt(2 * index)),
    );
    sum = addExact(sum, term);
    if (below(term, context.epsilon)) {
      converged = true;
      break;
    }
  }
  if (!converged) throw new SeriesBudgetError("Cosine series budget exceeded");
  return sum;
}

function logarithmNearOne(value: ExactNumber, context: PrecisionContext): ExactNumber {
  const z = divideExact(subtractExact(value, rational(1n)), addExact(value, rational(1n)));
  const square = multiplyExact(z, z);
  let power = z;
  let sum = rational(0n);
  let converged = false;
  for (let index = 0; index < context.maxTerms; index++) {
    const term = divideExact(power, rational(BigInt(2 * index + 1)));
    sum = addExact(sum, term);
    if (below(term, context.epsilon)) {
      converged = true;
      break;
    }
    power = multiplyExact(power, square);
  }
  if (!converged) throw new SeriesBudgetError("Logarithm series budget exceeded");
  return multiplyExact(rational(2n), sum);
}

function logarithm(value: ExactNumber, context: PrecisionContext): ExactNumber {
  if (compareExact(value, rational(0n)) <= 0) throw new RangeError("Logarithm domain error");
  let reduced = value;
  let powerOfTwo = 0;
  while (compareExact(reduced, rational(2n)) > 0) {
    reduced = divideExact(reduced, rational(2n));
    powerOfTwo++;
  }
  while (compareExact(reduced, rational(1n, 2n)) < 0) {
    reduced = multiplyExact(reduced, rational(2n));
    powerOfTwo--;
  }
  return addExact(
    logarithmNearOne(reduced, context),
    multiplyExact(rational(BigInt(powerOfTwo)), logarithmNearOne(rational(2n), context)),
  );
}

function root(value: ExactNumber, degree: 2 | 3, context: PrecisionContext): ExactNumber {
  if (degree === 2 && compareExact(value, rational(0n)) < 0)
    throw new RangeError("Square root domain error");
  if (isZero(value)) return value;
  let estimate = absolute(value);
  if (compareExact(estimate, rational(1n)) < 0) estimate = rational(1n);
  let converged = false;
  for (let index = 0; index < context.maxTerms; index++) {
    const next =
      degree === 2
        ? divideExact(addExact(estimate, divideExact(value, estimate)), rational(2n))
        : divideExact(
            addExact(
              multiplyExact(rational(2n), estimate),
              divideExact(value, multiplyExact(estimate, estimate)),
            ),
            rational(3n),
          );
    if (below(subtractExact(next, estimate), context.epsilon)) {
      estimate = next;
      converged = true;
      break;
    }
    estimate = next;
  }
  if (!converged) throw new SeriesBudgetError("Root iteration budget exceeded");
  return estimate;
}

function evaluatePrecise(
  expression: Expression,
  variableName: string,
  value: ExactNumber,
  context: PrecisionContext,
): ExactNumber {
  if (isExactNumber(expression)) return expression;
  if (expression.kind === "variable") {
    if (expression.name !== variableName) throw new RangeError(`No value for '${expression.name}'`);
    return value;
  }
  if (expression.kind === "unary") {
    const operand = evaluatePrecise(expression.operand, variableName, value, context);
    return expression.operator === "-" ? negateExact(operand) : operand;
  }
  if (expression.kind === "binary") {
    const left = evaluatePrecise(expression.left, variableName, value, context);
    const right = evaluatePrecise(expression.right, variableName, value, context);
    if (expression.operator === "+") return addExact(left, right);
    if (expression.operator === "-") return subtractExact(left, right);
    if (expression.operator === "*") return multiplyExact(left, right);
    if (expression.operator === "/") return divideExact(left, right);
    if (expression.operator === "^" && right.kind === "constant")
      return powerExact(left, right.value);
    throw new RangeError(`Unsupported precision operator '${expression.operator}'`);
  }
  if (expression.args.length !== 1)
    throw new RangeError(
      `Unsupported precision function ${expression.name}/${expression.args.length}`,
    );
  const argument = evaluatePrecise(expression.args[0]!, variableName, value, context);
  if (expression.name === "sin") return sine(argument, context);
  if (expression.name === "cos") return cosine(argument, context);
  if (expression.name === "exp") return exponential(argument, context);
  if (expression.name === "ln" || expression.name === "log") return logarithm(argument, context);
  if (expression.name === "sqrt") return root(argument, 2, context);
  if (expression.name === "cbrt") return root(argument, 3, context);
  if (expression.name === "abs") return absolute(argument);
  throw new RangeError(`Unsupported precision function '${expression.name}'`);
}

function provenContinuous(
  expression: Expression,
  variableName: string,
  lower: ExactNumber,
  upper: ExactNumber,
): boolean {
  if (isExactNumber(expression) || expression.kind === "variable") return true;
  if (expression.kind === "unary")
    return provenContinuous(expression.operand, variableName, lower, upper);
  if (expression.kind === "binary") {
    if (expression.operator === "%") return false;
    if (expression.operator === "/" && containsVariable(expression.right, variableName))
      return false;
    if (
      expression.operator === "^" &&
      (expression.right.kind !== "constant" || expression.right.value < 0n)
    )
      return false;
    return (
      provenContinuous(expression.left, variableName, lower, upper) &&
      provenContinuous(expression.right, variableName, lower, upper)
    );
  }
  if (expression.args.length !== 1) return false;
  if (!["sin", "cos", "exp", "ln", "log", "sqrt", "cbrt", "abs"].includes(expression.name))
    return false;
  if (expression.name === "ln" || expression.name === "log")
    return (
      expression.args[0]!.kind === "variable" &&
      expression.args[0]!.name === variableName &&
      compareExact(lower, rational(0n)) > 0
    );
  if (expression.name === "sqrt")
    return (
      expression.args[0]!.kind === "variable" &&
      expression.args[0]!.name === variableName &&
      compareExact(lower, rational(0n)) >= 0
    );
  return provenContinuous(expression.args[0]!, variableName, lower, upper);
}

function decimal(value: ExactNumber, digits: number): string {
  const [rawNumerator, denominator] = parts(value);
  const negative = rawNumerator < 0n;
  const numerator = negative ? -rawNumerator : rawNumerator;
  const scale = 10n ** BigInt(digits);
  let quotient = (numerator * scale) / denominator;
  const remainder = (numerator * scale) % denominator;
  if (remainder * 2n >= denominator) quotient++;
  const whole = quotient / scale;
  const fraction = (quotient % scale).toString().padStart(digits, "0");
  return `${negative ? "-" : ""}${whole.toString()}${digits > 0 ? `.${fraction}` : ""}`;
}

export function numericalIntegrate(
  expression: Expression,
  variableName: string,
  lowerInput: ExactNumber,
  upperInput: ExactNumber,
  options: QuadratureOptions = {},
): QuadratureResult {
  const digits = options.precisionDigits ?? 30;
  const maximum = options.maxIterations ?? 20;
  const maxTerms = options.maxSeriesTerms ?? Math.max(80, digits * 4);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(variableName))
    return { kind: "unsupported", reason: "Quadrature variable is invalid" };
  if (!Number.isInteger(digits) || digits < 1 || digits > 200)
    return { kind: "unsupported", reason: "precisionDigits must be an integer from 1 to 200" };
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 30)
    return { kind: "unsupported", reason: "maxIterations must be an integer from 1 to 30" };
  if (!Number.isInteger(maxTerms) || maxTerms < 1 || maxTerms > 10_000)
    return { kind: "unsupported", reason: "maxSeriesTerms is out of range" };

  let lower = lowerInput;
  let upper = upperInput;
  let orientation: 1 | -1 = 1;
  if (compareExact(lower, upper) > 0) {
    [lower, upper] = [upper, lower];
    orientation = -1;
  }
  if (!provenContinuous(expression, variableName, lower, upper))
    return { kind: "unsupported", reason: "Continuity on the integration interval is not proven" };

  const exact = integrate(expression, variableName, { lower, upper });
  if (exact.kind === "definite" && isExactNumber(exact.value)) {
    const value = orientation === 1 ? exact.value : negateExact(exact.value);
    return {
      kind: "complete",
      value: decimal(value, digits),
      errorBound: decimal(rational(0n), digits),
      precisionDigits: digits,
      converged: true,
      evaluations: 0,
      iterations: 0,
      method: "exact-symbolic-fallback",
    };
  }

  const tolerance = rational(1n, 10n ** BigInt(digits + 2));
  const context: PrecisionContext = {
    epsilon: rational(1n, 10n ** BigInt(digits + 12)),
    maxTerms,
  };
  let evaluations = 0;
  const evaluateAt = (point: ExactNumber): ExactNumber => {
    evaluations++;
    return evaluatePrecise(expression, variableName, point, context);
  };

  try {
    const width = subtractExact(upper, lower);
    const first = multiplyExact(
      divideExact(width, rational(2n)),
      addExact(evaluateAt(lower), evaluateAt(upper)),
    );
    let previousRow: ExactNumber[] = [first];
    let previousDiagonal = first;
    for (let level = 1; level <= maximum; level++) {
      const panels = 2n ** BigInt(level);
      const step = divideExact(width, rational(panels));
      let sum = rational(0n);
      const newPoints = 2 ** (level - 1);
      for (let index = 1; index <= newPoints; index++) {
        const point = addExact(lower, multiplyExact(rational(BigInt(2 * index - 1)), step));
        sum = addExact(sum, evaluateAt(point));
      }
      const row: ExactNumber[] = [
        addExact(divideExact(previousRow[0]!, rational(2n)), multiplyExact(step, sum)),
      ];
      for (let column = 1; column <= level; column++) {
        const factor = 4n ** BigInt(column) - 1n;
        row[column] = addExact(
          row[column - 1]!,
          divideExact(subtractExact(row[column - 1]!, previousRow[column - 1]!), rational(factor)),
        );
      }
      const diagonal = row[level]!;
      const error = absolute(subtractExact(diagonal, previousDiagonal));
      if (compareExact(error, tolerance) <= 0) {
        const value = orientation === 1 ? diagonal : negateExact(diagonal);
        const seriesAllowance = multiplyExact(context.epsilon, rational(BigInt(evaluations)));
        return {
          kind: "complete",
          value: decimal(value, digits),
          errorBound: decimal(addExact(error, seriesAllowance), digits + 2),
          precisionDigits: digits,
          converged: true,
          evaluations,
          iterations: level,
          method: "romberg-arbitrary-precision",
        };
      }
      previousRow = row;
      previousDiagonal = diagonal;
    }
    throw new IterationBudgetError("Romberg iteration budget exceeded");
  } catch (caught) {
    if (caught instanceof SeriesBudgetError)
      return {
        kind: "incomplete",
        reason: "series-budget-exceeded",
        precisionDigits: digits,
        converged: false,
        evaluations,
        iterations: 0,
      };
    if (caught instanceof IterationBudgetError)
      return {
        kind: "incomplete",
        reason: "iteration-budget-exceeded",
        precisionDigits: digits,
        converged: false,
        evaluations,
        iterations: maximum,
      };
    return {
      kind: "unsupported",
      reason: "Integrand could not be evaluated safely on the interval",
    };
  }
}
