import { unary } from "../ast/types";
import { RewriteRule } from "./RewriteRule";

export const signRule: RewriteRule = {
  name: "sign-normalization",
  apply(expression) {
    if (expression.kind === "unary" && expression.operator === "+") return expression.operand;
    if (
      expression.kind === "unary" &&
      expression.operator === "-" &&
      expression.operand.kind === "unary" &&
      expression.operand.operator === "-"
    )
      return expression.operand.operand;
    if (
      expression.kind === "binary" &&
      expression.operator === "*" &&
      expression.left.kind === "unary" &&
      expression.left.operator === "-"
    ) {
      return unary("-", { ...expression, left: expression.left.operand });
    }
    return undefined;
  },
};
