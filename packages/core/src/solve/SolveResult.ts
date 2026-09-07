import { Expression } from "../ast/types";

export type SolveResult =
  | {
      readonly kind: "solution";
      readonly variable: string;
      readonly value: Expression;
      readonly verified: true;
    }
  | {
      readonly kind: "multiple-solutions";
      readonly variable: string;
      readonly values: readonly Expression[];
      readonly verified: true;
    }
  | { readonly kind: "no-solution" }
  | { readonly kind: "identity" }
  | { readonly kind: "unsupported"; readonly reason: string };
