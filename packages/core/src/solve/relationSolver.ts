import { compareExact, ExactNumber, isExactNumber, negateExact, rational } from "../ast/rational";
import {
  binary,
  equation,
  Equation,
  Expression,
  Relation,
  RelationOperator,
  SyntaxTree,
  variable,
} from "../ast/types";
import { SolutionSet } from "../sets/SolutionSet";
import { evaluate } from "../visitors/evaluate";
import { expressionEquals } from "../visitors/equal";
import { containsVariable } from "../visitors/containsVariable";
import { solveFor } from "./solveFor";
import { SolveResult } from "./SolveResult";

type InternalOperator = RelationOperator | "=";

export interface CandidateEvidence {
  readonly candidate: Expression;
  readonly reason: string;
}

export interface RelationSolveResult {
  readonly solution: SolutionSet;
  readonly accepted: readonly CandidateEvidence[];
  readonly rejected: readonly CandidateEvidence[];
  readonly conditions: readonly string[];
}

export interface PiecewiseBranch {
  readonly condition: Equation | Relation;
  readonly expression: Expression;
}

const emptyEvidence = (solution: SolutionSet): RelationSolveResult => ({
  solution,
  accepted: [],
  rejected: [],
  conditions: [],
});

function exactValues(result: SolveResult): ExactNumber[] | undefined {
  const values =
    result.kind === "solution"
      ? [result.value]
      : result.kind === "multiple-solutions"
        ? [...result.values]
        : result.kind === "no-solution"
          ? []
          : undefined;
  return values?.filter(isExactNumber);
}

function setFromSolveResult(result: SolveResult): SolutionSet {
  if (result.kind === "no-solution") return { kind: "empty" };
  if (result.kind === "identity") return { kind: "universal", domain: "real" };
  if (result.kind === "solution") return { kind: "finite", values: [result.value] };
  if (result.kind === "multiple-solutions") return { kind: "finite", values: result.values };
  return { kind: "conditional", set: { kind: "empty" }, conditions: [result.reason] };
}

function uniqueSorted(values: readonly ExactNumber[]): ExactNumber[] {
  return values
    .filter(
      (value, index) =>
        values.findIndex((candidate) => compareExact(candidate, value) === 0) === index,
    )
    .sort(compareExact);
}

function denominators(expression: Expression, variableName: string): Expression[] {
  if (expression.kind === "binary") {
    return [
      ...(expression.operator === "/" && containsVariable(expression.right, variableName)
        ? [expression.right]
        : []),
      ...denominators(expression.left, variableName),
      ...denominators(expression.right, variableName),
    ];
  }
  if (expression.kind === "unary") return denominators(expression.operand, variableName);
  if (expression.kind === "function")
    return expression.args.flatMap((argument) => denominators(argument, variableName));
  return [];
}

function relationHolds(difference: number, operator: InternalOperator): boolean {
  const zero = Math.abs(difference) <= 1e-10;
  if (operator === "=") return zero;
  if (operator === "!=") return !zero;
  if (operator === "<") return difference < -1e-10;
  if (operator === "<=") return difference < 1e-10;
  if (operator === ">") return difference > 1e-10;
  return difference > -1e-10;
}

function evaluateRelation(
  left: Expression,
  right: Expression,
  variableName: string,
  value: number,
  operator: InternalOperator,
): boolean {
  try {
    return relationHolds(
      evaluate(left, { [variableName]: value, pi: Math.PI, e: Math.E }) -
        evaluate(right, { [variableName]: value, pi: Math.PI, e: Math.E }),
      operator,
    );
  } catch {
    return false;
  }
}

function numeric(value: ExactNumber): number {
  return evaluate(value);
}

