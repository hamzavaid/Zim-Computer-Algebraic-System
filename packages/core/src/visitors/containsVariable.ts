import { Expression } from "../ast/types";

export function containsVariable(expression: Expression, name: string): boolean {
  switch (expression.kind) {
    case "constant":
    case "rational":
      return false;
    case "variable":
      return expression.name === name;
    case "unary":
      return containsVariable(expression.operand, name);
    case "binary":
      return containsVariable(expression.left, name) || containsVariable(expression.right, name);
    case "function":
      return expression.args.some((arg) => containsVariable(arg, name));
  }
}
