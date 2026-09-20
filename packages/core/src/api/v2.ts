import { capabilities } from "./capabilities";
import { execute, ApiRequest, ApiResponse } from "./v1";
import { ResourceBudget, RuntimeGuardError } from "../runtime/budget";
import { parse } from "../parser/Parser";
import { analyzePolynomialRoots } from "../numeric/polynomialRoots";
import { polynomialToExpression } from "../algebra/polynomial";
import { serializeExpression, serializeSyntaxTree } from "../serialization/serialize";
import { solveRelation } from "../solve/relationSolver";
import { serializeSolutionSet } from "../sets/SolutionSet";

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
      readonly operation: "solveSystem";
      readonly expressions: readonly string[];
      readonly variables: readonly string[];
    });

export interface ApiV2Diagnostics {
  readonly operation: ApiV2Request["operation"];
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

function requestId(request: ApiV2Request): string {
  return request.requestId ?? `zim-${Date.now().toString(36)}-${nextRequestId++}`;
}

function v1Request(request: ApiV2Request): ApiRequest | undefined {
  if (
    request.operation === "capabilities" ||
    request.operation === "analyzePolynomial" ||
    request.operation === "solveRelation"
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

export function executeV2(request: ApiV2Request): ApiV2Response {
  const started = performance.now();
  const id = requestId(request);
  const finish = (
    response: Omit<ApiV2Response, "apiVersion" | "requestId" | "timing">,
  ): ApiV2Response => ({
    apiVersion: API_VERSION_V2,
    requestId: id,
    ...response,
    timing: { totalMs: performance.now() - started },
  });
  try {
    if (request.apiVersion !== API_VERSION_V2) {
      return finish({
        status: "invalid",
        error: { code: "API_VERSION_UNSUPPORTED", message: `Expected '${API_VERSION_V2}'` },
        diagnostics: { operation: request.operation, code: "API_VERSION_UNSUPPORTED" },
      });
    }
    if ("expression" in request && request.budget?.maxInputLength !== undefined) {
      if (request.expression.length > request.budget.maxInputLength) {
        throw new RuntimeGuardError(
          "BUDGET_EXCEEDED",
          "Input length budget exceeded",
          "inputLength",
        );
      }
    }
    if (request.operation === "capabilities") {
      return finish({
        status: "ok",
        result: capabilities(),
        diagnostics: { operation: request.operation },
      });
    }
    if (request.operation === "analyzePolynomial") {
      const tree = parse(request.expression);
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
      const solved = solveRelation(parse(request.relation), { variable: request.variable });
      return finish({
        status: "ok",
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
    if (caught instanceof RuntimeGuardError) {
      return finish({
        status: caught.code === "BUDGET_EXCEEDED" ? "budget-exceeded" : "invalid",
        error: { code: caught.code, message: caught.message },
        diagnostics: { operation: request.operation, code: caught.code },
      });
    }
    return finish({
      status: "internal-error",
      error: { code: "INTERNAL_ERROR", message: "Execution failed safely" },
      diagnostics: { operation: request.operation, code: "INTERNAL_ERROR" },
    });
  }
}