function solveInequality(
  left: Expression,
  right: Expression,
  operator: RelationOperator,
  variableName: string,
): SolutionSet {
  const equalityRoots = exactValues(solveFor(equation(left, right), variableName));
  if (equalityRoots === undefined) {
    return { kind: "conditional", set: { kind: "empty" }, conditions: ["unsupported boundary"] };
  }
  const poleValues = [
    ...denominators(left, variableName),
    ...denominators(right, variableName),
  ].flatMap(
    (denominator) => exactValues(solveFor(equation(denominator, rational(0n)), variableName)) ?? [],
  );
  const points = uniqueSorted([...equalityRoots, ...poleValues]);
  const isPole = (point: ExactNumber): boolean =>
    poleValues.some((candidate) => compareExact(candidate, point) === 0);
  const sets: SolutionSet[] = [];
  for (let index = 0; index <= points.length; index += 1) {
    const lower = points[index - 1];
    const upper = points[index];
    const sample =
      lower === undefined
        ? numeric(upper!) - Math.max(1, Math.abs(numeric(upper!)))
        : upper === undefined
          ? numeric(lower) + Math.max(1, Math.abs(numeric(lower)))
          : (numeric(lower) + numeric(upper)) / 2;
    if (!evaluateRelation(left, right, variableName, sample, operator)) continue;
    sets.push({
      kind: "interval",
      lower: lower ?? "-infinity",
      upper: upper ?? "infinity",
      lowerInclusive:
        lower !== undefined &&
        !isPole(lower) &&
        evaluateRelation(left, right, variableName, numeric(lower), operator),
      upperInclusive:
        upper !== undefined &&
        !isPole(upper) &&
        evaluateRelation(left, right, variableName, numeric(upper), operator),
    });
  }
  for (const point of points) {
    if (
      !isPole(point) &&
      evaluateRelation(left, right, variableName, numeric(point), operator) &&
      !sets.some(
        (set) =>
          set.kind === "interval" &&
          ((typeof set.lower !== "string" &&
            compareExact(set.lower as ExactNumber, point) === 0 &&
            set.lowerInclusive) ||
            (typeof set.upper !== "string" &&
              compareExact(set.upper as ExactNumber, point) === 0 &&
              set.upperInclusive)),
      )
    ) {
      sets.push({ kind: "finite", values: [point] });
    }
  }
  if (sets.length === 0) return { kind: "empty" };
  return sets.length === 1 ? sets[0]! : { kind: "union", sets };
}

function combineFinite(left: SolveResult, right: SolveResult): SolutionSet {
  const expressions: Expression[] = [];
  for (const result of [left, right]) {
    if (result.kind === "solution") expressions.push(result.value);
    if (result.kind === "multiple-solutions") expressions.push(...result.values);
  }
  const unique = expressions.filter(
    (value, index) =>
      expressions.findIndex((candidate) => expressionEquals(candidate, value)) === index,
  );
  unique.sort((a, b) => {
    try {
      return evaluate(a) - evaluate(b);
    } catch {
      return 0;
    }
  });
  return unique.length === 0 ? { kind: "empty" } : { kind: "finite", values: unique };
}

function absoluteSolve(
  argument: Expression,
  right: Expression,
  operator: InternalOperator,
  variableName: string,
): RelationSolveResult | undefined {
  if (!isExactNumber(right)) return undefined;
  if (compareExact(right, rational(0n)) < 0) {
    const trueForNegative = operator === "!=" || operator === ">" || operator === ">=";
    return emptyEvidence(
      trueForNegative ? { kind: "universal", domain: "real" } : { kind: "empty" },
    );
  }
  if (operator === "=") {
    return emptyEvidence(
      combineFinite(
        solveFor(equation(argument, right), variableName),
        solveFor(equation(argument, negateExact(right)), variableName),
      ),
    );
  }
  const outer = operator === ">" || operator === ">=" || operator === "!=";
  const strict = operator === ">" || operator === "<" || operator === "!=";
  const lowOperator: RelationOperator = outer ? (strict ? "<" : "<=") : strict ? ">" : ">=";
  const highOperator: RelationOperator = outer ? (strict ? ">" : ">=") : strict ? "<" : "<=";
  const low = solveInequality(argument, negateExact(right), lowOperator, variableName);
  const high = solveInequality(argument, right, highOperator, variableName);
  if (outer) return emptyEvidence({ kind: "union", sets: [low, high] });
  const intersection = solveInequality(
    binary("*", binary("-", argument, negateExact(right)), binary("-", right, argument)),
    rational(0n),
    strict ? ">" : ">=",
    variableName,
  );
  return emptyEvidence(intersection);
}

