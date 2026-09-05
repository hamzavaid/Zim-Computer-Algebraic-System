import { Expression, SyntaxTree } from "../ast/types";

const precedence: Readonly<Record<string, number>> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  unary: 3,
  "^": 4,
  atom: 5,
};

function expressionPrecedence(expression: Expression): number {
  if (expression.kind === "binary") return precedence[expression.operator]!;
  if (expression.kind === "unary") return precedence.unary!;
  return precedence.atom!;
}

function formatExpression(expression: Expression, parent = 0, rightChild = false): string {
  let result: string;
  if (expression.kind === "constant") result = expression.value.toString();
  else if (expression.kind === "rational")
    result = `${expression.numerator}/${expression.denominator}`;
  else if (expression.kind === "variable") result = expression.name;
  else if (expression.kind === "function")
    result = `${expression.name}(${expression.args.map((arg) => formatExpression(arg)).join(", ")})`;
  else if (expression.kind === "unary")
    result = `${expression.operator}${formatExpression(expression.operand, precedence.unary)}`;
  else {
    const own = precedence[expression.operator]!;
    const left = formatExpression(expression.left, own);
    const rightNeedsExtra =
      expression.operator === "-" || expression.operator === "/" || expression.operator === "%";
    const right = formatExpression(expression.right, own + (rightNeedsExtra ? 1 : 0), true);
    result = `${left} ${expression.operator === "%" ? "mod" : expression.operator} ${right}`;
  }
  const own = expressionPrecedence(expression);
  return own < parent ||
    (rightChild && expression.kind === "binary" && own === parent && expression.operator !== "^")
    ? `(${result})`
    : result;
}

export function format(tree: SyntaxTree): string {
  return tree.kind === "equation"
    ? `${formatExpression(tree.left)} = ${formatExpression(tree.right)}`
    : formatExpression(tree);
}

export const canonicalKey = (expression: Expression): string => formatExpression(expression);
