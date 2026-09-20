import {
  addExact,
  compareExact,
  divideExact,
  ExactNumber,
  exactSquareRoot,
  isExactNumber,
  isZero,
  multiplyExact,
  negateExact,
  rational,
  subtractExact,
} from "../ast/rational";
import { binary, Equation, Expression, func, unary } from "../ast/types";
import { simplifyExpression } from "../simplify/simplify";
import { containsVariable } from "../visitors/containsVariable";
import { evaluate } from "../visitors/evaluate";
import { substitute } from "../visitors/substitute";
import { solveFor } from "./solveFor";

export interface NonlinearSolution {
  readonly values: Readonly<Record<string, Expression>>;
  readonly residual: number;
  readonly verified: boolean;
}

export interface NewtonDiagnostics {
  readonly converged: boolean;
  readonly iterations: number;
  readonly jacobianDeterminant: number;
}

export type NonlinearSystemResult =
  | {
      readonly kind: "finite";
      readonly method: "substitution" | "resultant" | "newton";
      readonly solutions: readonly NonlinearSolution[];
      readonly diagnostics?: NewtonDiagnostics;
    }
  | { readonly kind: "no-solution"; readonly verified: true }
  | {
      readonly kind: "positive-dimensional";
      readonly dimension: number;
      readonly constraints: readonly Equation[];
      readonly verified: true;
    }
  | { readonly kind: "incomplete"; readonly reason: string }
  | { readonly kind: "unsupported"; readonly reason: string };

export interface NonlinearSystemOptions {
  readonly mode?: "exact" | "numeric";
  readonly initialGuess?: Readonly<Record<string, number>>;
  readonly tolerance?: number;
  readonly maxIterations?: number;
  readonly maxResultantDegree?: number;
}

const simplify = (expression: Expression): Expression => simplifyExpression(expression).expression;
const add = (left: Expression, right: Expression): Expression => simplify(binary("+", left, right));
const subtract = (left: Expression, right: Expression): Expression =>
  simplify(binary("-", left, right));
const multiply = (left: Expression, right: Expression): Expression =>
  simplify(binary("*", left, right));
const divide = (left: Expression, right: Expression): Expression =>
  simplify(binary("/", left, right));

interface LinearExpression {
  readonly coefficient: Expression;
  readonly constant: Expression;
}

function linearIn(expression: Expression, variableName: string): LinearExpression | undefined {
  if (!containsVariable(expression, variableName)) {
    return { coefficient: rational(0n), constant: expression };
  }
  if (expression.kind === "variable" && expression.name === variableName) {
    return { coefficient: rational(1n), constant: rational(0n) };
  }
  if (expression.kind === "unary") {
    const operand = linearIn(expression.operand, variableName);
    if (!operand) return undefined;
    return expression.operator === "+"
      ? operand
      : {
          coefficient: simplify(unary("-", operand.coefficient)),
          constant: simplify(unary("-", operand.constant)),
        };
  }
  if (expression.kind !== "binary") return undefined;
  if (expression.operator === "+" || expression.operator === "-") {
    const left = linearIn(expression.left, variableName);
    const right = linearIn(expression.right, variableName);
    if (!left || !right) return undefined;
    const combine = expression.operator === "+" ? add : subtract;
    return {
      coefficient: combine(left.coefficient, right.coefficient),
      constant: combine(left.constant, right.constant),
    };
  }
  if (expression.operator === "*") {
    const leftHas = containsVariable(expression.left, variableName);
    const rightHas = containsVariable(expression.right, variableName);
    if (leftHas && rightHas) return undefined;
    const dependent = linearIn(leftHas ? expression.left : expression.right, variableName);
    const independent = leftHas ? expression.right : expression.left;
    return dependent
      ? {
          coefficient: multiply(independent, dependent.coefficient),
          constant: multiply(independent, dependent.constant),
        }
      : undefined;
  }
  if (expression.operator === "/" && !containsVariable(expression.right, variableName)) {
    const numerator = linearIn(expression.left, variableName);
    return numerator
      ? {
          coefficient: divide(numerator.coefficient, expression.right),
          constant: divide(numerator.constant, expression.right),
        }
      : undefined;
  }
  return undefined;
}

function isolate(equation: Equation, variableName: string): Expression | undefined {
  const difference = subtract(equation.left, equation.right);
  const form = linearIn(difference, variableName);
  if (!form || (isExactNumber(form.coefficient) && isZero(form.coefficient))) return undefined;
  const solved = divide(simplify(unary("-", form.constant)), form.coefficient);
  return containsVariable(solved, variableName) ? undefined : solved;
}

function solveValues(result: ReturnType<typeof solveFor>): Expression[] | undefined {
  if (result.kind === "solution") return [result.value];
  if (result.kind === "multiple-solutions") return [...result.values];
  if (result.kind === "no-solution") return [];
  return undefined;
}

