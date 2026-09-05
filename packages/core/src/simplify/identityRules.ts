import { isExactNumber, isOne, isZero } from "../ast/rational";
import { constant } from "../ast/types";
import { RewriteRule } from "./RewriteRule";

export const identityRule: RewriteRule = {
  name: "zero-one-identities",
  apply(expression) {
    if (expression.kind !== "binary") return undefined;
    const leftNumber = isExactNumber(expression.left);
    const rightNumber = isExactNumber(expression.right);
    if (expression.operator === "+") {
      if (leftNumber && isZero(expression.left)) return expression.right;
      if (rightNumber && isZero(expression.right)) return expression.left;
    }
    if (expression.operator === "*") {
      if ((leftNumber && isZero(expression.left)) || (rightNumber && isZero(expression.right)))
        return constant(0n);
      if (leftNumber && isOne(expression.left)) return expression.right;
      if (rightNumber && isOne(expression.right)) return expression.left;
    }
    if (expression.operator === "/" && rightNumber && isOne(expression.right))
      return expression.left;
    return undefined;
  },
};
