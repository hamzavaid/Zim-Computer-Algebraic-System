import { isExactNumber, isOne, isZero, rational } from "../ast/rational";
import { binary, constant, Expression, func, unary } from "../ast/types";
import { format } from "../format/formatter";
import { simplifyExpression } from "../simplify/simplify";
import { CalculusBudget, DifferentiationResult } from "./types";

type StepResult =
  | {
      readonly kind: "complete";
      readonly expression: Expression;
      readonly conditions: readonly string[];
    }
  | { readonly kind: "unsupported"; readonly reason: string };

const complete = (expression: Expression, conditions: readonly string[] = []): StepResult => ({
  kind: "complete",
  expression,
  conditions,
});

function merge(...values: readonly string[][]): string[] {
  return [...new Set(values.flat())];
}

function product(left: Expression, right: Expression): Expression {
  if (isExactNumber(left) && isZero(left)) return left;
  if (isExactNumber(right) && isZero(right)) return right;
  if (isExactNumber(left) && isOne(left)) return right;
  if (isExactNumber(right) && isOne(right)) return left;
  return binary("*", left, right);
}

function sum(left: Expression, right: Expression): Expression {
  if (isExactNumber(left) && isZero(left)) return right;
  if (isExactNumber(right) && isZero(right)) return left;
  return binary("+", left, right);
}

function derivative(expression: Expression, variableName: string): StepResult {
  if (isExactNumber(expression)) return complete(constant(0n));
  if (expression.kind === "variable")
    return complete(constant(expression.name === variableName ? 1n : 0n));
  if (expression.kind === "unary") {
    const operand = derivative(expression.operand, variableName);
    if (operand.kind === "unsupported" || expression.operator === "+") return operand;
    return complete(unary("-", operand.expression), operand.conditions);
  }
  if (expression.kind === "binary") {
    const left = derivative(expression.left, variableName);
    if (left.kind === "unsupported") return left;
    const right = derivative(expression.right, variableName);
    if (right.kind === "unsupported") return right;
    const conditions = merge([...left.conditions], [...right.conditions]);
    if (expression.operator === "+" || expression.operator === "-")
      return complete(binary(expression.operator, left.expression, right.expression), conditions);
    if (expression.operator === "*")
      return complete(
        sum(product(left.expression, expression.right), product(expression.left, right.expression)),
        conditions,
      );
    if (expression.operator === "/") {
      const numerator = binary(
        "-",
        product(left.expression, expression.right),
        product(expression.left, right.expression),
      );
      return complete(binary("/", numerator, binary("^", expression.right, constant(2n))), [
        ...conditions,
        `${format(expression.right)} != 0`,
      ]);
    }
    if (expression.operator === "^") {
      if (isExactNumber(expression.right)) {
        if (isZero(expression.right))
          return complete(constant(0n), [...conditions, `${format(expression.left)} != 0`]);
        const exponentMinusOne =
          expression.right.kind === "constant"
            ? constant(expression.right.value - 1n)
            : rational(
                expression.right.numerator - expression.right.denominator,
                expression.right.denominator,
              );
        return complete(
          product(
            product(expression.right, binary("^", expression.left, exponentMinusOne)),
            left.expression,
          ),
          conditions,
        );
      }
      return complete(
        product(
          expression,
          sum(
            product(right.expression, func("ln", [expression.left])),
            product(expression.right, binary("/", left.expression, expression.left)),
          ),
        ),
        [...conditions, `${format(expression.left)} > 0`],
      );
    }
    return { kind: "unsupported", reason: `No derivative rule for '${expression.operator}'` };
  }
  if (expression.args.length !== 1)
    return {
      kind: "unsupported",
      reason: `No derivative rule for ${expression.name}/${expression.args.length}`,
    };
  const argument = expression.args[0]!;
  const inner = derivative(argument, variableName);
  if (inner.kind === "unsupported") return inner;
  if (isExactNumber(inner.expression) && isZero(inner.expression)) return inner;
  const conditions = [...inner.conditions];
  let outer: Expression;
  if (expression.name === "sin") outer = func("cos", [argument]);
  else if (expression.name === "cos") outer = unary("-", func("sin", [argument]));
  else if (expression.name === "tan")
    outer = binary("/", constant(1n), binary("^", func("cos", [argument]), constant(2n)));
  else if (expression.name === "exp") outer = expression;
  else if (expression.name === "ln" || expression.name === "log") {
    outer = binary("/", constant(1n), argument);
    conditions.push(`${format(argument)} > 0`);
  } else if (expression.name === "sqrt") {
    outer = binary("/", constant(1n), product(constant(2n), expression));
    conditions.push(`${format(argument)} > 0`);
  } else if (expression.name === "cbrt") {
    outer = binary("/", constant(1n), product(constant(3n), binary("^", expression, constant(2n))));
  } else
    return { kind: "unsupported", reason: `No derivative rule for function '${expression.name}'` };
  return complete(product(outer, inner.expression), conditions);
}

function nodeCount(expression: Expression): number {
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

export function differentiate(
  expression: Expression,
  variables: readonly string[],
  budget: CalculusBudget = {},
): DifferentiationResult {
  if (variables.length === 0 || variables.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)))
    return { kind: "unsupported", reason: "Differentiation requires valid ordered variables" };
  if (variables.length > (budget.maxOrder ?? 32))
    return { kind: "incomplete", reason: "order-budget-exceeded" };
  let current = expression;
  const conditions: string[] = [];
  for (const variableName of variables) {
    const result = derivative(current, variableName);
    if (result.kind === "unsupported") return result;
    current = simplifyExpression(result.expression).expression;
    conditions.push(...result.conditions);
    if (nodeCount(current) > (budget.maxNodes ?? 10_000))
      return { kind: "incomplete", reason: "node-budget-exceeded" };
  }
  return {
    kind: "complete",
    expression: current,
    variables: [...variables],
    order: variables.length,
    exact: true,
    conditions: [...new Set(conditions)],
  };
}
