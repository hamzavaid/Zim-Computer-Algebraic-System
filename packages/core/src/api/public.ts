import { SyntaxTree } from "../ast/types";
import { format } from "../format/formatter";
import { toLatex } from "../format/latex";
import { solveFor } from "../solve/solveFor";
import { SolveResult } from "../solve/SolveResult";
import { SolveDomain } from "../solve/SolveOptions";
import { SystemSolveResult } from "../solve/systemSolver";

export interface SolveOptions {
  readonly variable: string;
  readonly domain?: SolveDomain;
}

export function solve(tree: SyntaxTree, options: SolveOptions): SolveResult {
  return solveFor(tree, options.variable, { domain: options.domain });
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

export function formatSystemSolveResult(result: SystemSolveResult): string {
  if (result.kind === "unique") {
    return Object.entries(result.solution)
      .map(([name, value]) => `${name} = ${format(value)}`)
      .join(", ");
  }
  if (result.kind === "infinite") return "infinitely many solutions";
  if (result.kind === "no-solution") return "no solution";
  return `unsupported: ${result.reason}`;
}
