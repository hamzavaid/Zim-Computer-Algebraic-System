import { format } from "../format/formatter";
import { toLatex } from "../format/latex";
import { parse } from "../parser/Parser";
import { serializeSolveResult, serializeSyntaxTree } from "../serialization/serialize";
import { simplify } from "../simplify/simplify";
import { solveFor } from "../solve/solveFor";
import { ZimError } from "../errors/ZimError";
import { formatSolveResult, latexSolveResult } from "./public";

export const API_VERSION = "1.0" as const;

export type ApiOperation = "parse" | "simplify" | "solve" | "format" | "latex";

export interface ApiRequest {
  readonly version: typeof API_VERSION;
  readonly operation: ApiOperation;
  readonly expression: string;
  readonly variable?: string;
  readonly includeSteps?: boolean;
}

export type ApiResponse =
  | { readonly version: typeof API_VERSION; readonly status: "ok"; readonly result: unknown }
  | {
      readonly version: typeof API_VERSION;
      readonly status: "error";
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly start?: number;
        readonly end?: number;
      };
    };

function error(code: string, message: string, start?: number, end?: number): ApiResponse {
  return {
    version: API_VERSION,
    status: "error",
    error: {
      code,
      message,
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
    },
  };
}

export function execute(request: ApiRequest): ApiResponse {
  if (!request || request.version !== API_VERSION) {
    return error("API_VERSION_UNSUPPORTED", `Expected API version '${API_VERSION}'`);
  }
  if (typeof request.expression !== "string" || request.expression.trim() === "") {
    return error("INVALID_REQUEST", "A non-empty expression string is required");
  }
  try {
    const tree = parse(request.expression);
    if (request.operation === "parse") {
      return {
        version: API_VERSION,
        status: "ok",
        result: { ast: serializeSyntaxTree(tree), text: format(tree), latex: toLatex(tree) },
      };
    }
    if (request.operation === "format") {
      return { version: API_VERSION, status: "ok", result: { text: format(tree) } };
    }
    if (request.operation === "latex") {
      return { version: API_VERSION, status: "ok", result: { latex: toLatex(tree) } };
    }
    if (request.operation === "simplify") {
      const simplified = simplify(tree, { debug: request.includeSteps });
      return {
        version: API_VERSION,
        status: "ok",
        result: {
          ast: serializeSyntaxTree(simplified.expression),
          text: format(simplified.expression),
          latex: toLatex(simplified.expression),
          steps: request.includeSteps
            ? simplified.steps.map((step) => ({
                rule: step.rule,
                before: serializeSyntaxTree(step.before),
                after: serializeSyntaxTree(step.after),
              }))
            : [],
        },
      };
    }
    if (request.operation === "solve") {
      if (!request.variable) return error("VARIABLE_REQUIRED", "Solve requests require a variable");
      const solved = solveFor(tree, request.variable);
      return {
        version: API_VERSION,
        status: "ok",
        result: {
          solution: serializeSolveResult(solved),
          text: formatSolveResult(solved),
          latex: latexSolveResult(solved),
        },
      };
    }
    return error("OPERATION_UNSUPPORTED", `Unsupported operation '${String(request.operation)}'`);
  } catch (caught) {
    if (caught instanceof ZimError) {
      return error(caught.code, caught.message, caught.start, caught.end);
    }
    return error("INTERNAL_ERROR", caught instanceof Error ? caught.message : "Unknown failure");
  }
}
