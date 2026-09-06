import { Expression } from "../ast/types";
import { coefficientMap, polynomialToExpression } from "../algebra/polynomial";
import { normalizeExpression } from "../normalize/normalize";
import { visitExpression } from "../visitors/traverse";
import { RewriteRule } from "./RewriteRule";

function singleVariable(expression: Expression): string | undefined {
  const variables = new Set<string>();
  visitExpression(expression, (node) => {
    if (node.kind === "variable") variables.add(node.name);
  });
  return variables.size === 1 ? [...variables][0] : undefined;
}

export const likeTermRule: RewriteRule = {
  name: "combine-like-terms",
  apply(expression) {
    if (expression.kind !== "binary") return undefined;
    const variableName = singleVariable(expression);
    if (!variableName) return undefined;
    const result = coefficientMap(expression, variableName);
    return result.kind === "polynomial"
      ? normalizeExpression(polynomialToExpression(result.polynomial))
      : undefined;
  },
};
