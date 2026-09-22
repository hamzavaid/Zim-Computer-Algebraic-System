import {
  addExact,
  divideExact,
  ExactNumber,
  isExactNumber,
  multiplyExact,
  negateExact,
  powerExact,
  subtractExact,
} from "../ast/rational";
import { Expression } from "../ast/types";

/** Evaluate rational arithmetic without losing small values or original-domain holes. */
export function evaluateRational(
  expression: Expression,
  environment: Readonly<Record<string, ExactNumber>> = {},
): ExactNumber | undefined {
  if (isExactNumber(expression)) return expression;
  if (expression.kind === "variable") return environment[expression.name];
  if (expression.kind === "function") return undefined;
  if (expression.kind === "unary") {
    const value = evaluateRational(expression.operand, environment);
    return value === undefined
      ? undefined
      : expression.operator === "-"
        ? negateExact(value)
        : value;
  }
  const left = evaluateRational(expression.left, environment);
  const right = evaluateRational(expression.right, environment);
  if (left === undefined || right === undefined) return undefined;
  switch (expression.operator) {
    case "+":
      return addExact(left, right);
    case "-":
      return subtractExact(left, right);
    case "*":
      return multiplyExact(left, right);
    case "/":
      return divideExact(left, right);
    case "^":
      return right.kind === "constant" && right.value >= -128n && right.value <= 128n
        ? powerExact(left, right.value)
        : undefined;
    default:
      return undefined;
  }
}

/** Conservative real totality proof; unknown functions/domains are never erased. */
export function isEverywhereDefined(expression: Expression): boolean {
  if (isExactNumber(expression) || expression.kind === "variable") return true;
  if (expression.kind === "unary") return isEverywhereDefined(expression.operand);
  if (expression.kind !== "binary") return false;
  if (["+", "-", "*"].includes(expression.operator))
    return isEverywhereDefined(expression.left) && isEverywhereDefined(expression.right);
  if (expression.operator === "^")
    return (
      expression.right.kind === "constant" &&
      expression.right.value > 0n &&
      isEverywhereDefined(expression.left)
    );
  if (expression.operator === "/")
    return (
      isExactNumber(expression.right) &&
      (expression.right.kind === "constant"
        ? expression.right.value
        : expression.right.numerator) !== 0n &&
      isEverywhereDefined(expression.left)
    );
  return false;
}
