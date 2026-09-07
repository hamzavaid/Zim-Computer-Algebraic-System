import {
  addExact,
  divideExact,
  ExactNumber,
  isExactNumber,
  isZero,
  multiplyExact,
  negateExact,
  rational,
  subtractExact,
} from "../ast/rational";
import { Equation, Expression } from "../ast/types";

interface AffineForm {
  readonly coefficients: ReadonlyMap<string, ExactNumber>;
  readonly constant: ExactNumber;
}

type AffineResult =
  | { readonly kind: "affine"; readonly value: AffineForm }
  | { readonly kind: "unsupported"; readonly reason: string };

export type SystemSolveResult =
  | {
      readonly kind: "unique";
      readonly solution: Readonly<Record<string, Expression>>;
      readonly verified: true;
    }
  | { readonly kind: "infinite"; readonly verified: true }
  | { readonly kind: "no-solution"; readonly verified: true }
  | { readonly kind: "unsupported"; readonly reason: string };

const affine = (
  coefficients: ReadonlyMap<string, ExactNumber>,
  constant: ExactNumber,
): AffineResult => ({ kind: "affine", value: { coefficients, constant } });

function scale(form: AffineForm, factor: ExactNumber): AffineForm {
  return {
    coefficients: new Map(
      [...form.coefficients].map(([name, value]) => [name, multiplyExact(value, factor)]),
    ),
    constant: multiplyExact(form.constant, factor),
  };
}

function combine(left: AffineForm, right: AffineForm, subtract: boolean): AffineForm {
  const coefficients = new Map(left.coefficients);
  for (const [name, value] of right.coefficients) {
    const current = coefficients.get(name) ?? rational(0n);
    coefficients.set(name, subtract ? subtractExact(current, value) : addExact(current, value));
  }
  return {
    coefficients: new Map([...coefficients].filter(([, value]) => !isZero(value))),
    constant: subtract
      ? subtractExact(left.constant, right.constant)
      : addExact(left.constant, right.constant),
  };
}

function toAffine(expression: Expression, variables: ReadonlySet<string>): AffineResult {
  if (isExactNumber(expression)) return affine(new Map(), expression);
  if (expression.kind === "variable") {
    return variables.has(expression.name)
      ? affine(new Map([[expression.name, rational(1n)]]), rational(0n))
      : { kind: "unsupported", reason: `Unexpected variable '${expression.name}'` };
  }
  if (expression.kind === "function") {
    return { kind: "unsupported", reason: `Function '${expression.name}' is not linear` };
  }
  if (expression.kind === "unary") {
    const operand = toAffine(expression.operand, variables);
    if (operand.kind === "unsupported" || expression.operator === "+") return operand;
    return affine(
      new Map(scale(operand.value, rational(-1n)).coefficients),
      negateExact(operand.value.constant),
    );
  }
  if (expression.operator === "+" || expression.operator === "-") {
    const left = toAffine(expression.left, variables);
    if (left.kind === "unsupported") return left;
    const right = toAffine(expression.right, variables);
    if (right.kind === "unsupported") return right;
    const value = combine(left.value, right.value, expression.operator === "-");
    return affine(value.coefficients, value.constant);
  }
  if (expression.operator === "*" || expression.operator === "/") {
    const left = toAffine(expression.left, variables);
    if (left.kind === "unsupported") return left;
    const right = toAffine(expression.right, variables);
    if (right.kind === "unsupported") return right;
    const leftConstant = left.value.coefficients.size === 0;
    const rightConstant = right.value.coefficients.size === 0;
    if (expression.operator === "/") {
      if (!rightConstant || isZero(right.value.constant)) {
        return { kind: "unsupported", reason: "Linear systems require constant denominators" };
      }
      const value = scale(left.value, divideExact(rational(1n), right.value.constant));
      return affine(value.coefficients, value.constant);
    }
    if (!leftConstant && !rightConstant) {
      return { kind: "unsupported", reason: "Products of variables are nonlinear" };
    }
    const value = leftConstant
      ? scale(right.value, left.value.constant)
      : scale(left.value, right.value.constant);
    return affine(value.coefficients, value.constant);
  }
  return { kind: "unsupported", reason: `Operator '${expression.operator}' is not linear` };
}

export function solveSystem(
  equations: readonly Equation[],
  variableNames: readonly string[],
): SystemSolveResult {
  if (equations.length === 0 || variableNames.length === 0) {
    return { kind: "unsupported", reason: "A system requires equations and variables" };
  }
  if (new Set(variableNames).size !== variableNames.length) {
    return { kind: "unsupported", reason: "System variable names must be unique" };
  }
  const invalidVariable = variableNames.find((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name));
  if (invalidVariable) {
    return { kind: "unsupported", reason: `Invalid variable name '${invalidVariable}'` };
  }
  const variableSet = new Set(variableNames);
  const matrix: ExactNumber[][] = [];
  for (const equation of equations) {
    const left = toAffine(equation.left, variableSet);
    if (left.kind === "unsupported") return left;
    const right = toAffine(equation.right, variableSet);
    if (right.kind === "unsupported") return right;
    const difference = combine(left.value, right.value, true);
    matrix.push([
      ...variableNames.map((name) => difference.coefficients.get(name) ?? rational(0n)),
      negateExact(difference.constant),
    ]);
  }

  let pivotRow = 0;
  const pivotColumns: number[] = [];
  for (let column = 0; column < variableNames.length && pivotRow < matrix.length; column++) {
    const candidate = matrix.findIndex((row, index) => index >= pivotRow && !isZero(row[column]!));
    if (candidate < 0) continue;
    [matrix[pivotRow], matrix[candidate]] = [matrix[candidate]!, matrix[pivotRow]!];
    const pivot = matrix[pivotRow]![column]!;
    matrix[pivotRow] = matrix[pivotRow]!.map((value) => divideExact(value, pivot));
    for (let row = 0; row < matrix.length; row++) {
      if (row === pivotRow || isZero(matrix[row]![column]!)) continue;
      const factor = matrix[row]![column]!;
      matrix[row] = matrix[row]!.map((value, index) =>
        subtractExact(value, multiplyExact(factor, matrix[pivotRow]![index]!)),
      );
    }
    pivotColumns.push(column);
    pivotRow++;
  }

  const inconsistent = matrix.some(
    (row) =>
      row.slice(0, variableNames.length).every(isZero) && !isZero(row[variableNames.length]!),
  );
  if (inconsistent) return { kind: "no-solution", verified: true };
  if (pivotColumns.length < variableNames.length) return { kind: "infinite", verified: true };

  const solution: Record<string, Expression> = {};
  pivotColumns.forEach((column, row) => {
    solution[variableNames[column]!] = matrix[row]![variableNames.length]!;
  });
  return { kind: "unique", solution, verified: true };
}
