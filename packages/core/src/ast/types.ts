export type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "^";
export type UnaryOperator = "+" | "-";

export interface Constant {
  readonly kind: "constant";
  readonly value: bigint;
}

export interface Rational {
  readonly kind: "rational";
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export interface Variable {
  readonly kind: "variable";
  readonly name: string;
}

export interface UnaryExpression {
  readonly kind: "unary";
  readonly operator: UnaryOperator;
  readonly operand: Expression;
}

export interface BinaryExpression {
  readonly kind: "binary";
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

export interface FunctionExpression {
  readonly kind: "function";
  readonly name: string;
  readonly args: readonly Expression[];
}

export type Expression =
  Constant | Rational | Variable | UnaryExpression | BinaryExpression | FunctionExpression;

export interface Equation {
  readonly kind: "equation";
  readonly left: Expression;
  readonly right: Expression;
}

export type SyntaxTree = Expression | Equation;

export const constant = (value: bigint | number): Constant => ({
  kind: "constant",
  value: typeof value === "bigint" ? value : BigInt(value),
});

export const variable = (name: string): Variable => ({ kind: "variable", name });

export const unary = (operator: UnaryOperator, operand: Expression): UnaryExpression => ({
  kind: "unary",
  operator,
  operand,
});

export const binary = (
  operator: BinaryOperator,
  left: Expression,
  right: Expression,
): BinaryExpression => ({ kind: "binary", operator, left, right });

export const func = (name: string, args: readonly Expression[]): FunctionExpression => ({
  kind: "function",
  name,
  args: [...args],
});

export const equation = (left: Expression, right: Expression): Equation => ({
  kind: "equation",
  left,
  right,
});
