import { coefficient, coefficientMap, degree } from "../algebra/polynomial";
import {
  compareExact,
  ExactNumber,
  exactEquals,
  isExactNumber,
  isZero,
  negateExact,
  powerExact,
  rational,
} from "../ast/rational";
import {
  binary,
  constant,
  equation,
  Equation,
  Expression,
  func,
  unary,
  variable,
} from "../ast/types";
import { simplifyExpression } from "../simplify/simplify";
import { containsVariable } from "../visitors/containsVariable";
import { evaluate } from "../visitors/evaluate";
import { SolveDomain } from "./SolveOptions";
import { SolveResult } from "./SolveResult";

type AlgebraicSolver = (
  equation: Equation,
  variableName: string,
  domain: SolveDomain,
) => SolveResult;

function exactConstant(expression: Expression): ExactNumber | undefined {
  if (isExactNumber(expression)) return expression;
  if (
    expression.kind === "unary" &&
    expression.operator === "-" &&
    isExactNumber(expression.operand)
  ) {
    return negateExact(expression.operand);
  }
  return undefined;
}

function values(result: SolveResult): Expression[] | undefined {
  if (result.kind === "solution") return [result.value];
  if (result.kind === "multiple-solutions") return [...result.values];
  if (result.kind === "no-solution") return [];
  return undefined;
}

function asResult(variableName: string, roots: readonly Expression[]): SolveResult {
  if (roots.length === 0) return { kind: "no-solution" };
  if (roots.length === 1)
    return { kind: "solution", variable: variableName, value: roots[0]!, verified: true };
  return { kind: "multiple-solutions", variable: variableName, values: roots, verified: true };
}

function exactKnownFunction(name: string, argument: Expression): Expression {
  if (isExactNumber(argument)) {
    if (name === "exp" && isZero(argument)) return constant(1n);
    if ((name === "ln" || name === "log") && exactEquals(argument, rational(1n)))
      return constant(0n);
  }
  return func(name, [argument]);
}

function isolateAffine(
  expression: Expression,
  target: Expression,
  variableName: string,
): SolveResult | undefined {
  const converted = coefficientMap(expression, variableName);
  if (converted.kind === "unsupported" || (degree(converted.polynomial) ?? 0) > 1) return undefined;
  const slope = coefficient(converted.polynomial, 1);
  if (isZero(slope)) return undefined;
  const intercept = coefficient(converted.polynomial, 0);
  const numerator = isZero(intercept) ? target : binary("-", target, intercept);
  const root = simplifyExpression(binary("/", numerator, slope)).expression;
  return asResult(variableName, [root]);
}

function integerLog(base: Expression, result: Expression): Expression | undefined {
  if (!isExactNumber(base) || !isExactNumber(result)) return undefined;
  for (let denominator = 1; denominator <= 16; denominator++) {
    for (let numerator = -32; numerator <= 32; numerator++) {
      try {
        if (
          exactEquals(powerExact(base, BigInt(numerator)), powerExact(result, BigInt(denominator)))
        ) {
          return rational(BigInt(numerator), BigInt(denominator));
        }
      } catch {
        // Invalid powers such as zero to a negative exponent are not candidates.
      }
    }
  }
  return undefined;
}

function filterNumericSolutions(
  result: SolveResult,
  source: Equation,
  variableName: string,
): SolveResult {
  const roots = values(result);
  if (roots === undefined) return result;
  const kept = roots.filter((root) => {
    try {
      const numeric = evaluate(root);
      const left = evaluate(source.left, { [variableName]: numeric });
      const right = evaluate(source.right, { [variableName]: numeric });
      return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 1e-8;
    } catch {
      return true;
    }
  });
  return asResult(variableName, kept);
}

function logarithmTerm(
  expression: Expression,
): { coefficient: Expression; argument: Expression } | undefined {
  if (
    expression.kind === "function" &&
    ["ln", "log"].includes(expression.name) &&
    expression.args.length === 1
  )
    return { coefficient: constant(1n), argument: expression.args[0]! };
  if (
    expression.kind === "binary" &&
    expression.operator === "*" &&
    isExactNumber(expression.left) &&
    expression.right.kind === "function" &&
    ["ln", "log"].includes(expression.right.name) &&
    expression.right.args.length === 1
  ) {
    return { coefficient: expression.left, argument: expression.right.args[0]! };
  }
  return undefined;
}

export function containsTranscendental(expression: Expression, variableName: string): boolean {
  if (expression.kind === "function") {
    return expression.args.some((argument) => containsVariable(argument, variableName));
  }
  if (expression.kind === "binary") {
    return (
      (expression.operator === "^" && containsVariable(expression.right, variableName)) ||
      containsTranscendental(expression.left, variableName) ||
      containsTranscendental(expression.right, variableName)
    );
  }
  if (expression.kind === "unary") return containsTranscendental(expression.operand, variableName);
  return false;
}

