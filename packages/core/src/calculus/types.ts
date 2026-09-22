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

export type LimitPoint = Expression | "infinity" | "-infinity";
export type LimitDirection = "both" | "left" | "right";

export type LimitResult =
  | {
      readonly kind: "finite";
      readonly value: Expression;
      readonly variable: string;
      readonly point: LimitPoint;
      readonly direction: LimitDirection;
      readonly exact: true;
      readonly method: string;
    }
  | {
      readonly kind: "infinite";
      readonly sign: 1 | -1;
      readonly variable: string;
      readonly point: LimitPoint;
      readonly direction: LimitDirection;
      readonly method: string;
    }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "incomplete"; readonly reason: "node-budget-exceeded" };

export interface LimitOptions extends CalculusBudget {
  readonly direction?: LimitDirection;
}

export interface IntegrationRuleDescriptor {
  readonly id: string;
  readonly family: "linearity" | "power" | "elementary-function";
  readonly description: string;
}

export interface IntegrationOptions extends CalculusBudget {
  readonly lower?: Expression;
  readonly upper?: Expression;
  readonly constantName?: string;
}

export type IntegrationResult =
  | {
      readonly kind: "complete";
      readonly expression: Expression;
      readonly antiderivative: Expression;
      readonly variable: string;
      readonly constant: string;
      readonly exact: true;
      readonly verified: true;
      readonly conditions: readonly string[];
    }
  | {
      readonly kind: "definite";
      readonly value: Expression;
      readonly variable: string;
      readonly lower: Expression;
      readonly upper: Expression;
      readonly exact: true;
      readonly verified: true;
      readonly method: "symbolic-antiderivative";
    }
  | {
      readonly kind: "unevaluated";
      readonly integrand: Expression;
      readonly variable: string;
      readonly reason: string;
    }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "incomplete"; readonly reason: "node-budget-exceeded" };

export interface QuadratureOptions {
  readonly precisionDigits?: number;
  readonly maxIterations?: number;
  readonly maxSeriesTerms?: number;
}

export type QuadratureResult =
  | {
      readonly kind: "complete";
      readonly value: string;
      readonly errorBound: string;
      readonly precisionDigits: number;
      readonly converged: true;
      readonly evaluations: number;
      readonly iterations: number;
      readonly method: "romberg-arbitrary-precision" | "exact-symbolic-fallback";
    }
  | {
      readonly kind: "incomplete";
      readonly reason: "iteration-budget-exceeded" | "series-budget-exceeded";
      readonly precisionDigits: number;
      readonly converged: false;
      readonly evaluations: number;
      readonly iterations: number;
    }
  | { readonly kind: "unsupported"; readonly reason: string };
