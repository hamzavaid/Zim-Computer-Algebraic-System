import { Expression } from "../ast/types";
import { mapExpression } from "./traverse";

export function substitute(
  expression: Expression,
  name: string,
  replacement: Expression,
): Expression {
  return mapExpression(expression, (node) =>
    node.kind === "variable" && node.name === name ? replacement : node,
  );
}

export function cloneExpression(expression: Expression): Expression {
  return mapExpression(expression, (node) => ({ ...node }) as Expression);
}
