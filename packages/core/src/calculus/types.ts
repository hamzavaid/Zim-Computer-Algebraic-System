import { Expression } from "../ast/types";

export interface CalculusBudget {
  readonly maxOrder?: number;
  readonly maxNodes?: number;
}

export type DifferentiationResult =
  | {
      readonly kind: "complete";
      readonly expression: Expression;
      readonly variables: readonly string[];
      readonly order: number;
      readonly exact: true;
      readonly conditions: readonly string[];
    }
  | { readonly kind: "unsupported"; readonly reason: string }
  | {
      readonly kind: "incomplete";
      readonly reason: "order-budget-exceeded" | "node-budget-exceeded";
    };

export interface DifferentiationRuleDescriptor {
  readonly id: string;
  readonly family: "arithmetic" | "power" | "elementary-function";
  readonly description: string;
}
