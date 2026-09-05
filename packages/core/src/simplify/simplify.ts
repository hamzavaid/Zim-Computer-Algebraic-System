import { Expression, SyntaxTree } from "../ast/types";
import { normalizeExpression } from "../normalize/normalize";
import { expressionEquals } from "../visitors/equal";
import { ZimError } from "../errors/ZimError";
import { constantFoldingRule } from "./arithmeticRules";
import { safeCancellationRule } from "./cancellationRules";
import { identityRule } from "./identityRules";
import { powerRule } from "./powerRules";
import { RewriteRule, SimplifyContext } from "./RewriteRule";
import { signRule } from "./signRules";

export interface SimplifyOptions {
  readonly debug?: boolean;
  readonly maxIterations?: number;
  readonly nonZeroVariables?: readonly string[];
}

export interface SimplifyStep {
  readonly rule: string;
  readonly before: Expression;
  readonly after: Expression;
}

export interface SimplifyResult<T extends SyntaxTree = SyntaxTree> {
  readonly expression: T;
  readonly steps: readonly SimplifyStep[];
}

export const defaultRules: readonly RewriteRule[] = [
  constantFoldingRule,
  identityRule,
  signRule,
  powerRule,
  safeCancellationRule,
];

function simplifyChildren(
  expression: Expression,
  run: (value: Expression) => Expression,
): Expression {
  if (expression.kind === "unary") return { ...expression, operand: run(expression.operand) };
  if (expression.kind === "binary")
    return { ...expression, left: run(expression.left), right: run(expression.right) };
  if (expression.kind === "function") return { ...expression, args: expression.args.map(run) };
  return expression;
}

export function simplifyExpression(
  expression: Expression,
  options: SimplifyOptions = {},
  rules: readonly RewriteRule[] = defaultRules,
): SimplifyResult<Expression> {
  const steps: SimplifyStep[] = [];
  const context: SimplifyContext = { nonZeroVariables: new Set(options.nonZeroVariables ?? []) };
  const limit = options.maxIterations ?? 100;

  const run = (input: Expression): Expression => {
    let current = normalizeExpression(simplifyChildren(input, run));
    for (let iteration = 0; iteration < limit; iteration++) {
      let changed = false;
      for (const rule of rules) {
        const next = rule.apply(current, context);
        if (next !== undefined && !expressionEquals(current, next)) {
          if (options.debug) steps.push({ rule: rule.name, before: current, after: next });
          current = normalizeExpression(simplifyChildren(next, run));
          changed = true;
          break;
        }
      }
      if (!changed) return current;
    }
    throw new ZimError("ITERATION_LIMIT", `Simplification exceeded ${limit} iterations`);
  };

  return { expression: run(expression), steps };
}

export function simplify(tree: SyntaxTree, options: SimplifyOptions = {}): SimplifyResult {
  if (tree.kind !== "equation") return simplifyExpression(tree, options);
  const left = simplifyExpression(tree.left, options);
  const right = simplifyExpression(tree.right, options);
  return {
    expression: { kind: "equation", left: left.expression, right: right.expression },
    steps: [...left.steps, ...right.steps],
  };
}