function radicalSolve(source: Equation, variableName: string): RelationSolveResult | undefined {
  if (
    source.left.kind !== "function" ||
    source.left.name !== "sqrt" ||
    source.left.args.length !== 1
  )
    return undefined;
  const transformed = equation(source.left.args[0]!, binary("^", source.right, rational(2n)));
  const candidates = solveFor(transformed, variableName);
  const values =
    candidates.kind === "solution"
      ? [candidates.value]
      : candidates.kind === "multiple-solutions"
        ? candidates.values
        : [];
  const accepted: CandidateEvidence[] = [];
  const rejected: CandidateEvidence[] = [];
  for (const candidate of values) {
    let valid = false;
    try {
      const value = evaluate(candidate);
      valid = evaluateRelation(source.left, source.right, variableName, value, "=");
    } catch {
      valid = false;
    }
    (valid ? accepted : rejected).push({
      candidate,
      reason: valid ? "verified in original relation" : "rejected by original relation",
    });
  }
  return {
    solution:
      accepted.length === 0
        ? { kind: "empty" }
        : { kind: "finite", values: accepted.map((entry) => entry.candidate) },
    accepted,
    rejected,
    conditions: [`${variableName} + 1 must be nonnegative`],
  };
}

export function solveRelation(
  tree: SyntaxTree,
  options: { readonly variable: string },
): RelationSolveResult {
  if (tree.kind !== "equation" && tree.kind !== "relation") {
    return emptyEvidence({
      kind: "conditional",
      set: { kind: "empty" },
      conditions: ["Solving requires a relation"],
    });
  }
  const operator: InternalOperator = tree.kind === "equation" ? "=" : tree.operator;
  if (operator === "=" && tree.kind === "equation") {
    const radical = radicalSolve(tree, options.variable);
    if (radical) return radical;
  }
  if (tree.left.kind === "function" && tree.left.name === "abs" && tree.left.args.length === 1) {
    const absolute = absoluteSolve(tree.left.args[0]!, tree.right, operator, options.variable);
    if (absolute) return absolute;
  }
  if (
    operator === "=" &&
    tree.left.kind === "function" &&
    tree.left.name === "sin" &&
    tree.left.args.length === 1 &&
    tree.left.args[0]!.kind === "variable" &&
    tree.left.args[0]!.name === options.variable &&
    isExactNumber(tree.right)
  ) {
    const right = evaluate(tree.right);
    if (right < -1 || right > 1) return emptyEvidence({ kind: "empty" });
    if (right === 0) {
      return emptyEvidence({
        kind: "parameterized",
        variable: options.variable,
        expression: binary("*", variable("k"), variable("pi")),
        parameter: "k",
        parameterDomain: "integer",
      });
    }
  }
  if (operator === "=") return emptyEvidence(setFromSolveResult(solveFor(tree, options.variable)));
  return emptyEvidence(solveInequality(tree.left, tree.right, operator, options.variable));
}

export function solvePiecewise(
  branches: readonly PiecewiseBranch[],
  right: Expression,
  options: { readonly variable: string },
): RelationSolveResult {
  const accepted: CandidateEvidence[] = [];
  const rejected: CandidateEvidence[] = [];
  for (const branch of branches) {
    const solved = solveFor(equation(branch.expression, right), options.variable);
    const candidates =
      solved.kind === "solution"
        ? [solved.value]
        : solved.kind === "multiple-solutions"
          ? solved.values
          : [];
    for (const candidate of candidates) {
      let valid = false;
      try {
        const value = evaluate(candidate);
        valid = evaluateRelation(
          branch.condition.left,
          branch.condition.right,
          options.variable,
          value,
          branch.condition.kind === "equation" ? "=" : branch.condition.operator,
        );
      } catch {
        valid = false;
      }
      (valid ? accepted : rejected).push({
        candidate,
        reason: valid ? "verified in active piecewise branch" : "outside piecewise branch guard",
      });
    }
  }
  const values = accepted
    .map((entry) => entry.candidate)
    .filter(
      (candidate, index, all) =>
        all.findIndex((other) => expressionEquals(other, candidate)) === index,
    )
    .sort((left, rightValue) => evaluate(left) - evaluate(rightValue));
  return {
    solution: values.length === 0 ? { kind: "empty" } : { kind: "finite", values },
    accepted,
    rejected,
    conditions: branches.map(
      (branch) =>
        `branch guard: ${branch.condition.kind === "equation" ? "=" : branch.condition.operator}`,
    ),
  };
}
