import { canonicalKey } from "../format/formatter";
import { Expression } from "../ast/types";
import { Assumption, AssumptionSet, Domain } from "./types";

export function createAssumptionSet(assumptions: readonly Assumption[] = []): AssumptionSet {
  const positive = new Set<string>();
  const negative = new Set<string>();
  const domains = new Map<string, Domain>();
  const contradictions: string[] = [];
  for (const assumption of assumptions) {
    if (assumption.kind === "domain") {
      const existing = domains.get(assumption.symbol);
      if (existing && existing !== assumption.domain) {
        const compatible =
          (existing === "natural" && ["integer", "real", "complex"].includes(assumption.domain)) ||
          (assumption.domain === "natural" && ["integer", "real", "complex"].includes(existing)) ||
          (existing === "integer" && ["real", "complex"].includes(assumption.domain)) ||
          (assumption.domain === "integer" && ["real", "complex"].includes(existing)) ||
          (existing === "real" && assumption.domain === "complex") ||
          (existing === "complex" && assumption.domain === "real");
        if (!compatible) contradictions.push(`Conflicting domains for '${assumption.symbol}'`);
      }
      domains.set(assumption.symbol, assumption.domain);
    } else if (assumption.kind === "positive") positive.add(canonicalKey(assumption.expression));
    else if (assumption.kind === "negative") negative.add(canonicalKey(assumption.expression));
  }
  for (const key of positive) {
    if (negative.has(key))
      contradictions.push(`Expression '${key}' cannot be positive and negative`);
  }
  return {
    assumptions: [...assumptions],
    satisfiable: contradictions.length === 0,
    contradictions,
  };
}

export function domainOf(set: AssumptionSet, symbol: string): Domain | undefined {
  const assumption = [...set.assumptions]
    .reverse()
    .find((candidate) => candidate.kind === "domain" && candidate.symbol === symbol);
  return assumption?.kind === "domain" ? assumption.domain : undefined;
}

export function isKnownPositive(set: AssumptionSet, expression: Expression): boolean {
  const key = canonicalKey(expression);
  return set.assumptions.some(
    (assumption) => assumption.kind === "positive" && canonicalKey(assumption.expression) === key,
  );
}

export function isKnownNonzero(set: AssumptionSet, expression: Expression): boolean {
  const key = canonicalKey(expression);
  return set.assumptions.some(
    (assumption) =>
      ((assumption.kind === "nonzero" ||
        assumption.kind === "positive" ||
        assumption.kind === "negative") &&
        canonicalKey(assumption.expression) === key) ||
      (assumption.kind === "domain" &&
        expression.kind === "variable" &&
        assumption.symbol === expression.name &&
        assumption.domain === "natural"),
  );
}
