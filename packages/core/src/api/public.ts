import { SyntaxTree } from "../ast/types";
import { format } from "../format/formatter";
import { toLatex } from "../format/latex";
import { solveFor } from "../solve/solveFor";
import { SolveResult } from "../solve/SolveResult";

export interface SolveOptions {
  readonly variable: string;
}

export function solve(tree: SyntaxTree, options: SolveOptions): SolveResult {
  return solveFor(tree, options.variable);
}

export function formatSolveResult(result: SolveResult): string {
  switch (result.kind) {
    case "solution":
      return `${result.variable} = ${format(result.value)}`;
    case "multiple-solutions":
      return `${result.variable} = ${result.values.map(format).join(", ")}`;
    case "identity":
      return "identity";
    case "no-solution":
      return "no solution";
    case "unsupported":
      return `unsupported: ${result.reason}`;
  }
}

export function latexSolveResult(result: SolveResult): string {
  if (result.kind === "solution") return `${result.variable} = ${toLatex(result.value)}`;
  if (result.kind === "multiple-solutions") {
    return `${result.variable} \\in \\left\\{${result.values.map(toLatex).join(", ")}\\right\\}`;
  }
  return formatSolveResult(result);
}
