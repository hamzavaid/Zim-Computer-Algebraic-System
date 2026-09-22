import {
  compareExact,
  ExactNumber,
  isExactNumber,
  isZero,
  rational,
  subtractExact,
} from "../ast/rational";
import { binary, constant, Expression, func, unary, variable } from "../ast/types";
import { format } from "../format/formatter";
import { simplifyExpression } from "../simplify/simplify";
import { containsVariable } from "../visitors/containsVariable";
import { expressionEquals } from "../visitors/equal";
import { evaluate } from "../visitors/evaluate";
import { differentiate } from "./differentiate";
import { limit } from "./limit";
import { IntegrationOptions, IntegrationResult } from "./types";

type Primitive = { readonly expression: Expression; readonly conditions: readonly string[] };

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

function merge(...values: readonly string[][]): string[] {
  return [...new Set(values.flat())];
}

function linearCoefficient(expression: Expression, variableName: string): ExactNumber | undefined {
  const result = differentiate(expression, [variableName]);
  return result.kind === "complete" &&
    isExactNumber(result.expression) &&
    !isZero(result.expression)
    ? result.expression
    : undefined;
}

function primitive(expression: Expression, variableName: string): Primitive | undefined {
  if (!containsVariable(expression, variableName))
    return { expression: binary("*", expression, variable(variableName)), conditions: [] };
  if (expression.kind === "variable")
    return {
      expression: binary("/", binary("^", expression, constant(2n)), constant(2n)),
      conditions: [],
    };
  if (expression.kind === "unary") {
    const operand = primitive(expression.operand, variableName);
    return operand
      ? {
          expression:
            expression.operator === "-" ? unary("-", operand.expression) : operand.expression,
          conditions: operand.conditions,
        }
      : undefined;
  }
  if (expression.kind === "binary") {
    if (expression.operator === "+" || expression.operator === "-") {
      const left = primitive(expression.left, variableName);
      const right = primitive(expression.right, variableName);
      return left && right
        ? {
            expression: binary(expression.operator, left.expression, right.expression),
            conditions: merge([...left.conditions], [...right.conditions]),
          }
        : undefined;
    }
    if (expression.operator === "*") {
      if (!containsVariable(expression.left, variableName)) {
        const right = primitive(expression.right, variableName);
        return right
          ? {
              expression: binary("*", expression.left, right.expression),
              conditions: right.conditions,
            }
          : undefined;
      }
      if (!containsVariable(expression.right, variableName)) {
        const left = primitive(expression.left, variableName);
        return left
          ? {
              expression: binary("*", expression.right, left.expression),
              conditions: left.conditions,
            }
          : undefined;
      }
      return undefined;
    }
    if (expression.operator === "/") {
      if (
        isExactNumber(expression.left) &&
        !containsVariable(expression.left, variableName) &&
        expression.right.kind === "variable" &&
        expression.right.name === variableName
      ) {
        return {
          expression: binary("*", expression.left, func("ln", [expression.right])),
          conditions: [`${variableName} > 0`],
        };
      }
      if (!containsVariable(expression.right, variableName)) {
        const numerator = primitive(expression.left, variableName);
        return numerator
          ? {
              expression: binary("/", numerator.expression, expression.right),
              conditions: [...numerator.conditions, "constant denominator != 0"],
            }
          : undefined;
      }
      return undefined;
    }
    if (
      expression.operator === "^" &&
      expression.left.kind === "variable" &&
      expression.left.name === variableName &&
      expression.right.kind === "constant"
    ) {
      if (expression.right.value === -1n)
        return { expression: func("ln", [expression.left]), conditions: [`${variableName} > 0`] };
      const next = expression.right.value + 1n;
      return {
        expression: binary("/", binary("^", expression.left, constant(next)), constant(next)),
        conditions: [],
      };
    }
    return undefined;
  }
  if (expression.kind !== "function" || expression.args.length !== 1) return undefined;
  const argument = expression.args[0]!;
  const coefficient = linearCoefficient(argument, variableName);
  if (coefficient === undefined) return undefined;
  if (expression.name === "exp")
    return { expression: binary("/", expression, coefficient), conditions: [] };
  if (expression.name === "sin")
    return {
      expression: binary("/", unary("-", func("cos", [argument])), coefficient),
      conditions: [],
    };
  if (expression.name === "cos")
    return { expression: binary("/", func("sin", [argument]), coefficient), conditions: [] };
  if (expression.name === "ln" || expression.name === "log")
    return {
      expression: binary(
        "/",
        binary("-", binary("*", argument, func("ln", [argument])), argument),
        coefficient,
      ),
      conditions: [`${format(argument)} > 0`],
    };
  return undefined;
}

