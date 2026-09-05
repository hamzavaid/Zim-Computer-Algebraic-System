import { isExactNumber, isZero } from "../ast/rational";
import { constant } from "../ast/types";
import { expressionEquals } from "../visitors/equal";
import { RewriteRule } from "./RewriteRule";

export const safeCancellationRule: RewriteRule = {
  name: "safe-cancellation",
  apply(expression, context) {
    if (
      expression.kind !== "binary" ||
      expression.operator !== "/" ||
      !expressionEquals(expression.left, expression.right)
    )
      return undefined;
    if (isExactNumber(expression.left)) return isZero(expression.left) ? undefined : constant(1n);
    if (expression.left.kind === "variable" && context.nonZeroVariables.has(expression.left.name))
      return constant(1n);
    return undefined;
  },
};
