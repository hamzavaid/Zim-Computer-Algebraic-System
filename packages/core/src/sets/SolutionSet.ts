import { Expression } from "../ast/types";
import { format } from "../format/formatter";
import { serializeExpression, SerializedExpression } from "../serialization/serialize";

export type SetBound = Expression | "-infinity" | "infinity";

export type SolutionSet =
  | { readonly kind: "empty" }
  | { readonly kind: "universal"; readonly domain: "real" | "complex" | "integer" | "natural" }
  | { readonly kind: "finite"; readonly values: readonly Expression[] }
  | {
      readonly kind: "interval";
      readonly lower: SetBound;
      readonly upper: SetBound;
      readonly lowerInclusive: boolean;
      readonly upperInclusive: boolean;
    }
  | { readonly kind: "union"; readonly sets: readonly SolutionSet[] }
  | {
      readonly kind: "parameterized";
      readonly variable: string;
      readonly expression: Expression;
      readonly parameter: string;
      readonly parameterDomain: "integer";
    }
  | {
      readonly kind: "conditional";
      readonly set: SolutionSet;
      readonly conditions: readonly string[];
    };

function formatBound(bound: SetBound): string {
  if (bound === "-infinity") return "-∞";
  if (bound === "infinity") return "∞";
  return format(bound);
}

export function formatSolutionSet(set: SolutionSet): string {
  switch (set.kind) {
    case "empty":
      return "∅";
    case "universal":
      return { real: "ℝ", complex: "ℂ", integer: "ℤ", natural: "ℕ" }[set.domain];
    case "finite":
      return `{${set.values.map(format).join(", ")}}`;
    case "interval":
      return `${set.lowerInclusive ? "[" : "("}${formatBound(set.lower)}, ${formatBound(set.upper)}${set.upperInclusive ? "]" : ")"}`;
    case "union":
      return set.sets.map(formatSolutionSet).join(" ∪ ");
    case "parameterized":
      return `{${set.variable} = ${format(set.expression)} | ${set.parameter} ∈ ℤ}`;
    case "conditional":
      return `${formatSolutionSet(set.set)} if ${set.conditions.join(" and ")}`;
  }
}

export type SerializedSetBound = SerializedExpression | "-infinity" | "infinity";

function serializeBound(bound: SetBound): SerializedSetBound {
  return typeof bound === "string" ? bound : serializeExpression(bound);
}

export function serializeSolutionSet(set: SolutionSet): unknown {
  switch (set.kind) {
    case "finite":
      return { ...set, values: set.values.map(serializeExpression) };
    case "interval":
      return { ...set, lower: serializeBound(set.lower), upper: serializeBound(set.upper) };
    case "union":
      return { ...set, sets: set.sets.map(serializeSolutionSet) };
    case "parameterized":
      return { ...set, expression: serializeExpression(set.expression) };
    case "conditional":
      return { ...set, set: serializeSolutionSet(set.set) };
    default:
      return set;
  }
}
