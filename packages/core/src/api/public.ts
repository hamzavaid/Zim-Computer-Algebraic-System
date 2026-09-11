import { equation, Equation, SyntaxTree, variable } from "../ast/types";
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

export interface SolveTraceStep {
  readonly rule: "verified-solution";
  readonly before: Equation;
  readonly after: Equation;
}

export interface DetailedSolveResult {
  readonly result: SolveResult;
  readonly steps: readonly SolveTraceStep[];
}

export function solveWithSteps(tree: SyntaxTree, options: SolveOptions): DetailedSolveResult {
  const result = solve(tree, options);
  if (tree.kind !== "equation") return { result, steps: [] };
  const values =
    result.kind === "solution"
      ? [result.value]
      : result.kind === "multiple-solutions"
        ? result.values
        : [];
  return {
    result,
    steps: values.map((value) => ({
      rule: "verified-solution",
      before: tree,
      after: equation(variable(options.variable), value),
    })),
  };
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
