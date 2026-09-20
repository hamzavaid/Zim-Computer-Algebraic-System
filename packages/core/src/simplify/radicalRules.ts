import { parts, rational } from "../ast/rational";
import { binary, func } from "../ast/types";
import { RewriteRule } from "./RewriteRule";

function squareParts(value: bigint): readonly [bigint, bigint] {
  let remainder = value;
  let outside = 1n;
  for (let factor = 2n; factor * factor <= remainder; factor++) {
    const square = factor * factor;
    while (remainder % square === 0n) {
      outside *= factor;
      remainder /= square;
    }
  }
  return [outside, remainder];
}

export const radicalReductionRule: RewriteRule = {
  name: "canonical-radical-reduction",
  apply(expression) {
    if (
      expression.kind !== "function" ||
      expression.name !== "sqrt" ||
      expression.args.length !== 1
    )
      return undefined;
    const argument = expression.args[0]!;
    if (argument.kind !== "constant" && argument.kind !== "rational") return undefined;
    const [numerator, denominator] = parts(argument);
    if (numerator < 0n) return undefined;
    const [outsideNumerator, insideNumerator] = squareParts(numerator);
    const [outsideDenominator, insideDenominator] = squareParts(denominator);
    const outside = rational(outsideNumerator, outsideDenominator);
    const inside = rational(insideNumerator, insideDenominator);
    if (outsideNumerator === outsideDenominator) return undefined;
    if (insideNumerator === insideDenominator) return outside;
    return binary("*", outside, func("sqrt", [inside]));
  },
};
