import { isExactNumber, isOne, isZero } from "../ast/rational";
import { constant } from "../ast/types";
import { RewriteRule } from "./RewriteRule";

export const powerRule: RewriteRule = {
  name: "power-identities",
  apply(expression, context) {
    if (
      expression.kind !== "binary" ||
      expression.operator !== "^" ||
      !isExactNumber(expression.right)
    )
      return undefined;
    if (isOne(expression.right)) return expression.left;
    if (isZero(expression.right)) {
      if (isExactNumber(expression.left) && !isZero(expression.left)) return constant(1n);
      if (expression.left.kind === "variable" && context.nonZeroVariables.has(expression.left.name))
        return constant(1n);
    }
    if (isExactNumber(expression.left) && isOne(expression.left)) return constant(1n);
    return undefined;
  },
};
