import { isExactNumber, parts } from "../ast/rational";
import { binary, constant, Expression, func, unary } from "../ast/types";
import { format } from "../format/formatter";
import { toLatex } from "../format/latex";
import { simplifyExpression } from "../simplify/simplify";
import { substitute } from "../visitors/substitute";

export interface CalculatorOptions {
  readonly mode?: "exact" | "decimal";
  readonly angleUnit?: "radians" | "degrees";
  readonly precisionDigits?: number;
  readonly answer?: Expression | number;
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

const calculatorFunctions = new Set([
  "abs",
  "ln",
  "log",
  "log10",
  "logb",
  "exp",
  "sqrt",
  "cbrt",
  "sin",
  "cos",
  "tan",
  "factorial",
]);

function unknownSymbol(expression: Expression): string | undefined {
  if (expression.kind === "variable")
    return ["pi", "e", "tau"].includes(expression.name) ? undefined : expression.name;
  if (expression.kind === "unary") return unknownSymbol(expression.operand);
  if (expression.kind === "binary")
    return unknownSymbol(expression.left) ?? unknownSymbol(expression.right);
  if (expression.kind === "function") {
    if (!calculatorFunctions.has(expression.name)) return expression.name;
    for (const argument of expression.args) {
      const unknown = unknownSymbol(argument);
      if (unknown) return unknown;
    }
  }
  return undefined;
}

function factorial(value: bigint): bigint {
  if (value < 0n) throw new InvalidCalculation("Factorial requires a nonnegative integer");
  if (value > 1000n) throw new UnsupportedCalculation("Exact factorial is limited to 1000");
  let result = 1n;
  for (let factor = 2n; factor <= value; factor++) result *= factor;
  return result;
}

function integerLog(value: bigint, base: bigint): bigint | undefined {
  if (value < 1n || base <= 1n) return undefined;
  let power = 1n;
  let exponent = 0n;
  while (power < value) {
    power *= base;
    exponent++;
  }
  return power === value ? exponent : undefined;
}

function exactCalculatorExpression(expression: Expression): Expression {
  let rebuilt: Expression;
  if (expression.kind === "unary")
    rebuilt = unary(expression.operator, exactCalculatorExpression(expression.operand));
  else if (expression.kind === "binary")
    rebuilt = binary(
      expression.operator,
      exactCalculatorExpression(expression.left),
      exactCalculatorExpression(expression.right),
    );
  else if (expression.kind === "function")
    rebuilt = func(expression.name, expression.args.map(exactCalculatorExpression));
  else rebuilt = expression;
  const simplified = simplifyExpression(rebuilt).expression;
  if (simplified.kind !== "function") return simplified;
  if (simplified.name === "factorial" && simplified.args.length === 1) {
    const argument = simplified.args[0]!;
    if (!isExactNumber(argument)) return simplified;
    const [numerator, denominator] = parts(argument);
    if (denominator !== 1n)
      throw new InvalidCalculation("Factorial requires a nonnegative integer");
    return constant(factorial(numerator));
  }
  if ((simplified.name === "ln" || simplified.name === "log") && simplified.args.length === 1) {
    const argument = simplified.args[0]!;
    if (isExactNumber(argument) && parts(argument)[0] === parts(argument)[1]) return constant(0n);
  }
  const logarithm =
    simplified.name === "log10" && simplified.args.length === 1
      ? { value: simplified.args[0]!, base: constant(10n) }
      : simplified.name === "logb" && simplified.args.length === 2
        ? { value: simplified.args[0]!, base: simplified.args[1]! }
        : undefined;
  if (logarithm && isExactNumber(logarithm.value) && isExactNumber(logarithm.base)) {
    const [value, valueDenominator] = parts(logarithm.value);
    const [base, baseDenominator] = parts(logarithm.base);
    if (value <= 0n || base <= 0n || base === baseDenominator)
      throw new InvalidCalculation("Logarithm base and argument are outside the real domain");
    if (valueDenominator === 1n && baseDenominator === 1n) {
      const exponent = integerLog(value, base);
      if (exponent !== undefined) return constant(exponent);
    }
  }
  return simplified;
}

function numericValue(
  expression: Expression,
  angleUnit: "radians" | "degrees",
  answer?: number,
): number {
  if (expression.kind === "constant") return Number(expression.value);
  if (expression.kind === "rational")
    return Number(expression.numerator) / Number(expression.denominator);
  if (expression.kind === "variable") {
    if ((expression.name === "Ans" || expression.name === "ans") && answer !== undefined)
      return answer;
    if (expression.name === "pi") return Math.PI;
    if (expression.name === "e") return Math.E;
    if (expression.name === "tau") return 2 * Math.PI;
    throw new UnsupportedCalculation(`Unknown calculator constant '${expression.name}'`);
  }
  if (expression.kind === "unary") {
    const value = numericValue(expression.operand, angleUnit, answer);
    return expression.operator === "-" ? -value : value;
  }
  if (expression.kind === "binary") {
    const left = numericValue(expression.left, angleUnit, answer);
    const right = numericValue(expression.right, angleUnit, answer);
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
  if (expression.name === "logb") {
    if (expression.args.length !== 2)
      throw new UnsupportedCalculation("logb requires a value and a base");
    const input = numericValue(expression.args[0]!, angleUnit, answer);
    const base = numericValue(expression.args[1]!, angleUnit, answer);
    if (input <= 0 || base <= 0 || base === 1)
      throw new InvalidCalculation("Logarithm base and argument are outside the real domain");
    return Math.log(input) / Math.log(base);
  }
  if (expression.args.length !== 1)
    throw new UnsupportedCalculation(`${expression.name} requires one argument`);
  const input = numericValue(expression.args[0]!, angleUnit, answer);
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
    case "log10":
      if (input <= 0) throw new InvalidCalculation("Logarithms require a positive argument");
      value = Math.log10(input);
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
    case "factorial":
      if (!Number.isInteger(input) || input < 0)
        throw new InvalidCalculation("Factorial requires a nonnegative integer");
      if (input > 170) throw new UnsupportedCalculation("Decimal factorial is limited to 170");
      value = 1;
      for (let factor = 2; factor <= input; factor++) value *= factor;
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
      const unresolvedSymbol = unknownSymbol(expression);
      if (
        typeof options.answer === "number" &&
        (unresolvedSymbol === "Ans" || unresolvedSymbol === "ans")
      )
        return {
          kind: "unsupported",
          reason: "A decimal Ans cannot be promoted to an exact value",
        };
      const withAnswer =
        typeof options.answer === "object"
          ? substitute(substitute(expression, "Ans", options.answer), "ans", options.answer)
          : expression;
      const unknown = unknownSymbol(withAnswer);
      if (unknown) return { kind: "unsupported", reason: `Unknown calculator symbol '${unknown}'` };
      const simplified = exactCalculatorExpression(withAnswer);
      return {
        kind: "exact",
        expression: simplified,
        text: format(simplified),
        latex: toLatex(simplified),
        exact: true,
      };
    } catch (caught) {
      if (caught instanceof UnsupportedCalculation)
        return { kind: "unsupported", reason: caught.message };
      return {
        kind: "invalid",
        reason: caught instanceof Error ? caught.message : "Invalid exact calculation",
      };
    }
  }
  try {
    const answer =
      typeof options.answer === "number"
        ? options.answer
        : options.answer === undefined
          ? undefined
          : numericValue(options.answer, angleUnit);
    const value = numericValue(expression, angleUnit, answer);
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
