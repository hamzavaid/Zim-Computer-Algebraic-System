import { Expression } from "../ast/types";

export interface SimplifyContext {
  readonly nonZeroVariables: ReadonlySet<string>;
}

export interface RewriteRule {
  readonly name: string;
  apply(expression: Expression, context: SimplifyContext): Expression | undefined;
}