function numericEnvironment(
  values: Readonly<Record<string, Expression>>,
): Readonly<Record<string, number>> | undefined {
  try {
    return Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, evaluate(value)]),
    );
  } catch {
    return undefined;
  }
}

function verify(
  equations: readonly Equation[],
  values: Readonly<Record<string, Expression>>,
): { verified: boolean; residual: number } {
  const environment = numericEnvironment(values);
  if (!environment) return { verified: false, residual: Number.POSITIVE_INFINITY };
  try {
    const residual = Math.max(
      ...equations.map((equation) =>
        Math.abs(evaluate(equation.left, environment) - evaluate(equation.right, environment)),
      ),
    );
    return { verified: Number.isFinite(residual) && residual < 1e-8, residual };
  } catch {
    return { verified: false, residual: Number.POSITIVE_INFINITY };
  }
}

function substitutionSolve(
  equations: readonly Equation[],
  variables: readonly [string, string],
): NonlinearSystemResult | undefined {
  for (const source of equations) {
    for (const eliminated of variables) {
      const replacement = isolate(source, eliminated);
      if (!replacement) continue;
      const remaining = variables.find((name) => name !== eliminated)!;
      const target = equations.find((equation) => equation !== source) ?? source;
      const reduced: Equation = {
        kind: "equation",
        left: simplify(substitute(target.left, eliminated, replacement)),
        right: simplify(substitute(target.right, eliminated, replacement)),
      };
      const roots = solveValues(solveFor(reduced, remaining));
      if (roots === undefined) continue;
      const solutions: NonlinearSolution[] = [];
      for (const root of roots) {
        const eliminatedValue = simplify(substitute(replacement, remaining, root));
        const values = { [remaining]: root, [eliminated]: eliminatedValue };
        const checked = verify(equations, values);
        if (checked.verified) solutions.push({ values, ...checked });
      }
      return solutions.length === 0
        ? { kind: "no-solution", verified: true }
        : { kind: "finite", method: "substitution", solutions };
    }
  }
  return undefined;
}

interface SquareForm {
  readonly x: ExactNumber;
  readonly y: ExactNumber;
  readonly constant: ExactNumber;
}

function scaleSquare(form: SquareForm, factor: ExactNumber): SquareForm {
  return {
    x: multiplyExact(form.x, factor),
    y: multiplyExact(form.y, factor),
    constant: multiplyExact(form.constant, factor),
  };
}

function combineSquare(left: SquareForm, right: SquareForm, minus: boolean): SquareForm {
  const combine = minus ? subtractExact : addExact;
  return {
    x: combine(left.x, right.x),
    y: combine(left.y, right.y),
    constant: combine(left.constant, right.constant),
  };
}

function squareForm(expression: Expression, xName: string, yName: string): SquareForm | undefined {
  if (isExactNumber(expression)) return { x: rational(0n), y: rational(0n), constant: expression };
  if (
    expression.kind === "binary" &&
    expression.operator === "^" &&
    expression.left.kind === "variable" &&
    isExactNumber(expression.right) &&
    compareExact(expression.right, rational(2n)) === 0
  ) {
    if (expression.left.name === xName)
      return { x: rational(1n), y: rational(0n), constant: rational(0n) };
    if (expression.left.name === yName)
      return { x: rational(0n), y: rational(1n), constant: rational(0n) };
  }
  if (expression.kind === "unary") {
    const operand = squareForm(expression.operand, xName, yName);
    return operand
      ? expression.operator === "+"
        ? operand
        : scaleSquare(operand, rational(-1n))
      : undefined;
  }
  if (expression.kind !== "binary") return undefined;
  if (expression.operator === "+" || expression.operator === "-") {
    const left = squareForm(expression.left, xName, yName);
    const right = squareForm(expression.right, xName, yName);
    return left && right ? combineSquare(left, right, expression.operator === "-") : undefined;
  }
  if (expression.operator === "*") {
    if (isExactNumber(expression.left)) {
      const right = squareForm(expression.right, xName, yName);
      return right ? scaleSquare(right, expression.left) : undefined;
    }
    if (isExactNumber(expression.right)) {
      const left = squareForm(expression.left, xName, yName);
      return left ? scaleSquare(left, expression.right) : undefined;
    }
  }
  return undefined;
}

function squareRoots(value: ExactNumber): Expression[] {
  if (compareExact(value, rational(0n)) < 0) return [];
  const root = exactSquareRoot(value) ?? func("sqrt", [value]);
  if (isExactNumber(root) && isZero(root)) return [root];
  return [simplify(unary("-", root)), root];
}

