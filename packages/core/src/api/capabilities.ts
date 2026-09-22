export interface CapabilityLimits {
  readonly maxInputLength: number;
  readonly maxAstNodes: number;
  readonly maxNestingDepth: number;
  readonly maxPolynomialDegree: number;
  readonly maxDerivationNodes: number;
}

export interface CapabilityRegistry {
  readonly release: "2.4.6";
  readonly apiVersions: readonly ["1.0", "2.0-beta"];
  readonly operations: readonly string[];
  readonly solverFamilies: readonly string[];
  readonly domains: readonly ["real", "complex", "integer", "natural"];
  readonly limits: CapabilityLimits;
  readonly experimental: Readonly<Record<string, boolean>>;
}

const registry: CapabilityRegistry = Object.freeze({
  release: "2.4.6",
  apiVersions: ["1.0", "2.0-beta"] as const,
  operations: [
    "parse",
    "simplify",
    "solve",
    "solveSystem",
    "format",
    "latex",
    "capabilities",
    "analyzePolynomial",
    "solveRelation",
    "solveNonlinearSystem",
    "derive",
  ],
  solverFamilies: [
    "linear",
    "quadratic",
    "polynomial",
    "rational",
    "transcendental",
    "linear-system",
    "inequality",
    "absolute-value",
    "piecewise",
    "nonlinear-system",
  ],
  domains: ["real", "complex", "integer", "natural"] as const,
  limits: {
    maxInputLength: 65_536,
    maxAstNodes: 10_000,
    maxNestingDepth: 256,
    maxPolynomialDegree: 128,
    maxDerivationNodes: 2_000,
  },
  experimental: {
    algebraicNumbers: true,
    generalizedAssumptions: true,
    apiV2Beta: true,
  },
});

export function capabilities(): CapabilityRegistry {
  return registry;
}
