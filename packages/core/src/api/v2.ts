import { capabilities } from "./capabilities";
import { execute, ApiRequest, ApiResponse } from "./v1";
import { ResourceBudget, RuntimeGuardError } from "../runtime/budget";
import { parse } from "../parser/Parser";
import { Expression, SyntaxTree } from "../ast/types";
import { parts } from "../ast/rational";
import { analyzePolynomialRoots } from "../numeric/polynomialRoots";
import { polynomialToExpression } from "../algebra/polynomial";
import { serializeExpression, serializeSyntaxTree } from "../serialization/serialize";
import { solveRelation } from "../solve/relationSolver";
import { serializeSolutionSet } from "../sets/SolutionSet";
import { solveNonlinearSystem } from "../solve/nonlinearSystemSolver";
import { buildSolveDerivation, renderDerivation } from "../evidence/derivation";
import { ZimError } from "../errors/ZimError";

export const API_VERSION_V2 = "2.0-beta" as const;

interface BaseRequest {
  readonly apiVersion: typeof API_VERSION_V2;
  readonly requestId?: string;
  readonly budget?: ResourceBudget;
}

export type ApiV2Request =
  | (BaseRequest & { readonly operation: "capabilities" })
  | (BaseRequest & {
      readonly operation: "parse" | "format" | "latex";
      readonly expression: string;
    })
  | (BaseRequest & {
      readonly operation: "simplify";
      readonly expression: string;
      readonly includeSteps?: boolean;
    })
  | (BaseRequest & {
      readonly operation: "solve";
      readonly expression: string;
      readonly variable: string;
      readonly domain?: "real" | "complex";
      readonly includeSteps?: boolean;
    })
  | (BaseRequest & {
      readonly operation: "analyzePolynomial";
      readonly expression: string;
      readonly variable: string;
    })
  | (BaseRequest & {
      readonly operation: "solveRelation";
      readonly relation: string;
      readonly variable: string;
    })
  | (BaseRequest & {
      readonly operation: "solveNonlinearSystem";
      readonly equations: readonly string[];
      readonly variables: readonly string[];
      readonly mode?: "exact" | "numeric";
      readonly initialGuess?: Readonly<Record<string, number>>;
      readonly maxIterations?: number;
      readonly tolerance?: number;
      readonly maxResultantDegree?: number;
    })
  | (BaseRequest & {
      readonly operation: "derive";
      readonly expression: string;
      readonly variable: string;
      readonly renderMode?: "concise" | "classroom" | "diagnostic";
      readonly locale?: string;
    })
  | (BaseRequest & {
      readonly operation: "solveSystem";
      readonly expressions: readonly string[];
      readonly variables: readonly string[];
    });

export interface ApiV2Diagnostics {
  readonly operation: string;
  readonly code?: string;
}

export interface ApiV2Response {
  readonly apiVersion: typeof API_VERSION_V2;
  readonly requestId: string;
  readonly status: "ok" | "unsupported" | "invalid" | "budget-exceeded" | "internal-error";
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
  readonly diagnostics: ApiV2Diagnostics;
  readonly timing: { readonly totalMs: number };
}

let nextRequestId = 1;

