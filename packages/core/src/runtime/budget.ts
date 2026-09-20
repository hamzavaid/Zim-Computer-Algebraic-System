export interface ResourceBudget {
  readonly maxInputLength?: number;
  readonly maxAstNodes?: number;
  readonly maxNestingDepth?: number;
  readonly maxPolynomialDegree?: number;
  readonly maxCandidateRoots?: number;
  readonly maxDerivationNodes?: number;
  readonly maxIterations?: number;
}

export type BudgetResource =
  | "inputLength"
  | "astNodes"
  | "nestingDepth"
  | "polynomialDegree"
  | "candidateRoots"
  | "derivationNodes"
  | "iterations";

const budgetKeys: Readonly<Record<BudgetResource, keyof ResourceBudget>> = {
  inputLength: "maxInputLength",
  astNodes: "maxAstNodes",
  nestingDepth: "maxNestingDepth",
  polynomialDegree: "maxPolynomialDegree",
  candidateRoots: "maxCandidateRoots",
  derivationNodes: "maxDerivationNodes",
  iterations: "maxIterations",
};

export class RuntimeGuardError extends Error {
  constructor(
    readonly code: "BUDGET_EXCEEDED" | "REQUEST_CANCELLED",
    message: string,
    readonly resource?: BudgetResource,
  ) {
    super(message);
    this.name = "RuntimeGuardError";
  }
}

export class BudgetTracker {
  private readonly usage = new Map<BudgetResource, number>();

  constructor(readonly budget: ResourceBudget) {}

  consume(resource: BudgetResource, amount = 1): number {
    if (!Number.isFinite(amount) || amount < 0)
      throw new RangeError("Budget usage must be nonnegative");
    const next = (this.usage.get(resource) ?? 0) + amount;
    const limit = this.budget[budgetKeys[resource]];
    if (limit !== undefined && next > limit) {
      throw new RuntimeGuardError(
        "BUDGET_EXCEEDED",
        `${resource} budget exceeded (${next} > ${limit})`,
        resource,
      );
    }
    this.usage.set(resource, next);
    return next;
  }

  used(resource: BudgetResource): number {
    return this.usage.get(resource) ?? 0;
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RuntimeGuardError("REQUEST_CANCELLED", "Request was cancelled");
  }
}
