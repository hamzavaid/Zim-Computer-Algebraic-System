import { SyntaxTree } from "../ast/types";
import { solveLinearEquation } from "./linearSolver";
import { SolveResult } from "./SolveResult";

export function solveFor(tree: SyntaxTree, variableName: string): SolveResult {
  if (tree.kind !== "equation") {
    return { kind: "unsupported", reason: "Solving requires an equation" };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(variableName)) {
    return { kind: "unsupported", reason: `Invalid variable name '${variableName}'` };
  }
  return solveLinearEquation(tree, variableName);
}
