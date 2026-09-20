import { Expression } from "../ast/types";

export type Domain = "real" | "complex" | "integer" | "natural";

export type Assumption =
  | { readonly kind: "domain"; readonly symbol: string; readonly domain: Domain }
  | { readonly kind: "nonzero"; readonly expression: Expression }
  | { readonly kind: "positive"; readonly expression: Expression }
  | { readonly kind: "negative"; readonly expression: Expression }
  | { readonly kind: "zero"; readonly expression: Expression }
  | {
      readonly kind: "interval";
      readonly symbol: string;
      readonly lower?: string;
      readonly upper?: string;
      readonly lowerOpen?: boolean;
      readonly upperOpen?: boolean;
    };

export interface AssumptionSet {
  readonly assumptions: readonly Assumption[];
  readonly satisfiable: boolean;
  readonly contradictions: readonly string[];
}
