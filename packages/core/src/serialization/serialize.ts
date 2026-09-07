import { Expression, SyntaxTree } from "../ast/types";
import { SolveResult } from "../solve/SolveResult";
import { SystemSolveResult } from "../solve/systemSolver";

export type SerializedExpression =
  | { readonly kind: "constant"; readonly value: string }
  | { readonly kind: "rational"; readonly numerator: string; readonly denominator: string }
  | { readonly kind: "variable"; readonly name: string }
  | { readonly kind: "unary"; readonly operator: string; readonly operand: SerializedExpression }
  | {
      readonly kind: "binary";
      readonly operator: string;
      readonly left: SerializedExpression;
      readonly right: SerializedExpression;
    }
  | {
      readonly kind: "function";
      readonly name: string;
      readonly args: readonly SerializedExpression[];
    };

export interface SerializedEquation {
  readonly kind: "equation";
  readonly left: SerializedExpression;
  readonly right: SerializedExpression;
}

export type SerializedSyntaxTree = SerializedExpression | SerializedEquation;

export function serializeExpression(expression: Expression): SerializedExpression {
  switch (expression.kind) {
    case "constant":
      return { kind: "constant", value: expression.value.toString() };
    case "rational":
      return {
        kind: "rational",
        numerator: expression.numerator.toString(),
        denominator: expression.denominator.toString(),
      };
    case "variable":
      return { kind: "variable", name: expression.name };
    case "unary":
      return {
        kind: "unary",
        operator: expression.operator,
        operand: serializeExpression(expression.operand),
      };
    case "binary":
      return {
        kind: "binary",
        operator: expression.operator,
        left: serializeExpression(expression.left),
        right: serializeExpression(expression.right),
      };
    case "function":
      return {
        kind: "function",
        name: expression.name,
        args: expression.args.map(serializeExpression),
      };
  }
}

export function serializeSyntaxTree(tree: SyntaxTree): SerializedSyntaxTree {
  return tree.kind === "equation"
    ? {
        kind: "equation",
        left: serializeExpression(tree.left),
        right: serializeExpression(tree.right),
      }
    : serializeExpression(tree);
}

export type SerializedSolveResult =
  | {
      readonly kind: "solution";
      readonly variable: string;
      readonly value: SerializedExpression;
      readonly verified: true;
    }
  | {
      readonly kind: "multiple-solutions";
      readonly variable: string;
      readonly values: readonly SerializedExpression[];
      readonly verified: true;
    }
  | { readonly kind: "no-solution" }
  | { readonly kind: "identity" }
  | { readonly kind: "unsupported"; readonly reason: string };

export function serializeSolveResult(result: SolveResult): SerializedSolveResult {
  if (result.kind === "solution") {
    return { ...result, value: serializeExpression(result.value) };
  }
  if (result.kind === "multiple-solutions") {
    return { ...result, values: result.values.map(serializeExpression) };
  }
  return result;
}

export type SerializedSystemSolveResult =
  | {
      readonly kind: "unique";
      readonly solution: Readonly<Record<string, SerializedExpression>>;
      readonly verified: true;
    }
  | { readonly kind: "infinite"; readonly verified: true }
  | { readonly kind: "no-solution"; readonly verified: true }
  | { readonly kind: "unsupported"; readonly reason: string };

export function serializeSystemSolveResult(result: SystemSolveResult): SerializedSystemSolveResult {
  if (result.kind !== "unique") return result;
  return {
    ...result,
    solution: Object.fromEntries(
      Object.entries(result.solution).map(([name, value]) => [name, serializeExpression(value)]),
    ),
  };
}
