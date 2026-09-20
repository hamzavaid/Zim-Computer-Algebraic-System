import { Expression } from "../ast/types";

export interface ComplexValue {
  readonly real: number;
  readonly imaginary: number;
}

export type ComplexEnvironment = Readonly<Record<string, ComplexValue | number>>;

const complex = (real: number, imaginary = 0): ComplexValue => ({ real, imaginary });
const add = (left: ComplexValue, right: ComplexValue): ComplexValue =>
  complex(left.real + right.real, left.imaginary + right.imaginary);
const multiply = (left: ComplexValue, right: ComplexValue): ComplexValue =>
  complex(
    left.real * right.real - left.imaginary * right.imaginary,
    left.real * right.imaginary + left.imaginary * right.real,
  );
const divide = (left: ComplexValue, right: ComplexValue): ComplexValue => {
  const denominator = right.real * right.real + right.imaginary * right.imaginary;
  if (denominator === 0) throw new RangeError("Division by zero");
  return complex(
    (left.real * right.real + left.imaginary * right.imaginary) / denominator,
    (left.imaginary * right.real - left.real * right.imaginary) / denominator,
  );
};

function integerPower(base: ComplexValue, exponent: number): ComplexValue {
  if (exponent < 0) return divide(complex(1), integerPower(base, -exponent));
  let result = complex(1);
  let factor = base;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = multiply(result, factor);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) factor = multiply(factor, factor);
  }
  return result;
}

function complexSquareRoot(value: ComplexValue): ComplexValue {
  const magnitude = Math.hypot(value.real, value.imaginary);
  const real = Math.sqrt(Math.max(0, (magnitude + value.real) / 2));
  const imaginary =
    Math.sign(value.imaginary || 1) * Math.sqrt(Math.max(0, (magnitude - value.real) / 2));
  return complex(real, imaginary);
}

export function evaluateComplex(
  expression: Expression,
  environment: ComplexEnvironment = {},
): ComplexValue {
  if (expression.kind === "constant") return complex(Number(expression.value));
  if (expression.kind === "rational") {
    return complex(Number(expression.numerator) / Number(expression.denominator));
  }
  if (expression.kind === "variable") {
    if (expression.name === "i") return complex(0, 1);
    if (expression.name === "pi") return complex(Math.PI);
    if (expression.name === "e") return complex(Math.E);
    const supplied = environment[expression.name];
    if (supplied === undefined)
      throw new Error(`No complex value supplied for '${expression.name}'`);
    return typeof supplied === "number" ? complex(supplied) : supplied;
  }
  if (expression.kind === "unary") {
    const value = evaluateComplex(expression.operand, environment);
    return expression.operator === "-" ? complex(-value.real, -value.imaginary) : value;
  }
  if (expression.kind === "binary") {
    const left = evaluateComplex(expression.left, environment);
    const right = evaluateComplex(expression.right, environment);
    if (expression.operator === "+") return add(left, right);
    if (expression.operator === "-") return add(left, complex(-right.real, -right.imaginary));
    if (expression.operator === "*") return multiply(left, right);
    if (expression.operator === "/") return divide(left, right);
    if (expression.operator === "%") throw new Error("Complex modulo is undefined");
    if (right.imaginary !== 0 || !Number.isInteger(right.real)) {
      throw new Error("Complex evaluation currently requires integer exponents");
    }
    return integerPower(left, right.real);
  }
  if (expression.args.length !== 1) {
    throw new Error(
      `Cannot evaluate ${expression.name}/${expression.args.length} over complex values`,
    );
  }
  const argument = evaluateComplex(expression.args[0]!, environment);
  if (expression.name === "sqrt") return complexSquareRoot(argument);
  if (expression.name === "abs") return complex(Math.hypot(argument.real, argument.imaginary));
  if (expression.name === "exp") {
    const scale = Math.exp(argument.real);
    return complex(scale * Math.cos(argument.imaginary), scale * Math.sin(argument.imaginary));
  }
  throw new Error(`Unsupported complex function '${expression.name}'`);
}