function generatedRequestId(): string {
  return `zim-${Date.now().toString(36)}-${nextRequestId++}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim() !== "")
  );
}

const budgetFields = [
  "maxInputLength",
  "maxAstNodes",
  "maxNestingDepth",
  "maxPolynomialDegree",
  "maxCandidateRoots",
  "maxDerivationNodes",
  "maxIterations",
] as const;

function validBudget(value: unknown): value is ResourceBudget {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !budgetFields.includes(key as (typeof budgetFields)[number]))
  )
    return false;
  return Object.values(value).every((limit) => Number.isInteger(limit) && (limit as number) > 0);
}

function validateRequest(value: unknown): value is ApiV2Request {
  if (
    !isRecord(value) ||
    value.apiVersion !== API_VERSION_V2 ||
    typeof value.operation !== "string"
  )
    return false;
  if (
    value.requestId !== undefined &&
    (typeof value.requestId !== "string" || value.requestId.length === 0)
  )
    return false;
  if (!validBudget(value.budget)) return false;
  const expression = () => typeof value.expression === "string" && value.expression.trim() !== "";
  const variableName = () => validName(value.variable);
  switch (value.operation) {
    case "capabilities":
      return true;
    case "parse":
    case "format":
    case "latex":
      return expression();
    case "simplify":
      return (
        expression() &&
        (value.includeSteps === undefined || typeof value.includeSteps === "boolean")
      );
    case "solve":
      return (
        expression() &&
        variableName() &&
        (value.domain === undefined || value.domain === "real" || value.domain === "complex") &&
        (value.includeSteps === undefined || typeof value.includeSteps === "boolean")
      );
    case "analyzePolynomial":
      return expression() && variableName();
    case "solveRelation":
      return typeof value.relation === "string" && value.relation.trim() !== "" && variableName();
    case "solveSystem":
      return (
        strings(value.expressions) &&
        strings(value.variables) &&
        value.variables.every(validName) &&
        new Set(value.variables).size === value.variables.length
      );
    case "solveNonlinearSystem":
      return (
        strings(value.equations) &&
        strings(value.variables) &&
        value.variables.every(validName) &&
        new Set(value.variables).size === value.variables.length &&
        (value.mode === undefined || value.mode === "exact" || value.mode === "numeric") &&
        (value.initialGuess === undefined ||
          (isRecord(value.initialGuess) &&
            Object.values(value.initialGuess).every(Number.isFinite))) &&
        [value.maxIterations, value.tolerance, value.maxResultantDegree].every(
          (limit) =>
            limit === undefined ||
            (typeof limit === "number" && Number.isFinite(limit) && limit > 0),
        )
      );
    case "derive":
      return (
        expression() &&
        variableName() &&
        (value.renderMode === undefined ||
          ["concise", "classroom", "diagnostic"].includes(value.renderMode as string)) &&
        (value.locale === undefined || typeof value.locale === "string")
      );
    default:
      return false;
  }
}

function sourceStrings(request: ApiV2Request): readonly string[] {
  if ("expression" in request) return [request.expression];
  if (request.operation === "solveRelation") return [request.relation];
  if (request.operation === "solveSystem") return request.expressions;
  if (request.operation === "solveNonlinearSystem") return request.equations;
  return [];
}

function preflightSource(source: string, budget: ResourceBudget): void {
  const limits = capabilities().limits;
  const maxLength = budget.maxInputLength ?? limits.maxInputLength;
  if (source.length > maxLength)
    throw new RuntimeGuardError("BUDGET_EXCEEDED", "Input length budget exceeded", "inputLength");
  const maxDepth = budget.maxNestingDepth ?? limits.maxNestingDepth;
  let parentheses = 0;
  let unaryRun = 0;
  let powers = 0;
  let previousSignificant = "";
  for (const character of source) {
    if (/\s/u.test(character)) continue;
    if (character === "(") {
      parentheses++;
      if (parentheses > maxDepth)
        throw new RuntimeGuardError(
          "BUDGET_EXCEEDED",
          "Nesting depth budget exceeded",
          "nestingDepth",
        );
    } else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    const unary =
      (character === "+" || character === "-") &&
      (previousSignificant === "" || "(,+-*/%^=<>≠≤≥".includes(previousSignificant));
    unaryRun = unary ? unaryRun + 1 : 0;
    if (unaryRun > maxDepth)
      throw new RuntimeGuardError(
        "BUDGET_EXCEEDED",
        "Nesting depth budget exceeded",
        "nestingDepth",
      );
    if (character === "^" && ++powers > maxDepth)
      throw new RuntimeGuardError(
        "BUDGET_EXCEEDED",
        "Nesting depth budget exceeded",
        "nestingDepth",
      );
    previousSignificant = character;
  }
}

function treeMetrics(tree: SyntaxTree): { nodes: number; depth: number } {
  const stack: { value: SyntaxTree; depth: number }[] = [{ value: tree, depth: 1 }];
  let nodes = 0,
    depth = 0;
  while (stack.length) {
    const current = stack.pop()!;
    nodes++;
    depth = Math.max(depth, current.depth);
    const value = current.value;
    if (value.kind === "equation" || value.kind === "relation") {
      stack.push(
        { value: value.left, depth: current.depth + 1 },
        { value: value.right, depth: current.depth + 1 },
      );
    } else if (value.kind === "binary") {
      stack.push(
        { value: value.left, depth: current.depth + 1 },
        { value: value.right, depth: current.depth + 1 },
      );
    } else if (value.kind === "unary")
      stack.push({ value: value.operand, depth: current.depth + 1 });
    else if (value.kind === "function")
      for (const argument of value.args) stack.push({ value: argument, depth: current.depth + 1 });
  }
  return { nodes, depth };
}

function polynomialDegreeBound(expression: Expression, variableName: string): bigint | undefined {
  if (expression.kind === "constant" || expression.kind === "rational") return 0n;
  if (expression.kind === "variable") return expression.name === variableName ? 1n : undefined;
  if (expression.kind === "function") return undefined;
  if (expression.kind === "unary") return polynomialDegreeBound(expression.operand, variableName);
  const left = polynomialDegreeBound(expression.left, variableName);
  const right = polynomialDegreeBound(expression.right, variableName);
  if (expression.operator === "+" || expression.operator === "-")
    return left === undefined || right === undefined ? undefined : left > right ? left : right;
  if (expression.operator === "*")
    return left === undefined || right === undefined ? undefined : left + right;
  if (expression.operator === "/") return right === 0n ? left : undefined;
  if (expression.operator === "^") {
    if (
      left === undefined ||
      (expression.right.kind !== "constant" && expression.right.kind !== "rational")
    )
      return undefined;
    const [numerator, denominator] = parts(expression.right);
    return denominator === 1n && numerator >= 0n ? left * numerator : undefined;
  }
  return undefined;
}

function enforcePolynomialBudgets(
  tree: SyntaxTree,
  variableName: string,
  budget: ResourceBudget = {},
): void {
  const expressions =
    tree.kind === "equation" || tree.kind === "relation" ? [tree.left, tree.right] : [tree];
  const degrees = expressions.map((expression) => polynomialDegreeBound(expression, variableName));
  if (degrees.some((value) => value === undefined)) return;
  const degree = degrees.reduce<bigint>(
    (maximum, value) => (value! > maximum ? value! : maximum),
    0n,
  );
  const degreeLimit = BigInt(
    budget.maxPolynomialDegree ?? capabilities().limits.maxPolynomialDegree,
  );
  if (degree > degreeLimit)
    throw new RuntimeGuardError(
      "BUDGET_EXCEEDED",
      "Polynomial degree budget exceeded",
      "polynomialDegree",
    );
  if (budget.maxCandidateRoots !== undefined && degree > BigInt(budget.maxCandidateRoots))
    throw new RuntimeGuardError(
      "BUDGET_EXCEEDED",
      "Candidate root budget exceeded",
      "candidateRoots",
    );
}

function parseBounded(source: string, budget: ResourceBudget = {}): SyntaxTree {
  preflightSource(source, budget);
  const tree = parse(source);
  const metrics = treeMetrics(tree);
  const limits = capabilities().limits;
  if (metrics.nodes > (budget.maxAstNodes ?? limits.maxAstNodes))
    throw new RuntimeGuardError("BUDGET_EXCEEDED", "AST node budget exceeded", "astNodes");
  if (metrics.depth > (budget.maxNestingDepth ?? limits.maxNestingDepth))
    throw new RuntimeGuardError("BUDGET_EXCEEDED", "Nesting depth budget exceeded", "nestingDepth");
  return tree;
}

function v1Request(request: ApiV2Request): ApiRequest | undefined {
  if (
    request.operation === "capabilities" ||
    request.operation === "analyzePolynomial" ||
    request.operation === "solveRelation" ||
    request.operation === "solveNonlinearSystem" ||
    request.operation === "derive"
  )
    return undefined;
  if (request.operation === "solveSystem") {
    return {
      version: "1.0",
      operation: "solve-system",
      expressions: request.expressions,
      variables: request.variables,
    };
  }
  return { version: "1.0", ...request, operation: request.operation };
}

function mappedStatus(response: ApiResponse): ApiV2Response["status"] {
  if (response.status === "ok") return "ok";
  if (response.error.code === "INTERNAL_ERROR") return "internal-error";
  if (response.error.code.includes("UNSUPPORTED")) return "unsupported";
  return "invalid";
}

export function executeV2(request: ApiV2Request): ApiV2Response;
export function executeV2(request: unknown): ApiV2Response;
export function executeV2(request: unknown): ApiV2Response {
  const started = performance.now();
  const id =
    isRecord(request) && typeof request.requestId === "string" && request.requestId
      ? request.requestId
      : generatedRequestId();
  const requestedOperation =
    isRecord(request) && typeof request.operation === "string" ? request.operation : "unknown";
  const finish = (
    response: Omit<ApiV2Response, "apiVersion" | "requestId" | "timing">,
  ): ApiV2Response => ({
    apiVersion: API_VERSION_V2,
    requestId: id,
    ...response,
    timing: { totalMs: performance.now() - started },
  });
  try {
    if (!validateRequest(request)) {
      return finish({
        status: "invalid",
        error: {
          code: "INVALID_REQUEST",
          message: "Request does not match an API v2 operation contract",
        },
        diagnostics: {
          operation: requestedOperation as ApiV2Request["operation"],
          code: "INVALID_REQUEST",
        },
      });
    }
    for (const source of sourceStrings(request)) preflightSource(source, request.budget ?? {});
    if (request.operation === "capabilities") {
      return finish({
        status: "ok",
        result: capabilities(),
        diagnostics: { operation: request.operation },
      });
    }
    if (request.operation === "analyzePolynomial") {
      const tree = parseBounded(request.expression, request.budget);
      enforcePolynomialBudgets(tree, request.variable, request.budget);
      const analysis =
        tree.kind === "equation" || tree.kind === "relation"
          ? ({ kind: "unsupported", reason: "Polynomial analysis expects an expression" } as const)
          : analyzePolynomialRoots(tree, request.variable);
      const result =
        analysis.kind !== "complete"
          ? analysis
          : {
              ...analysis,
              factors: analysis.factors.map((factor) => ({
                polynomial: serializeSyntaxTree(polynomialToExpression(factor.polynomial)),
                multiplicity: factor.multiplicity,
              })),
              complexRoots: analysis.complexRoots.map((root) => ({
                ...root,
                ...(root.exact === undefined ? {} : { exact: serializeSyntaxTree(root.exact) }),
              })),
            };
      return finish({
        status:
          analysis.kind === "complete"
            ? "ok"
            : analysis.kind === "incomplete"
              ? "budget-exceeded"
              : "unsupported",
        result,
        diagnostics: { operation: request.operation },
      });
    }
    if (request.operation === "solveRelation") {
      const tree = parseBounded(request.relation, request.budget);
      enforcePolynomialBudgets(tree, request.variable, request.budget);
      const solved = solveRelation(tree, {
        variable: request.variable,
      });
      return finish({
        status: solved.unsupportedReason ? "unsupported" : "ok",
        result: {
          ...solved,
          solution: serializeSolutionSet(solved.solution),
          accepted: solved.accepted.map((entry) => ({
            ...entry,
            candidate: serializeExpression(entry.candidate),
          })),
          rejected: solved.rejected.map((entry) => ({
            ...entry,
            candidate: serializeExpression(entry.candidate),
          })),
        },
        diagnostics: { operation: request.operation },
      });
    }
    if (request.operation === "solve") {
      const tree = parseBounded(request.expression, request.budget);
      enforcePolynomialBudgets(tree, request.variable, request.budget);
    }
    if (request.operation === "solveNonlinearSystem") {
      const trees = request.equations.map((source) => parseBounded(source, request.budget));
      if (trees.some((tree) => tree.kind !== "equation")) {
        return finish({
          status: "invalid",
          error: { code: "EQUATIONS_REQUIRED", message: "Every system member must be an equation" },
          diagnostics: { operation: request.operation, code: "EQUATIONS_REQUIRED" },
        });
      }
      const solved = solveNonlinearSystem(
        trees.filter((tree) => tree.kind === "equation"),
        request.variables,
        {
          mode: request.mode,
          initialGuess: request.initialGuess,
          maxIterations:
            request.maxIterations === undefined
              ? request.budget?.maxIterations
              : request.budget?.maxIterations === undefined
                ? request.maxIterations
                : Math.min(request.maxIterations, request.budget.maxIterations),
          tolerance: request.tolerance,
          maxResultantDegree:
            request.maxResultantDegree === undefined
              ? request.budget?.maxPolynomialDegree
              : request.budget?.maxPolynomialDegree === undefined
                ? request.maxResultantDegree
                : Math.min(request.maxResultantDegree, request.budget.maxPolynomialDegree),
        },
      );
      const result =
        solved.kind === "finite"
          ? {
              ...solved,
              solutions: solved.solutions.map((solution) => ({
                ...solution,
                values: Object.fromEntries(
                  Object.entries(solution.values).map(([name, value]) => [
                    name,
                    serializeExpression(value),
                  ]),
                ),
              })),
            }
          : solved.kind === "positive-dimensional"
            ? { ...solved, constraints: solved.constraints.map(serializeSyntaxTree) }
            : solved;
      return finish({
        status:
          solved.kind === "unsupported"
            ? "unsupported"
            : solved.kind === "incomplete"
              ? "budget-exceeded"
              : "ok",
        result,
        diagnostics: { operation: request.operation },
      });
    }
    if (request.operation === "derive") {
      const graph = buildSolveDerivation(parseBounded(request.expression, request.budget), {
        variable: request.variable,
        maxNodes: request.budget?.maxDerivationNodes,
      });
      return finish({
        status: "ok",
        result: {
          graph,
          rendered: renderDerivation(graph, {
            mode: request.renderMode ?? "classroom",
            locale: request.locale,
          }),
        },
        diagnostics: { operation: request.operation },
      });
    }
    for (const source of sourceStrings(request)) parseBounded(source, request.budget);
    const legacy = execute(v1Request(request)!);
    return legacy.status === "ok"
      ? finish({
          status: "ok",
          result: legacy.result,
          diagnostics: { operation: request.operation },
        })
      : finish({
          status: mappedStatus(legacy),
          error: { code: legacy.error.code, message: legacy.error.message },
          diagnostics: { operation: request.operation, code: legacy.error.code },
        });
  } catch (caught) {
    if (caught instanceof ZimError) {
      return finish({
        status: "invalid",
        error: { code: caught.code, message: caught.message },
        diagnostics: {
          operation: requestedOperation as ApiV2Request["operation"],
          code: caught.code,
        },
      });
    }
    if (caught instanceof RuntimeGuardError) {
      return finish({
        status: caught.code === "BUDGET_EXCEEDED" ? "budget-exceeded" : "invalid",
        error: { code: caught.code, message: caught.message },
        diagnostics: {
          operation: requestedOperation as ApiV2Request["operation"],
          code: caught.code,
        },
      });
    }
    return finish({
      status: "internal-error",
      error: { code: "INTERNAL_ERROR", message: "Execution failed safely" },
      diagnostics: {
        operation: requestedOperation as ApiV2Request["operation"],
        code: "INTERNAL_ERROR",
      },
    });
  }
}
