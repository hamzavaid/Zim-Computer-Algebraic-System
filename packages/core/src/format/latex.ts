import { Expression, SyntaxTree } from "../ast/types";

const precedence: Readonly<Record<string, number>> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  unary: 3,
  "^": 4,
  atom: 5,
};

function expressionPrecedence(expression: Expression): number {
  if (expression.kind === "binary") return precedence[expression.operator]!;
  if (expression.kind === "unary") return precedence.unary!;
  return precedence.atom!;
}

function render(expression: Expression, parentPrecedence = 0): string {
  let output: string;
  if (expression.kind === "constant") output = expression.value.toString();
  else if (expression.kind === "rational") {
    output = `\\frac{${expression.numerator}}{${expression.denominator}}`;
  } else if (expression.kind === "variable") output = expression.name.replaceAll("_", "\\_");
  else if (expression.kind === "unary") {
    output = `${expression.operator}${render(expression.operand, precedence.unary)}`;
  } else if (expression.kind === "function") {
    const args = expression.args.map((argument) => render(argument)).join(", ");
    if (expression.name === "sqrt" && expression.args.length === 1) output = `\\sqrt{${args}}`;
    else if (expression.name === "abs" && expression.args.length === 1) {
      output = `\\left|${args}\\right|`;
    } else if (["ln", "log", "sin", "cos", "tan", "exp"].includes(expression.name)) {
      output = `\\${expression.name}\\left(${args}\\right)`;
    } else output = `\\operatorname{${expression.name}}\\left(${args}\\right)`;
  } else if (expression.operator === "/") {
    output = `\\frac{${render(expression.left)}}{${render(expression.right)}}`;
  } else if (expression.operator === "^") {
    output = `{${render(expression.left, precedence["^"])}}^{${render(expression.right)}}`;
  } else {
    const operator =
      expression.operator === "*"
        ? " \\cdot "
        : expression.operator === "%"
          ? " \\bmod "
          : ` ${expression.operator} `;
    output = `${render(expression.left, precedence[expression.operator])}${operator}${render(expression.right, precedence[expression.operator])}`;
  }
  return expressionPrecedence(expression) < parentPrecedence ? `\\left(${output}\\right)` : output;
}

export function toLatex(tree: SyntaxTree): string {
  return tree.kind === "equation" ? `${render(tree.left)} = ${render(tree.right)}` : render(tree);
}
