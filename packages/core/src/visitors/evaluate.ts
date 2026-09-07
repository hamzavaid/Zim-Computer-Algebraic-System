import { Expression } from "../ast/types";

export type NumericEnvironment = Readonly<Record<string, number>>;

export function evaluate(expression: Expression, environment: NumericEnvironment = {}): number {
  switch (expression.kind) {
    case "constant":
      return Number(expression.value);
    case "rational":
      return Number(expression.numerator) / Number(expression.denominator);
    case "variable": {
      const value = environment[expression.name];
      if (value === undefined)
        throw new Error(`No numeric value supplied for '${expression.name}'`);
      return value;
    }
    case "unary":
      return expression.operator === "-"
        ? -evaluate(expression.operand, environment)
        : evaluate(expression.operand, environment);
    case "binary": {
      const left = evaluate(expression.left, environment);
      const right = evaluate(expression.right, environment);
      if ((expression.operator === "/" || expression.operator === "%") && right === 0)
        throw new RangeError("Division by zero");
      switch (expression.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
        case "^":
          return left ** right;
      }
      throw new Error("Unsupported binary operator");
    }
    case "function": {
      if (expression.args.length !== 1)
        throw new Error(`Cannot numerically evaluate ${expression.name}/${expression.args.length}`);
      const value = evaluate(expression.args[0]!, environment);
      if (expression.name === "abs") return Math.abs(value);
      if (expression.name === "ln" || expression.name === "log") return Math.log(value);
      if (expression.name === "exp") return Math.exp(value);
      if (expression.name === "sqrt") return Math.sqrt(value);
      throw new Error(`Unsupported numeric function '${expression.name}'`);
    }
  }
}
