import {
  addExact,
  divideExact,
  isExactNumber,
  multiplyExact,
  parts,
  powerExact,
  rational,
  subtractExact,
} from "../ast/rational";
import { ZimError } from "../errors/ZimError";
import { RewriteRule } from "./RewriteRule";

export const constantFoldingRule: RewriteRule = {
  name: "constant-folding",
  apply(expression) {
    if (expression.kind === "unary" && isExactNumber(expression.operand)) {
      return expression.operator === "+"
        ? expression.operand
        : multiplyExact(rational(-1n), expression.operand);
    }
    if (
      expression.kind !== "binary" ||
      !isExactNumber(expression.left) ||
      !isExactNumber(expression.right)
    )
      return undefined;
    try {
      switch (expression.operator) {
        case "+":
          return addExact(expression.left, expression.right);
        case "-":
          return subtractExact(expression.left, expression.right);
        case "*":
          return multiplyExact(expression.left, expression.right);
        case "/":
          return divideExact(expression.left, expression.right);
        case "^": {
          const [exponent, denominator] = parts(expression.right);
          return denominator === 1n ? powerExact(expression.left, exponent) : undefined;
        }
        case "%": {
          const [left, leftDenominator] = parts(expression.left);
          const [right, rightDenominator] = parts(expression.right);
          if (leftDenominator !== 1n || rightDenominator !== 1n) return undefined;
          if (right === 0n) throw new RangeError("Modulo by zero");
          return rational(left % right);
        }
      }
    } catch (error) {
      throw new ZimError(
        "DOMAIN_ERROR",
        error instanceof Error ? error.message : "Invalid arithmetic operation",
      );
    }
  },
};
