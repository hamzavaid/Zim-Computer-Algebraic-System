import { exactEquals, isExactNumber } from "../ast/rational";
import { Expression, SyntaxTree } from "../ast/types";

export function expressionEquals(a: Expression, b: Expression): boolean {
  if (isExactNumber(a) && isExactNumber(b)) return exactEquals(a, b);
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "constant":
      return a.value === (b as typeof a).value;
    case "rational":
      return (
        a.numerator === (b as typeof a).numerator && a.denominator === (b as typeof a).denominator
      );
    case "variable":
      return a.name === (b as typeof a).name;
    case "unary":
      return (
        a.operator === (b as typeof a).operator &&
        expressionEquals(a.operand, (b as typeof a).operand)
      );
    case "binary": {
      const other = b as typeof a;
      return (
        a.operator === other.operator &&
        expressionEquals(a.left, other.left) &&
        expressionEquals(a.right, other.right)
      );
    }
    case "function": {
      const other = b as typeof a;
      return (
        a.name === other.name &&
        a.args.length === other.args.length &&
        a.args.every((arg, index) => expressionEquals(arg, other.args[index]!))
      );
    }
  }
}

export function treeEquals(a: SyntaxTree, b: SyntaxTree): boolean {
  if (a.kind === "equation" || b.kind === "equation") {
    return (
      a.kind === "equation" &&
      b.kind === "equation" &&
      expressionEquals(a.left, b.left) &&
      expressionEquals(a.right, b.right)
    );
  }
  return expressionEquals(a, b);
}
