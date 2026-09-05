import { isExactNumber, negateExact } from "../ast/rational";
import { binary, Expression, SyntaxTree, unary } from "../ast/types";
import { canonicalKey } from "../format/formatter";

function flatten(expression: Expression, operator: "+" | "*"): Expression[] {
  return expression.kind === "binary" && expression.operator === operator
    ? [...flatten(expression.left, operator), ...flatten(expression.right, operator)]
    : [expression];
}

function rebuild(operator: "+" | "*", values: readonly Expression[]): Expression {
  if (values.length === 0) throw new Error("Cannot rebuild an empty associative expression");
  return values.slice(1).reduce((left, right) => binary(operator, left, right), values[0]!);
}

function rank(expression: Expression): number {
  if (isExactNumber(expression)) return 0;
  if (expression.kind === "variable") return 1;
  if (expression.kind === "function") return 2;
  if (expression.kind === "binary" && expression.operator === "^") return 3;
  if (expression.kind === "binary") return 4;
  return 5;
}

function compareExpressions(a: Expression, b: Expression): number {
  const rankDifference = rank(a) - rank(b);
  return rankDifference || canonicalKey(a).localeCompare(canonicalKey(b), "en");
}

export function normalizeExpression(expression: Expression): Expression {
  if (
    expression.kind === "constant" ||
    expression.kind === "rational" ||
    expression.kind === "variable"
  )
    return expression;
  if (expression.kind === "function")
    return { ...expression, args: expression.args.map(normalizeExpression) };
  if (expression.kind === "unary") {
    const operand = normalizeExpression(expression.operand);
    if (expression.operator === "+") return operand;
    if (isExactNumber(operand)) return negateExact(operand);
    if (operand.kind === "unary" && operand.operator === "-") return operand.operand;
    return unary("-", operand);
  }

  const left = normalizeExpression(expression.left);
  const right = normalizeExpression(expression.right);
  if (expression.operator === "-") return normalizeExpression(binary("+", left, unary("-", right)));
  if (expression.operator !== "+" && expression.operator !== "*")
    return binary(expression.operator, left, right);

  let values = [...flatten(left, expression.operator), ...flatten(right, expression.operator)];
  if (expression.operator === "*") {
    let negative = false;
    values = values.map((value) => {
      if (value.kind === "unary" && value.operator === "-") {
        negative = !negative;
        return value.operand;
      }
      return value;
    });
    values.sort(compareExpressions);
    const product = rebuild("*", values);
    return negative ? unary("-", product) : product;
  }
  values.sort(compareExpressions);
  return rebuild("+", values);
}

export function normalize(tree: SyntaxTree): SyntaxTree {
  return tree.kind === "equation"
    ? {
        kind: "equation",
        left: normalizeExpression(tree.left),
        right: normalizeExpression(tree.right),
      }
    : normalizeExpression(tree);
}
