import { Equation, Expression, SyntaxTree } from "../ast/types";

export type ExpressionVisitor = (expression: Expression) => void;

export function visitExpression(expression: Expression, visitor: ExpressionVisitor): void {
  visitor(expression);
  if (expression.kind === "unary") visitExpression(expression.operand, visitor);
  if (expression.kind === "binary") {
    visitExpression(expression.left, visitor);
    visitExpression(expression.right, visitor);
  }
  if (expression.kind === "function")
    expression.args.forEach((arg) => visitExpression(arg, visitor));
}

export function visit(tree: SyntaxTree, visitor: ExpressionVisitor): void {
  if (tree.kind === "equation") {
    visitExpression(tree.left, visitor);
    visitExpression(tree.right, visitor);
  } else visitExpression(tree, visitor);
}

export function mapExpression(
  expression: Expression,
  transform: (expression: Expression) => Expression,
): Expression {
  let rebuilt: Expression = expression;
  if (expression.kind === "unary") {
    rebuilt = { ...expression, operand: mapExpression(expression.operand, transform) };
  } else if (expression.kind === "binary") {
    rebuilt = {
      ...expression,
      left: mapExpression(expression.left, transform),
      right: mapExpression(expression.right, transform),
    };
  } else if (expression.kind === "function") {
    rebuilt = { ...expression, args: expression.args.map((arg) => mapExpression(arg, transform)) };
  }
  return transform(rebuilt);
}

export function mapTree(
  tree: SyntaxTree,
  transform: (expression: Expression) => Expression,
): SyntaxTree {
  if (tree.kind !== "equation") return mapExpression(tree, transform);
  const result: Equation = {
    kind: "equation",
    left: mapExpression(tree.left, transform),
    right: mapExpression(tree.right, transform),
  };
  return result;
}