function verifiedPrimitive(
  integrand: Expression,
  variableName: string,
  candidate: Expression,
): Expression | undefined {
  const derivative = differentiate(candidate, [variableName]);
  if (derivative.kind !== "complete") return undefined;
  const actual = simplifyExpression(derivative.expression).expression;
  const expected = simplifyExpression(integrand).expression;
  if (expressionEquals(actual, expected)) return simplifyExpression(candidate).expression;
  try {
    const matches = [0.5, 1.25, 2].every((value) => {
      const environment = { [variableName]: value };
      const left = evaluate(actual, environment);
      const right = evaluate(expected, environment);
      return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-10;
    });
    return matches ? simplifyExpression(candidate).expression : undefined;
  } catch {
    return undefined;
  }
}

function validConstantName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

export function integrate(
  integrand: Expression,
  variableName: string,
  options: IntegrationOptions = {},
): IntegrationResult {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(variableName))
    return { kind: "unsupported", reason: "Integration variable is invalid" };
  if ((options.lower === undefined) !== (options.upper === undefined))
    return { kind: "unsupported", reason: "Definite integration requires both bounds" };
  if (countNodes(integrand) > (options.maxNodes ?? 10_000))
    return { kind: "incomplete", reason: "node-budget-exceeded" };
  const found = primitive(integrand, variableName);
  if (!found)
    return {
      kind: "unevaluated",
      integrand,
      variable: variableName,
      reason: "No verified integration rule matched",
    };
  const antiderivative = verifiedPrimitive(integrand, variableName, found.expression);
  if (!antiderivative)
    return {
      kind: "unevaluated",
      integrand,
      variable: variableName,
      reason: "Candidate antiderivative did not verify by differentiation",
    };

  if (options.lower !== undefined && options.upper !== undefined) {
    if (!isExactNumber(options.lower) || !isExactNumber(options.upper))
      return { kind: "unsupported", reason: "Exact definite integration requires rational bounds" };
    if (
      found.conditions.length > 0 &&
      (compareExact(options.lower, rational(0n)) <= 0 ||
        compareExact(options.upper, rational(0n)) <= 0)
    )
      return { kind: "unsupported", reason: "Integration interval crosses an unsupported domain" };
    const lower = limit(antiderivative, variableName, options.lower);
    const upper = limit(antiderivative, variableName, options.upper);
    if (
      lower.kind !== "finite" ||
      upper.kind !== "finite" ||
      !isExactNumber(lower.value) ||
      !isExactNumber(upper.value)
    )
      return { kind: "unsupported", reason: "Definite bounds could not be evaluated exactly" };
    return {
      kind: "definite",
      value: subtractExact(upper.value, lower.value),
      variable: variableName,
      lower: options.lower,
      upper: options.upper,
      exact: true,
      verified: true,
      method: "symbolic-antiderivative",
    };
  }

  const constantName = options.constantName ?? "C";
  if (!validConstantName(constantName))
    return { kind: "unsupported", reason: "Integration constant name is invalid" };
  return {
    kind: "complete",
    expression: simplifyExpression(binary("+", antiderivative, variable(constantName))).expression,
    antiderivative,
    variable: variableName,
    constant: constantName,
    exact: true,
    verified: true,
    conditions: [...new Set(found.conditions)],
  };
}
