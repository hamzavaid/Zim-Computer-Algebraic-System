import { Expression } from "../ast/types";
import { format } from "../format/formatter";
import { toLatex } from "../format/latex";
import { simplifyExpression } from "../simplify/simplify";

export interface CalculatorOptions {
  readonly mode?: "exact" | "decimal";
  readonly angleUnit?: "radians" | "degrees";
  readonly precisionDigits?: number;
}

export type CalculatorResult =
  | {
      readonly kind: "exact";
      readonly expression: Expression;
      readonly text: string;
      readonly latex: string;
      readonly exact: true;
    }
  | {
      readonly kind: "decimal";
      readonly value: number;
      readonly text: string;
      readonly latex: string;
      readonly exact: false;
      readonly angleUnit: "radians" | "degrees";
      readonly precisionDigits: number;
    }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "invalid"; readonly reason: string };

class UnsupportedCalculation extends Error {}
class InvalidCalculation extends Error {}

function numericValue(expression: Expression, angleUnit: "radians" | "degrees"): number {
  if (expression.kind === "constant") return Number(expression.value);
  if (expression.kind === "rational")
    return Number(expression.numerator) / Number(expression.denominator);
  if (expression.kind === "variable") {
    if (expression.name === "pi") return Math.PI;
    if (expression.name === "e") return Math.E;
    if (expression.name === "tau") return 2 * Math.PI;
    throw new UnsupportedCalculation(`Unknown calculator constant '${expression.name}'`);
  }
  if (expression.kind === "unary") {
    const value = numericValue(expression.operand, angleUnit);
    return expression.operator === "-" ? -value : value;
  }
  if (expression.kind === "binary") {
    const left = numericValue(expression.left, angleUnit);
    const right = numericValue(expression.right, angleUnit);
    if ((expression.operator === "/" || expression.operator === "%") && right === 0)
      throw new InvalidCalculation("Division by zero");
    let value: number;
    switch (expression.operator) {
      case "+":
        value = left + right;
        break;
      case "-":
        value = left - right;
        break;
      case "*":
        value = left * right;
        break;
      case "/":
        value = left / right;
        break;
      case "%":
        value = left % right;
        break;
      case "^":
        value = left ** right;
        break;
    }
    if (!Number.isFinite(value)) throw new InvalidCalculation("Result is outside the real domain");
    return value;
  }
  if (expression.args.length !== 1)
    throw new UnsupportedCalculation(`${expression.name} requires one argument`);
  const input = numericValue(expression.args[0]!, angleUnit);
  const angle = angleUnit === "degrees" ? (input * Math.PI) / 180 : input;
  let value: number;
  switch (expression.name) {
    case "abs":
      value = Math.abs(input);
      break;
    case "ln":
    case "log":
      if (input <= 0) throw new InvalidCalculation("Logarithms require a positive argument");
      value = Math.log(input);
      break;
    case "exp":
      value = Math.exp(input);
      break;
    case "sqrt":
      if (input < 0) throw new InvalidCalculation("Square roots require a nonnegative argument");
      value = Math.sqrt(input);
      break;
    case "cbrt":
      value = Math.cbrt(input);
      break;
    case "sin":
      value = Math.sin(angle);
      break;
    case "cos":
      value = Math.cos(angle);
      break;
    case "tan":
      if (Math.abs(Math.cos(angle)) < 1e-15)
        throw new InvalidCalculation("Tangent is undefined at this angle");
      value = Math.tan(angle);
      break;
    default:
      throw new UnsupportedCalculation(`Unsupported calculator function '${expression.name}'`);
  }
  if (!Number.isFinite(value)) throw new InvalidCalculation("Result is outside the real domain");
  return value;
}

function decimalText(value: number, digits: number): string {
  if (Object.is(value, -0) || Math.abs(value) < 10 ** -digits) return "0";
  return Number(value.toPrecision(digits)).toString();
}

export function calculate(
  expression: Expression,
  options: CalculatorOptions = {},
): CalculatorResult {
  const mode = options.mode ?? "exact";
  const angleUnit = options.angleUnit ?? "radians";
  const precisionDigits = options.precisionDigits ?? 12;
  if (!Number.isInteger(precisionDigits) || precisionDigits < 1 || precisionDigits > 15)
    return { kind: "invalid", reason: "precisionDigits must be an integer from 1 to 15" };
  if (mode === "exact") {
    try {
      const simplified = simplifyExpression(expression).expression;
      return {
        kind: "exact",
        expression: simplified,
        text: format(simplified),
        latex: toLatex(simplified),
        exact: true,
      };
    } catch (caught) {
      return {
        kind: "invalid",
        reason: caught instanceof Error ? caught.message : "Invalid exact calculation",
      };
    }
  }
  try {
    const value = numericValue(expression, angleUnit);
    if (!Number.isFinite(value))
      return { kind: "invalid", reason: "Result is outside the numeric range" };
    const text = decimalText(value, precisionDigits);
    return {
      kind: "decimal",
      value,
      text,
      latex: text,
      exact: false,
      angleUnit,
      precisionDigits,
    };
  } catch (caught) {
    if (caught instanceof UnsupportedCalculation)
      return { kind: "unsupported", reason: caught.message };
    return {
      kind: "invalid",
      reason: caught instanceof Error ? caught.message : "Invalid numerical calculation",
    };
  }
}