function resultantSquareSolve(
  equations: readonly Equation[],
  variables: readonly [string, string],
  maxDegree: number,
): NonlinearSystemResult | undefined {
  const forms = equations.slice(0, 2).map((equation) => {
    const left = squareForm(equation.left, variables[0], variables[1]);
    const right = squareForm(equation.right, variables[0], variables[1]);
    return left && right ? combineSquare(left, right, true) : undefined;
  });
  if (forms.some((form) => form === undefined)) return undefined;
  if (maxDegree < 2) return { kind: "incomplete", reason: "resultant-degree-budget-exceeded" };
  const [first, second] = forms as [SquareForm, SquareForm];
  const determinant = subtractExact(
    multiplyExact(first.x, second.y),
    multiplyExact(second.x, first.y),
  );
  if (isZero(determinant)) return undefined;
  const firstRight = negateExact(first.constant);
  const secondRight = negateExact(second.constant);
  const xSquared = divideExact(
    subtractExact(multiplyExact(firstRight, second.y), multiplyExact(first.y, secondRight)),
    determinant,
  );
  const ySquared = divideExact(
    subtractExact(multiplyExact(first.x, secondRight), multiplyExact(firstRight, second.x)),
    determinant,
  );
  const solutions: NonlinearSolution[] = [];
  for (const x of squareRoots(xSquared)) {
    for (const y of squareRoots(ySquared)) {
      const values = { [variables[0]]: x, [variables[1]]: y };
      const checked = verify(equations, values);
      if (checked.verified) solutions.push({ values, ...checked });
    }
  }
  return solutions.length === 0
    ? { kind: "no-solution", verified: true }
    : { kind: "finite", method: "resultant", solutions };
}

function numericResiduals(
  equations: readonly Equation[],
  variables: readonly [string, string],
  point: readonly [number, number],
): readonly [number, number] {
  const environment = { [variables[0]]: point[0], [variables[1]]: point[1] };
  return equations
    .slice(0, 2)
    .map(
      (equation) => evaluate(equation.left, environment) - evaluate(equation.right, environment),
    ) as unknown as readonly [number, number];
}

function newtonSolve(
  equations: readonly Equation[],
  variables: readonly [string, string],
  options: NonlinearSystemOptions,
): NonlinearSystemResult {
  const tolerance = options.tolerance ?? 1e-10;
  const maximum = options.maxIterations ?? 50;
  let point: [number, number] = [
    options.initialGuess?.[variables[0]] ?? 0,
    options.initialGuess?.[variables[1]] ?? 0,
  ];
  let determinant = 0;
  let residual = Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < maximum; iteration += 1) {
    const values = numericResiduals(equations, variables, point);
    residual = Math.max(Math.abs(values[0]), Math.abs(values[1]));
    if (residual <= tolerance) {
      const scale = 1_000_000_000_000n;
      const resultValues = {
        [variables[0]]: rational(BigInt(Math.round(point[0] * Number(scale))), scale),
        [variables[1]]: rational(BigInt(Math.round(point[1] * Number(scale))), scale),
      };
      return {
        kind: "finite",
        method: "newton",
        solutions: [{ values: resultValues, residual, verified: true }],
        diagnostics: { converged: true, iterations: iteration, jacobianDeterminant: determinant },
      };
    }
    const step = Math.sqrt(Number.EPSILON) * Math.max(1, Math.abs(point[0]), Math.abs(point[1]));
    const xShift = numericResiduals(equations, variables, [point[0] + step, point[1]]);
    const yShift = numericResiduals(equations, variables, [point[0], point[1] + step]);
    const a = (xShift[0] - values[0]) / step;
    const c = (xShift[1] - values[1]) / step;
    const b = (yShift[0] - values[0]) / step;
    const d = (yShift[1] - values[1]) / step;
    determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-14) {
      return { kind: "incomplete", reason: "singular-jacobian" };
    }
    const deltaX = (-values[0] * d + b * values[1]) / determinant;
    const deltaY = (c * values[0] - a * values[1]) / determinant;
    point = [point[0] + deltaX, point[1] + deltaY];
  }
  return { kind: "incomplete", reason: "iteration-budget-exceeded" };
}

export function solveNonlinearSystem(
  equations: readonly Equation[],
  variables: readonly string[],
  options: NonlinearSystemOptions = {},
): NonlinearSystemResult {
  if (equations.length === 0 || variables.length === 0)
    return { kind: "unsupported", reason: "A nonlinear system requires equations and variables" };
  if (new Set(variables).size !== variables.length)
    return { kind: "unsupported", reason: "System variables must be unique" };
  if (equations.length < variables.length) {
    return {
      kind: "positive-dimensional",
      dimension: variables.length - equations.length,
      constraints: equations,
      verified: true,
    };
  }
  if (variables.length !== 2 || equations.length < 2) {
    return {
      kind: "unsupported",
      reason: "The bounded nonlinear solver currently supports two variables",
    };
  }
  const pair = variables as readonly [string, string];
  if (options.mode === "numeric") return newtonSolve(equations, pair, options);
  const substitution = substitutionSolve(equations, pair);
  if (substitution) return substitution;
  return (
    resultantSquareSolve(equations, pair, options.maxResultantDegree ?? 4) ?? {
      kind: "unsupported",
      reason: "No bounded substitution or resultant strategy applies",
    }
  );
}