export function solveTranscendentalEquation(
  source: Equation,
  variableName: string,
  domain: SolveDomain,
  solveAlgebraic: AlgebraicSolver,
): SolveResult {
  const { left, right } = source;

  if (
    left.kind === "binary" &&
    left.operator === "^" &&
    !containsVariable(left.left, variableName) &&
    containsVariable(left.right, variableName) &&
    !containsVariable(right, variableName)
  ) {
    const base = exactConstant(left.left);
    const rightConstant = exactConstant(right);
    if (domain === "real" && base) {
      if (compareExact(base, rational(0n)) <= 0) {
        return { kind: "unsupported", reason: "A real exponential base must be positive" };
      }
      if (exactEquals(base, rational(1n))) {
        return rightConstant && exactEquals(rightConstant, rational(1n))
          ? { kind: "identity" }
          : { kind: "no-solution" };
      }
    }
    if (domain === "real" && rightConstant && compareExact(rightConstant, rational(0n)) <= 0) {
      return { kind: "no-solution" };
    }
    const target =
      integerLog(left.left, right) ??
      binary("/", exactKnownFunction("ln", right), exactKnownFunction("ln", left.left));
    return (
      isolateAffine(left.right, target, variableName) ?? {
        kind: "unsupported",
        reason: "The exponential exponent is not affine",
      }
    );
  }

  if (left.kind === "function" && left.name === "exp" && left.args.length === 1) {
    if (right.kind === "function" && right.name === "exp" && right.args.length === 1) {
      return solveAlgebraic(equation(left.args[0]!, right.args[0]!), variableName, domain);
    }
    const rightConstant = exactConstant(right);
    if (domain === "real" && rightConstant && compareExact(rightConstant, rational(0n)) <= 0) {
      return { kind: "no-solution" };
    }
    const target = exactKnownFunction("ln", right);
    return (
      isolateAffine(left.args[0]!, target, variableName) ?? {
        kind: "unsupported",
        reason: "The exponential argument is not affine",
      }
    );
  }

  const singleLog = logarithmTerm(left);
  if (singleLog && !containsVariable(right, variableName)) {
    if (isExactNumber(singleLog.coefficient) && isZero(singleLog.coefficient)) {
      return {
        kind: "unsupported",
        reason: "A zero logarithm coefficient loses domain information",
      };
    }
    const exponent = simplifyExpression(binary("/", right, singleLog.coefficient)).expression;
    if (
      singleLog.argument.kind === "binary" &&
      singleLog.argument.operator === "^" &&
      singleLog.argument.left.kind === "variable" &&
      singleLog.argument.left.name === variableName &&
      isExactNumber(singleLog.argument.right) &&
      singleLog.argument.right.kind === "constant"
    ) {
      const power = Number(singleLog.argument.right.value);
      const divided = simplifyExpression(binary("/", exponent, constant(power))).expression;
      const positive = exactKnownFunction("exp", divided);
      return power % 2 === 0
        ? asResult(variableName, [unary("-", positive), positive])
        : asResult(variableName, [positive]);
    }
    const target = exactKnownFunction("exp", exponent);
    return (
      isolateAffine(singleLog.argument, target, variableName) ?? {
        kind: "unsupported",
        reason: "The logarithm argument is not affine",
      }
    );
  }

  if (
    left.kind === "binary" &&
    left.operator === "+" &&
    logarithmTerm(left.left) &&
    logarithmTerm(left.right) &&
    !containsVariable(right, variableName)
  ) {
    const first = logarithmTerm(left.left)!;
    const second = logarithmTerm(left.right)!;
    if (isExactNumber(first.coefficient) && isExactNumber(second.coefficient)) {
      const product = binary("*", first.argument, second.argument);
      const transformed = equation(product, exactKnownFunction("exp", right));
      return filterNumericSolutions(
        solveAlgebraic(transformed, variableName, domain),
        source,
        variableName,
      );
    }
  }

  if (left.kind === "function" && left.name === "sqrt" && left.args.length === 1) {
    const rightConstant = exactConstant(right);
    if (domain === "real" && rightConstant && compareExact(rightConstant, rational(0n)) < 0) {
      return { kind: "no-solution" };
    }
    const transformed = equation(left.args[0]!, binary("^", right, constant(2n)));
    return filterNumericSolutions(
      solveAlgebraic(transformed, variableName, domain),
      source,
      variableName,
    );
  }

  if (
    left.kind === "function" &&
    left.args.length === 1 &&
    left.args[0]!.kind === "variable" &&
    left.args[0]!.name === variableName
  ) {
    if (left.name === "sin" && isExactNumber(right) && isZero(right)) {
      return asResult(variableName, [binary("*", variable("k"), variable("pi"))]);
    }
    if (left.name === "cos" && isExactNumber(right) && exactEquals(right, rational(1n))) {
      return asResult(variableName, [
        binary("*", binary("*", constant(2n), variable("k")), variable("pi")),
      ]);
    }
    if (left.name === "tan" && isExactNumber(right) && exactEquals(right, rational(1n))) {
      return asResult(variableName, [
        binary(
          "+",
          binary("/", variable("pi"), constant(4n)),
          binary("*", variable("k"), variable("pi")),
        ),
      ]);
    }
  }

  if (
    left.kind === "binary" &&
    left.operator === "*" &&
    left.left.kind === "variable" &&
    left.left.name === variableName &&
    left.right.kind === "function" &&
    left.right.name === "exp" &&
    left.right.args.length === 1 &&
    left.right.args[0]!.kind === "variable" &&
    left.right.args[0]!.name === variableName &&
    !containsVariable(right, variableName)
  ) {
    return asResult(variableName, [func("LambertW", [right])]);
  }

  if (
    left.kind === "function" &&
    ["ln", "log"].includes(left.name) &&
    left.args.length === 1 &&
    left.args[0]!.kind === "variable" &&
    left.args[0]!.name === variableName &&
    right.kind === "variable" &&
    right.name === variableName &&
    domain === "real"
  ) {
    return { kind: "no-solution" };
  }

  return { kind: "unsupported", reason: "Transcendental equation form is not supported" };
}
